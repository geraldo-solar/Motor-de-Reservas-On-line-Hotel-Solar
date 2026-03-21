import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { generateUUID } from '../utils/uuid';

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

    const reservationId = generateUUID();

    const isCreditCard = ['CREDIT_CARD', 'CARTAO_DE_CREDITO', 'CARTÃO DE CRÉDITO', 'CARTAO', 'CARTÃO'].includes((paymentMethod || '').toString().toUpperCase());
    
    if (isCreditCard) {
      const draftPayload = {
        id: reservationId,
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
      payment_method: 'PIX',
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

    try {
      if (rooms && rooms.length > 0) {
        for (const roomSnapshot of rooms) {
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

    let emailDebugInfo: any = { attempted: false, skipped_reason: 'no_api_key' };

    // --- ENVIAR EMAILS VIA BREVO COMBATENDO TIMEOUT ---
    const apiKey = process.env.VITE_BREVO_API_KEY || process.env.BREVO_API_KEY;
    if (apiKey) {
      emailDebugInfo = { attempted: true };
      try {
        console.log('[API/Create-Reservation] Enviando e-mails com timeout de 3.5s...');
        
        // AST Bypass
        const { generateClientEmailHTML, generateHotelEmailHTML, HOTEL_CONFIG } = await import('../services/emailService');
        
        const reservationForEmail = {
          ...dataToSave,
          checkIn: dataToSave.check_in,
          checkOut: dataToSave.check_out,
          mainGuest: dataToSave.main_guest,
          additionalGuests: dataToSave.additional_guests,
          totalPrice: dataToSave.total_price,
          paymentMethod: dataToSave.payment_method
        } as any;

        const execFetchWithTimeout = async (payload: any) => {
           let id: any;
           try {
             const controller = new AbortController();
             id = setTimeout(() => controller.abort(), 3500); // 3.5s stricto
             const res = await fetch('https://api.brevo.com/v3/smtp/email', {
               method: 'POST',
               headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
               body: JSON.stringify(payload),
               signal: controller.signal
             });
             clearTimeout(id);
             return res;
           } catch(e) {
             if (id) clearTimeout(id);
             throw e;
           }
        };

        try {
          await execFetchWithTimeout({
            sender: { name: HOTEL_CONFIG.name, email: HOTEL_CONFIG.email },
            to: [{ email: dataToSave.main_guest.email, name: dataToSave.main_guest.name }],
            subject: `Confirmação de Reserva #${reservationId.substring(0,8).toUpperCase()} - Hotel Solar`,
            htmlContent: generateClientEmailHTML(reservationForEmail),
          });
        } catch (e: any) {
          console.error('[API/Create-Reservation] Client Email error', e.message);
        }

        try {
          await execFetchWithTimeout({
            sender: { name: 'Sistema de Reservas AI', email: HOTEL_CONFIG.email },
            to: [{ email: HOTEL_CONFIG.adminEmail, name: 'Administração Hotel Solar' }],
            subject: `🔔 Nova Reserva AI #${reservationId.substring(0,8).toUpperCase()} - ${dataToSave.main_guest.name}`,
            htmlContent: generateHotelEmailHTML(reservationForEmail),
          });
        } catch (e: any) {
          console.error('[API/Create-Reservation] Hotel Email error', e.message);
        }

        emailDebugInfo.statuses = ['Sequencial disparado corretamente'];
        console.log('[API/Create-Reservation] E-mails processados. Event loop liberado.');
      } catch (err: any) {
        emailDebugInfo.crashed = err.message;
        console.error('[API/Create-Reservation] Erro dinâmico emails:', err);
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
    res.statusCode = 500;
    return res.end('FATAL_SANDBOX_EJECT:' + error.stack);
  }
}
