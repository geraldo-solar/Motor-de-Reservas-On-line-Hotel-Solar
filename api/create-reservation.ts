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

      const formatCurrencyLocal = (val: number) => `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const preCheckInUrl = `https://motor-de-reservas-on-line-hotel-sol.vercel.app/pre-checkin/${reservationId}`;

      const luxuryClientHtml = `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
    
    <div style="background: linear-gradient(135deg, #1a3c34 0%, #2d5a4e 100%); padding: 40px 20px; text-align: center;">
      <img src="https://i.ibb.co/3sBw7xY/solar-logo.png" alt="Hotel Solar" style="height: 120px; margin-bottom: 20px;">
      <h1 style="color: #4ade80; margin: 0; font-size: 28px; font-weight: normal;">✅ Reserva Solicitada!</h1>
      <p style="color: #d4a853; margin: 10px 0 0 0; font-size: 16px;">Obrigado por nos escolher!</p>
    </div>
    
    <div style="background-color: #ffffff; padding: 32px 24px;">
      <p style="color: #1e293b; font-size: 16px; margin: 0 0 24px 0;">Olá <strong>${mainGuest.name}</strong>,</p>
      <p style="color: #475569; font-size: 14px; margin: 0 0 24px 0; line-height: 1.6;">
        Recebemos sua solicitação de reserva no Hotel Solar através do nosso assistente virtual! Para sua comodidade, você já pode agilizar sua chegada realizando o pré-check-in digital.
      </p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${preCheckInUrl}" style="background-color: #1a3c34; color: #d4a853; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">AGILIZAR MEU CHECK-IN AGORA</a>
        <p style="color: #64748b; font-size: 11px; margin-top: 12px;">Preencha seus dados agora e ganhe tempo na recepção!</p>
      </div>
      
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <p style="color: #64748b; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">Número da Reserva</p>
        <p style="color: #d4a853; margin: 0; font-size: 32px; font-weight: bold; letter-spacing: 4px;">${shortId}</p>
      </div>
      
      <div style="margin-bottom: 24px;">
        <h3 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">📋 Detalhes da Reserva</h3>
        <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Check-in:</strong> ${checkIn.split('-').reverse().join('/')}</p>
        <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Check-out:</strong> ${checkOut.split('-').reverse().join('/')}</p>
        <p style="color: #475569; margin: 0;"><strong style="color: #1e293b;">Noites:</strong> ${nights}</p>
      </div>
      
      <div style="margin-bottom: 24px;">
        <h3 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 16px;">🏨 Acomodações</h3>
        <ul style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;">${rooms.map((r: any) => `<li><b>${r.name}</b></li>`).join('')}</ul>
      </div>

      <div style="margin-bottom: 24px;">
        <h3 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 16px;">👥 Acompanhantes</h3>
        <ul style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;">${guestsHtml}</ul>
      </div>

      <div style="margin-bottom: 24px;">
        <h3 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 16px;">➕ Serviços Extras</h3>
        <ul style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;">${extrasHtml}</ul>
      </div>
      
      <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-bottom: 24px;">
        <p style="color: #1e293b; margin: 0; font-size: 18px;">
          <strong>Valor Total:</strong> <span style="color: #1a3c34; font-size: 24px; font-weight: bold;">${formatCurrencyLocal(totalPrice)}</span>
        </p>
      </div>
      
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 24px 0;">
        <h3 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 18px;">💠 Pagamento via PIX (50%)</h3>
        <p style="color: #475569; margin: 0 0 12px 0;">Para garantir sua reserva, realize a transferência de 50% do valor total (<strong style="color: #1a3c34;">${formatCurrencyLocal(totalPrice / 2)}</strong>).</p>
        <div style="background: #ffffff; border: 2px dashed #cbd5e1; padding: 16px; border-radius: 8px; text-align: center; margin-bottom: 16px;">
          <p style="color: #1e293b; margin: 0 0 8px 0; font-weight: bold; font-size: 14px;">CHAVE PIX (CELULAR):</p>
          <p style="color: #d4a853; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 1px;">(91) 98100-0800</p>
          <p style="color: #64748b; margin: 8px 0 0 0; font-size: 12px;">J Ramos Barros Hotelaria e Eventos Me</p>
          <p style="color: #64748b; margin: 2px 0 0 0; font-size: 12px;">CNPJ: 09.519.659/0001-90</p>
        </div>
        <div style="padding: 16px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">
          <p style="color: #166534; margin: 0 0 12px 0; font-weight: bold;">✅ Após realizar a transferência:</p>
          <ol style="color: #166534; margin: 0; padding-left: 20px; line-height: 1.8; font-size: 13px;">
            <li>Envie o comprovante para nosso WhatsApp ou E-mail.</li>
            <li>Sua reserva será confirmada oficialmente.</li>
          </ol>
        </div>
      </div>
      
    </div>
  </div>
</body>
</html>
      `;

      const luxuryHotelHtml = `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 30px 20px; text-align: center; border-bottom: 4px solid #d4a853;">
          <span style="font-size: 40px; display: block; margin-bottom: 10px;">🤖</span>
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: normal;">Nova Pré-Reserva via Chatbot</h1>
          <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px;">Reserva #${shortId}</p>
        </div>
        <div style="padding: 32px 24px;">
          <p style="margin: 0 0 8px 0;"><strong>Hóspede:</strong> ${mainGuest.name}</p>
          <p style="margin: 0 0 8px 0;"><strong>Email:</strong> ${mainGuest.email}</p>
          <p style="margin: 0 0 8px 0;"><strong>Período:</strong> ${checkIn.split('-').reverse().join('/')} a ${checkOut.split('-').reverse().join('/')} (${nights} noites)</p>
          <p style="margin: 0 0 8px 0;"><strong>Valor Total:</strong> ${formatCurrencyLocal(totalPrice)} (Aguardando PIX)</p>
          
          <h4 style="margin: 20px 0 10px 0; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Quartos</h4>
          <ul style="margin: 0; padding-left: 20px;">${rooms.map((r: any) => `<li><b>${r.name}</b></li>`).join('')}</ul>
          
          <h4 style="margin: 20px 0 10px 0; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Extras</h4>
          <ul style="margin: 0; padding-left: 20px;">${extrasHtml}</ul>
          
          <h4 style="margin: 20px 0 10px 0; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Acompanhantes</h4>
          <ul style="margin: 0; padding-left: 20px;">${guestsHtml}</ul>
          
          <h4 style="margin: 20px 0 10px 0; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Observações</h4>
          <p style="background: #f8fafc; padding: 12px; border-radius: 6px;">[CHATBOT] ${observations}</p>
        </div>
  </div>
</body>
</html>
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
        htmlContent: luxuryClientHtml,
      });

      await executeBrevoStictly({
        sender: { name: 'Sistema de Reservas AI', email: hotelEmail },
        to: [{ email: adminEmail, name: 'Administração Hotel Solar' }],
        subject: `🤖 Nova Reserva AI #${shortId} - ${mainGuest.name}`,
        htmlContent: luxuryHotelHtml,
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
