import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { generateUUID } from '../utils/uuid';

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

    const reservationId = generateUUID();
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

    // Inventory Decrement
    try {
      if (rooms && rooms.length > 0) {
        for (const roomSnapshot of rooms) {
          const { data: roomTypes } = await supabase.from('room_types').select('*').ilike('name', `%${roomSnapshot.name}%`);
          if (roomTypes && roomTypes.length > 0) {
            const currentRoom = roomTypes[0];
            const updatedOverrides = [...(currentRoom.overrides || [])];
            let current = new Date(checkIn);
            while (current < new Date(checkOut)) {
              const iso = current.toISOString().split('T')[0];
              const ovIndex = updatedOverrides.findIndex(o => o.dateIso === iso);
              if (ovIndex >= 0) {
                updatedOverrides[ovIndex].availableQuantity = Math.max(0, (updatedOverrides[ovIndex].availableQuantity ?? currentRoom.total_quantity) - 1);
              } else {
                updatedOverrides.push({ dateIso: iso, price: currentRoom.base_price, availableQuantity: Math.max(0, (currentRoom.total_quantity || 1) - 1), isClosed: false });
              }
              current.setDate(current.getDate() + 1);
            }
            await supabase.from('room_types').update({ overrides: updatedOverrides }).eq('id', currentRoom.id);
          }
        }
      }
    } catch (invErr) { console.error('Inventory error:', invErr); }

    // Inter-Container Microservice Dispatch (DECOMMISSIONED)
    let emailDebugInfo: any = { 
       attempted: false, 
       skipped_reason: 'email_pipeline_delegated_to_external_proxy_to_prevent_vercel_segfault' 
    };

    return res.status(200).json({ success: true, message: 'Reserva criada!', reservationId, data, emailDebug: emailDebugInfo });

  } catch (error: any) {
    console.error('[API/Create-Reservation] Fatal error:', error);
    res.statusCode = 500;
    return res.end('FATAL_SANDBOX_EJECT:' + error.stack);
  }
}
