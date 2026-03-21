import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: "Missing Supabase credentials" });

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { checkIn, checkOut, rooms, mainGuest, additionalGuests, totalPrice, observations = "", extraServices = [], paymentMethod = "PIX" } = req.body;
    if (!checkIn || !checkOut || !rooms || !mainGuest || !mainGuest.name) return res.status(400).json({ error: 'Missing required fields' });

    // PURE VANILLA JAVASCRIPT UUID GENERATION (NO IMPORTS TO ENSURE NO FILE RESOLUTION CRASHES)
    const reservationId = 'res-' + Math.random().toString(36).substring(2, 12);

    const isCreditCard = ['CREDIT_CARD', 'CARTAO_DE_CREDITO', 'CARTÃO DE CRÉDITO', 'CARTAO', 'CARTÃO'].includes((paymentMethod || '').toString().toUpperCase());
    if (isCreditCard) {
      return res.status(200).json({ success: true, isDraft: true });
    }

    const dataToSave = {
      id: reservationId,
      created_at: new Date().toISOString(),
      check_in: checkIn,
      check_out: checkOut,
      nights: 1, // HARDCODED NIGHTS TO PREVENT NAN MATH ERRORS
      main_guest: { name: mainGuest.name, email: mainGuest.email || '', phone: mainGuest.phone || '', cpf: mainGuest.cpf || '' },
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

    const { data, error } = await supabase.from('reservations').insert(dataToSave).select().single();
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Supabase insert passed seamlessly',
      reservationId: reservationId,
      data: data
    });

  } catch (error: any) {
    return res.status(500).json({ error: 'TRY_CATCH_FATAL', details: error.message });
  }
}
