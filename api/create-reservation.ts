import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// VERCEL ESM BUNDLER BYPASS: INLINED TO AVOID SILENT NFT SEGFAULTS
const generateSafeUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const formatCurrency = (value: number): string => {
  if (value === undefined || value === null) return 'R$ 0,00';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return 'R$ 0,00';
  return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

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

    const reservationId = generateSafeUUID();

    const isCreditCard = ['CREDIT_CARD', 'CARTAO_DE_CREDITO', 'CARTÃO DE CRÉDITO', 'CARTAO', 'CARTÃO'].includes((paymentMethod || '').toString().toUpperCase());
    if (isCreditCard) {
      const draftPayload = { id: reservationId, checkIn, checkOut, mainGuest, additionalGuests, observations, extraServices, rooms, totalPrice };
      const base64Draft = Buffer.from(JSON.stringify(draftPayload)).toString('base64');
      const draftUrl = `https://motor-de-reservas-on-line-hotel-sol.vercel.app/?draft=${base64Draft}`;
      return res.status(200).json({ success: true, message: `Link seguro: ${draftUrl}`, paymentLink: draftUrl, isDraft: true });
    }

    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const nights = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    const dataToSave = {
      id: reservationId,
      created_at: new Date().toISOString(),
      check_in: checkIn,
      check_out: checkOut,
      nights: nights,
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
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ success: true, message: 'Passed insert cleanly!', data });
    
  } catch (error: any) {
    console.error('[API/Create-Reservation] Fatal error:', error);
    res.statusCode = 500;
    return res.end('FATAL_SANDBOX_EJECT:' + error.stack);
  }
}
