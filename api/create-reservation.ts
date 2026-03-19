import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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
      observations = ""
    } = req.body;

    if (!checkIn || !checkOut || !rooms || !mainGuest || !mainGuest.name) {
      return res.status(400).json({ error: 'Missing required fields (checkIn, checkOut, rooms, mainGuest)' });
    }

    // Calculate nights
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Generate unique ID
    const reservationId = crypto.randomUUID();

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
      observations: `[ORIGEM: AI CHATBOT] ${observations}`,
      rooms: rooms,
      extras: [],
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

    return res.status(200).json({ 
      success: true, 
      message: 'Reserva criada com sucesso!',
      reservationId: reservationId,
      data: data
    });

  } catch (error: any) {
    console.error('[API/Create-Reservation] Execution error:', error);
    return res.status(500).json({ error: error.message });
  }
}
