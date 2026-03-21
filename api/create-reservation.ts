import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { generateUUID } from '../utils/uuid';
import { generateClientEmailHTML, generateHotelEmailHTML, HOTEL_CONFIG } from '../services/emailService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Supabase setup moved inside handler to prevent Top-Level crashes
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    return res.status(500).json({ error: "Missing Supabase credentials" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { 
      checkIn, 
      checkOut, 
      rooms, 
      mainGuest, 
      additionalGuests, 
      totalPrice, 
      observations = "",
      extraServices = [],
      paymentMethod = "PIX"
    } = req.body;

    if (!checkIn || !checkOut || !rooms || !mainGuest || !mainGuest.name) {
      return res.status(400).json({ error: 'Missing required fields (checkIn, checkOut, rooms, mainGuest)' });
    }

    // Generate unique ID
    const reservationId = generateUUID();

    // If Credit Card, do NOT insert yet. Return a magic checkout link.
    const isCreditCard = ['CREDIT_CARD', 'CARTAO_DE_CREDITO', 'CARTÃO DE CRÉDITO', 'CARTAO', 'CARTÃO'].includes((paymentMethod || '').toString().toUpperCase());
    
    if (isCreditCard) {
      const draftPayload = {
        id: reservationId, // Assign a pre-generated ID
        checkIn,
        checkOut,
        mainGuest,
        additionalGuests,
        observations,
        extraServices,
        rooms,
        totalPrice
      };
      
      const base64Draft = Buffer.from(JSON.stringify(draftPayload)).toString('base64');
      const draftUrl = `https://motor-de-reservas-on-line-hotel-sol.vercel.app/?draft=${base64Draft}`;
      
      return res.status(200).json({
        success: true,
        message: `Por favor, realize o pagamento no cartão de crédito acessando o link seguro: ${draftUrl}`,
        paymentLink: draftUrl,
        isDraft: true
      });
    }

    // Calculate nights for PIX
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const dataToSave = {
      id: reservationId,
      created_at: new Date().toISOString(),
      check_in: checkIn,
      check_out: checkOut,
      nights: nights,
      main_guest: {
        name: mainGuest.name,
        email: mainGuest.email || '',
        phone: mainGuest.phone || '',
        cpf: mainGuest.cpf || ''
      },
      additional_guests: additionalGuests || [],
      discount_applied: null,
      package_discount_applied: null,
      observations: `[ORIGEM: AI CHATBOT] ${observations}`,
      rooms: rooms,
      extras: extraServices,
      total_price: totalPrice,
      payment_method: 'PIX', // Default
      status: 'PENDING'
    };

    console.log('[API/Create-Reservation] Inserting:', dataToSave);

    const { data, error } = await supabase
      .from('reservations')
      .insert(dataToSave)
      .select()
      .single();

    if (error) {
      console.error('[API/Create-Reservation] Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }

    // --- SINCRONIZAÇÃO DE INVENTÁRIO (DECREMENTO) ---
    try {
      if (rooms && rooms.length > 0) {
        for (const roomSnapshot of rooms) {
          // Achar a categoria pelo nome (pois a IA não envia UUID)
          const { data: roomTypes } = await supabase
             .from('room_types')
             .select('*')
             .ilike('name', `%${roomSnapshot.name}%`);
          
          if (roomTypes && roomTypes.length > 0) {
            const currentRoom = roomTypes[0];
            const checkInDate = new Date(checkIn);
            const checkOutDate = new Date(checkOut);
            const updatedOverrides = [...(currentRoom.overrides || [])];

            let current = new Date(checkInDate);
            while (current < checkOutDate) {
              const iso = current.toISOString().split('T')[0];
              const ovIndex = updatedOverrides.findIndex(o => o.dateIso === iso);

              if (ovIndex >= 0) {
                const currentQty = updatedOverrides[ovIndex].availableQuantity ?? currentRoom.total_quantity;
                updatedOverrides[ovIndex] = {
                  ...updatedOverrides[ovIndex],
                  availableQuantity: Math.max(0, currentQty - 1)
                };
              } else {
                updatedOverrides.push({
                  dateIso: iso,
                  price: currentRoom.base_price,
                  availableQuantity: Math.max(0, (currentRoom.total_quantity || 1) - 1),
                  isClosed: false
                });
              }
              current.setDate(current.getDate() + 1);
            }
            await supabase.from('room_types').update({ overrides: updatedOverrides }).eq('id', currentRoom.id);
            console.log(`[API/Create-Reservation] Estoque decrescido para: ${currentRoom.name}`);
          }
        }
      }
    } catch (invErr) {
      console.error('[API/Create-Reservation] Erro ao decrementar estoque:', invErr);
    }
    // --- FIM DA SINCRONIZAÇÃO ---

    let emailDebugInfo: any = { attempted: false, skipped_reason: 'no_api_key' };

    // --- ENVIAR EMAILS VIA BREVO ---
    const apiKey = process.env.VITE_BREVO_API_KEY || process.env.BREVO_API_KEY;
    if (apiKey) {
      emailDebugInfo = { attempted: true };
      try {
        console.log('[API/Create-Reservation] Enviando e-mails...');
        
        // Formatar objeto reservation para o template
        const reservationForEmail = {
          ...dataToSave,
          checkIn: dataToSave.check_in,
          checkOut: dataToSave.check_out,
          mainGuest: dataToSave.main_guest,
          additionalGuests: dataToSave.additional_guests,
          totalPrice: dataToSave.total_price,
          paymentMethod: dataToSave.payment_method
        } as any;

        const emailPromises = [
          // Email para o Cliente
          fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
            body: JSON.stringify({
              sender: { name: HOTEL_CONFIG.name, email: HOTEL_CONFIG.email },
              to: [{ email: dataToSave.main_guest.email, name: dataToSave.main_guest.name }],
              subject: `Confirmação de Reserva #${reservationId.substring(0,8).toUpperCase()} - Hotel Solar`,
              htmlContent: generateClientEmailHTML(reservationForEmail),
            }),
          }),
          // Email para o Hotel
          fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
            body: JSON.stringify({
              sender: { name: 'Sistema de Reservas AI', email: HOTEL_CONFIG.email },
              to: [{ email: HOTEL_CONFIG.adminEmail, name: 'Administração Hotel Solar' }],
              subject: `🔔 Nova Reserva AI #${reservationId.substring(0,8).toUpperCase()} - ${dataToSave.main_guest.name}`,
              htmlContent: generateHotelEmailHTML(reservationForEmail),
            }),
          })
        ];

        const emailResponses = await Promise.allSettled(emailPromises);
        let statuses: any[] = [];
        
        for (let i = 0; i < emailResponses.length; i++) {
          const promiseResult = emailResponses[i];
          if (promiseResult.status === 'fulfilled') {
             const resFetch = promiseResult.value;
             const text = await resFetch.text();
             statuses.push({ ok: resFetch.ok, status: resFetch.status, text });
             if (!resFetch.ok) {
                console.error('[API/Create-Reservation] Email failed with status:', resFetch.status, text);
                await supabase.from('reservations').update({ observations: dataToSave.observations + ' | BREVO_ERROR: ' + text }).eq('id', reservationId);
             }
          } else {
             statuses.push({ promise_rejected: true, reason: String(promiseResult.reason) });
             console.error('[API/Create-Reservation] Promise rejected:', promiseResult.reason);
             await supabase.from('reservations').update({ observations: dataToSave.observations + ' | PROMISE_ERROR: ' + String(promiseResult.reason) }).eq('id', reservationId);
          }
        }
        
        emailDebugInfo.statuses = statuses;
        console.log('[API/Create-Reservation] E-mails enviados.');
      } catch (err: any) {
        emailDebugInfo.crashed = err.message;
        console.error('[API/Create-Reservation] Erro ao enviar emails:', err);
        await supabase.from('reservations').update({ observations: dataToSave.observations + ' | TRY_CATCH_ERROR: ' + err.message }).eq('id', reservationId);
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Reserva criada com sucesso!',
      reservationId: reservationId,
      data: data,
      emailDebug: emailDebugInfo
    });

  } catch (error: any) {
    console.error('[API/Create-Reservation] Execution error:', error);
    return res.status(500).json({ error: error.message });
  }
}
