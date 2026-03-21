import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
// import { generateUUID } from '../utils/uuid';
// import { generateClientEmailHTML, generateHotelEmailHTML, HOTEL_CONFIG } from '../services/emailService';

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

  // TEST LEVEL 1: Check if basic handler runs despite all top-level imports existing.
  if (req.body?.testLevel === 1) {
    return res.status(200).json({ status: 'ok', level: 1 });
  }

  // Supabase setup moved inside handler to prevent Top-Level crashes
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    return res.status(500).json({ error: "Missing Supabase credentials" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // TEST LEVEL 2: Supabase client instantiated successfully without hanging Vercel
  if (req.body?.testLevel === 2) {
    return res.status(200).json({ status: 'ok', level: 2 });
  }

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
    const reservationId = 'res-' + Math.random().toString(36).substring(2, 10);

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

    if (req.body?.testLevel === 4) {
      return res.status(200).json({ status: 'ok', level: 4, supabaseData: data });
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

    console.log('[API/Create-Reservation] Transpiler survived up to email payload parsing.');
    return res.status(200).json({ status: 'transpiler_passed_db_block', dataToSave });

  } catch (error: any) {
    res.statusCode = 500;
    return res.end('FATAL_SANDBOX_EJECT:' + error.stack);
  }
}
