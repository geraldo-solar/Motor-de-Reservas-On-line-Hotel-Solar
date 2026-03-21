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
      const draftUrl = `https://motor-de-reservas-on-line-hotel-sol.vercel.app/?draft=${encodeURIComponent(base64Draft)}`;
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
            let loopGuard = 0;
            
            while (current < new Date(checkOut) && loopGuard < 100) {
              const iso = current.toISOString().split('T')[0];
              const ovIndex = updatedOverrides.findIndex(o => o.dateIso === iso);
              if (ovIndex >= 0) {
                updatedOverrides[ovIndex].availableQuantity = Math.max(0, (updatedOverrides[ovIndex].availableQuantity ?? currentRoom.total_quantity) - 1);
              } else {
                updatedOverrides.push({ dateIso: iso, price: currentRoom.base_price, availableQuantity: Math.max(0, (currentRoom.total_quantity || 1) - 1), isClosed: false });
              }
              current.setUTCDate(current.getUTCDate() + 1); // DST Safe Iterator
              loopGuard++;
            }
            await supabase.from('room_types').update({ overrides: updatedOverrides }).eq('id', currentRoom.id);
          }
        }
      }
    } catch (invErr) { console.error('Inventory error:', invErr); }

    // FAST INLINE EMAIL PIPELINE (NO EXTERNAL FILE IMPORTS ALLOWED)
    let emailDebugInfo: any = { attempted: false };
    const apiKey = process.env.VITE_BREVO_API_KEY || process.env.BREVO_API_KEY;
    if (apiKey) {
      emailDebugInfo = { attempted: true };
      
      const adminEmail = 'reserva@hotelsolar.tur.br';
      const hotelEmail = 'geraldo@hotelsolar.tur.br';
      const shortId = reservationId.replace('RES-', '').replace(/-/g, '').substring(0, 8).toUpperCase();
      
      const roomsHtml = rooms.map((r: any) => `<li><b>${r.name}</b> - ${formatCurrency(r.priceSnapshot)}</li>`).join('');
      const guestsHtml = additionalGuests?.length ? additionalGuests.map((g: any) => `<li>${g.name} (${g.age || '-'})</li>`).join('') : '<li>Nenhum hóspede adicional</li>';
      const extrasHtml = extraServices?.length ? extraServices.map((e: any) => `<li>${e.name} (${e.quantity}x)</li>`).join('') : '<li>Nenhum extra</li>';

      const simpleClientHtml = `
        <html><body style="font-family: sans-serif; background: #fff; padding: 20px;">
          <h2 style="color: #1a3c34;">Sua pré-reserva #RES-${shortId} foi solicitada!</h2>
          <p>Olá ${mainGuest.name}, recebemos sua solicitação!</p>
          <p><b>Check-in:</b> ${checkIn} | <b>Check-out:</b> ${checkOut} (${nights} noites)</p>
          <h4>Quartos</h4><ul>${roomsHtml}</ul>
          <h4>Acompanhantes</h4><ul>${guestsHtml}</ul>
          <h4>Serviços Extras</h4><ul>${extrasHtml}</ul>
          <p><b>Valor Total a Pagar:</b> ${formatCurrency(totalPrice)}</p>
          <hr/>
          <h3 style="color:#d4a853">Por favor realize o pagamento na chave PIX: (91) 98100-0800</h3>
          <p>J Ramos Barros Hotelaria e Eventos Me (CNPJ: 09.519.659/0001-90)</p>
          <p>Após o pagamento, envie o comprovante para este e-mail.</p>
        </body></html>
      `;

      const simpleHotelHtml = `
        <html><body style="font-family: sans-serif; background: #f8fafc; padding: 20px;">
          <h2 style="color: #1a3c34;">Nova Reserva via AI Bot #RES-${shortId}</h2>
          <p><b>Hóspede:</b> ${mainGuest.name} (${mainGuest.email} - CPF: ${mainGuest.cpf})</p>
          <p><b>Valor:</b> ${formatCurrency(totalPrice)} (${paymentMethod})</p>
          <p><b>Período:</b> ${checkIn} a ${checkOut} (${nights} noites)</p>
          <h4>Quartos</h4><ul>${roomsHtml}</ul>
          <h4>Serviços Extras</h4><ul>${extrasHtml}</ul>
          <h4>Acompanhantes</h4><ul>${guestsHtml}</ul>
          <h4>Observações</h4><p>${observations}</p>
        </body></html>
      `;

      const executeBrevoStictly = async (payload: any) => {
         let id: any;
         try {
           const controller = new AbortController();
           id = setTimeout(() => controller.abort(), 3500);
           const res = await fetch('https://api.brevo.com/v3/smtp/email', {
             method: 'POST',
             headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
             body: JSON.stringify(payload),
             signal: controller.signal
           });
           
           const text = await res.text();
           clearTimeout(id);
           
           emailDebugInfo.statuses.push(`[Brevo API] Status: ${res.status} | Body: ${text}`);
         } catch(e: any) {
           if (id) clearTimeout(id);
           console.error('Brevo network fail:', e);
           emailDebugInfo.statuses.push(`[Brevo Catch] Network Fail: ${e.message}`);
         }
      };

      emailDebugInfo.statuses = [];

      await executeBrevoStictly({
        sender: { name: 'Hotel Solar', email: hotelEmail },
        to: [{ email: mainGuest.email || 'geraldo@hotelsolar.tur.br', name: mainGuest.name }],
        subject: `Confirmação de Reserva #${shortId} - Hotel Solar`,
        htmlContent: simpleClientHtml,
      });

      await executeBrevoStictly({
        sender: { name: 'Sistema de Reservas AI', email: hotelEmail },
        to: [{ email: adminEmail, name: 'Administração Hotel Solar' }],
        subject: `🔔 Nova Reserva AI #${shortId} - ${mainGuest.name}`,
        htmlContent: simpleHotelHtml,
      });
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Reserva criada com sucesso e inventário processado.',
      reservationId: reservationId, 
      data, 
      emailDebug: emailDebugInfo 
    });

  } catch (error: any) {
    console.error('[API/Create-Reservation] Fatal error:', error);
    res.statusCode = 500;
    return res.end('FATAL_SANDBOX_EJECT:' + error.stack);
  }
}
