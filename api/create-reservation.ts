import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { generateUUID } from '../utils/uuid';
// import { generateClientEmailHTML, generateHotelEmailHTML, HOTEL_CONFIG } from '../services/emailService';

// Supabase setup
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
// We use the anon key since we're inserting a new reservation (usually allowed by RLS, or we can use service role if available)
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
}

const supabase = createClient(supabaseUrl!, supabaseKey!);

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
        id: reservationId, // Assign a pre-generated ID so it doesn't double-insert later
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
    // DISABLED FOR DEBUGGING VERCEL FUNCTION INVOCATION FAILED CRASH
    // try {
    //   if (rooms && rooms.length > 0) {
    // ...
    //   }
    // } catch (invErr) {
    //   console.error('[API/Create-Reservation] Erro ao decrementar estoque:', invErr);
    // }
    // --- FIM DA SINCRONIZAÇÃO ---

    let emailDebugInfo: any = { attempted: false, skipped_reason: 'no_api_key' };

    // --- ENVIAR EMAILS VIA BREVO ---
    // DISABLED FOR VERCEL FUNCTION CRASH DEBUGGING
    // const apiKey = process.env.VITE_BREVO_API_KEY || process.env.BREVO_API_KEY;
    // if (apiKey) { ... }

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
