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

    // Normalize extras for Chatbot payloads which send { name, price } instead of { name, priceSnapshot, quantity }
    const normalizedExtras = extraServices.map((ext: any) => ({
      ...ext,
      quantity: ext.quantity || 1,
      priceSnapshot: ext.priceSnapshot !== undefined ? ext.priceSnapshot : ext.price || 0
    }));

    // Normalize room slugs to UUIDs so PostgreSQL triggers won't crash when receiving 'suite-casal'
    const mapSlugToUUID: Record<string, string> = {
      'suite-sacada-vista-mar': '310811f4-54eb-476c-a0b4-f8cc8574ae79',
      'suite-casal': '835b8136-77a7-499a-b40e-40f61ddd10d8',
      'suite-triplo': '7b27b1f2-c298-45c0-9c31-16cf0096b8ae',
      'suite-quadruplo': '460d8067-58c0-4c02-8adf-a1fc0fe234f7',
      'loft': '4325def4-f1e1-45b2-a653-52a9ba20928b',
      'suite-varanda-terreo': 'd070d42f-5ee0-46a0-9e3b-8f4e8eced9a3'
    };
    
    const normalizedRooms = rooms.map((room: any) => {
      // If the incoming room has an ID that matches the slug, swap it to the UUID
      if (room.id && mapSlugToUUID[room.id]) {
        return { ...room, id: mapSlugToUUID[room.id] };
      }
      return room;
    });

    const reservationId = generateSafeUUID();
    const isCreditCard = ['CREDIT_CARD', 'CARTAO_DE_CREDITO', 'CARTÃO DE CRÉDITO', 'CARTAO', 'CARTÃO'].includes((paymentMethod || '').toString().toUpperCase());

    const extrasTotal = normalizedExtras.reduce((sum: number, ex: any) => sum + (ex.priceSnapshot * ex.quantity), 0);
    const totalPrice = rooms.reduce((sum: number, r: any) => sum + (r.priceSnapshot || 0), 0) + extrasTotal;

    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const nights = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    const accommodationTotal = totalPrice - extrasTotal;
    const ratePerNight = nights > 0 ? accommodationTotal / nights : accommodationTotal;
    const stayDays = [];
    let current = new Date(start);
    while (current < end) {
       stayDays.push({ date: current.toISOString().split('T')[0], price: ratePerNight });
       current.setUTCDate(current.getUTCDate() + 1); // DST Safe Iterator
    }

    if (stayDays.length > 0) {
       normalizedExtras.push({
           id: "daily_breakdown",
           name: "daily_breakdown",
           isBreakdown: true,
           days: stayDays,
           quantity: 1,
           priceSnapshot: 0
       });
    }

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
      rooms: normalizedRooms,
      extras: normalizedExtras,
      total_price: totalPrice,
      payment_method: isCreditCard ? 'CREDIT_CARD' : 'PIX',
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
      const extrasHtml = normalizedExtras?.length ? normalizedExtras.map((e: any) => `<li>${e.name} (${e.quantity}x) - ${formatCurrency(e.priceSnapshot * e.quantity)}</li>`).join('') : '<li>Nenhum extra</li>';

      const formatCurrencyLocal = (val: number) => `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const preCheckInUrl = `https://motor-de-reservas-on-line-hotel-sol.vercel.app/pre-checkin/${reservationId}`;

      const luxuryClientHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
    
    <!-- Header com Logo -->
    <div style="background: linear-gradient(135deg, #1a3c34 0%, #2d5a4e 100%); padding: 40px 20px; text-align: center;">
      <img src="https://motor-de-reservas-on-line-hotel-sol.vercel.app/logo-gold.png" alt="Hotel Solar" style="height: 120px; margin-bottom: 20px;">
      <h1 style="color: #4ade80; margin: 0; font-size: 28px; font-weight: normal;">
        ✅ Reserva Solicitada!
      </h1>
      <p style="color: #d4a853; margin: 10px 0 0 0; font-size: 16px;">
        Obrigado por nos escolher!
      </p>
    </div>
    
    <!-- Conteúdo Principal -->
    <div style="background-color: #ffffff; padding: 32px 24px;">
      
      <!-- Saudação -->
      <p style="color: #1e293b; font-size: 16px; margin: 0 0 24px 0;">
        Olá <strong>${mainGuest.name}</strong>,
      </p>
      <p style="color: #475569; font-size: 14px; margin: 0 0 24px 0; line-height: 1.6;">
        Recebemos sua solicitação de reserva no Hotel Solar através do nosso assistente virtual! Ficamos felizes com sua preferência. Para sua comodidade, você já pode agilizar sua chegada realizando o pré-check-in digital.
      </p>

      <!-- Botão de Pré-Check-in -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${preCheckInUrl}" style="background-color: #1a3c34; color: #d4a853; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">AGILIZAR MEU CHECK-IN AGORA</a>
        <p style="color: #64748b; font-size: 11px; margin-top: 12px;">Preencha seus dados agora e ganhe tempo na recepção!</p>
      </div>
      
      <!-- Número da Reserva -->
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <p style="color: #64748b; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">
          Número da Reserva
        </p>
        <p style="color: #d4a853; margin: 0; font-size: 32px; font-weight: bold; letter-spacing: 4px;">
          ${shortId}
        </p>
      </div>
      
      <!-- Detalhes da Reserva -->
      <div style="margin-bottom: 24px;">
        <h3 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
          📋 Detalhes da Reserva
        </h3>
        <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Check-in:</strong> ${checkIn.split('-').reverse().join('/')}</p>
        <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Check-out:</strong> ${checkOut.split('-').reverse().join('/')}</p>
        <p style="color: #475569; margin: 0;"><strong style="color: #1e293b;">Noites:</strong> ${nights}</p>
      </div>
      
      <!-- Acomodações -->
      <div style="margin-bottom: 24px;">
        <h3 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 16px;">
          🏨 Acomodações
        </h3>
        <ul style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;">
          ${roomsHtml}
        </ul>
      </div>

      <!-- Acompanhantes -->
      <div style="margin-bottom: 24px;">
        <h3 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 16px;">
          👥 Acompanhantes
        </h3>
        <ul style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;">
          ${guestsHtml}
        </ul>
      </div>
      
      <!-- Serviços Extras -->
      <div style="margin-bottom: 24px;">
        <h3 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 16px;">
          ➕ Serviços Extras
        </h3>
        <ul style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;">
          ${extrasHtml}
        </ul>
      </div>
      
      <!-- Observações -->
      ${observations ? `
      <div style="margin-bottom: 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
        <h3 style="color: #1a3c34; margin: 0 0 12px 0; font-size: 16px;">
          📝 Observações
        </h3>
        <p style="color: #475569; margin: 0; font-size: 14px; line-height: 1.6; font-style: italic;">
          "${observations}"
        </p>
      </div>
      ` : ''}
      
      <!-- Valor Total -->
      <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-bottom: 24px;">
        <p style="color: #1e293b; margin: 0; font-size: 18px;">
          <strong>Valor Total:</strong> 
          <span style="color: #1a3c34; font-size: 24px; font-weight: bold;">${formatCurrencyLocal(totalPrice)}</span>
        </p>
      </div>
      
      <!-- Seção de Pagamento -->
      <div style="color: #1e293b">
        <div style="background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 24px 0;">
          <h3 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 18px;">
            📱 Instruções de Pagamento via PIX
          </h3>
          <ol style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;">
            <li>Realize o pagamento via PIX no valor de <strong style="color: #1a3c34;">${formatCurrencyLocal(totalPrice)}</strong></li>
            <li>Envie o comprovante para: <a href="mailto:geraldo@hotelsolar.tur.br" style="color: #d4a853; text-decoration: none;">geraldo@hotelsolar.tur.br</a></li>
            <li>Após recebermos o comprovante, enviaremos a confirmação</li>
          </ol>
        </div>

        <div style="background: #ffffff; border: 2px solid #1a3c34; border-radius: 12px; padding: 24px; margin: 24px 0;">
          <h3 style="color: #1a3c34; margin: 0 0 20px 0; font-size: 18px;">
            📋 Dados para Transferência PIX
          </h3>
          <table style="width: 100%; color: #1e293b; font-size: 14px; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px 0; color: #64748b; width: 45%; border-bottom: 1px solid #f1f5f9;">CHAVE PIX (CELULAR)</td>
              <td style="padding: 10px 0; text-align: right; font-weight: bold; border-bottom: 1px solid #f1f5f9;">(91) 98100-0800</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">BENEFICIÁRIO</td>
              <td style="padding: 10px 0; text-align: right; font-weight: bold; border-bottom: 1px solid #f1f5f9;">J Ramos Barros Hotelaria e Eventos Me</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">CNPJ</td>
              <td style="padding: 10px 0; text-align: right; font-weight: bold; border-bottom: 1px solid #f1f5f9;">09.519.659/0001-90</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">BANCO</td>
              <td style="padding: 10px 0; text-align: right; font-weight: bold; border-bottom: 1px solid #f1f5f9;">Caixa Econômica Federal</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">AGÊNCIA</td>
              <td style="padding: 10px 0; text-align: right; font-weight: bold; border-bottom: 1px solid #f1f5f9;">3632</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">CONTA CORRENTE</td>
              <td style="padding: 10px 0; text-align: right; font-weight: bold; border-bottom: 1px solid #f1f5f9;">386-6</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; color: #1a3c34; font-weight: bold; font-size: 16px;">VALOR TOTAL</td>
              <td style="padding: 12px 0; text-align: right; color: #1a3c34; font-weight: bold; font-size: 20px;">${formatCurrencyLocal(totalPrice)}</td>
            </tr>
          </table>

          <div style="margin-top: 20px; padding: 16px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">
            <p style="color: #166534; margin: 0 0 12px 0; font-weight: bold;">✅ Após realizar a transferência:</p>
            <ol style="color: #166534; margin: 0; padding-left: 20px; line-height: 1.8; font-size: 13px;">
              <li>Envie o comprovante para: <a href="mailto:geraldo@hotelsolar.tur.br" style="color: #1a3c34; font-weight: bold; text-decoration: none;">geraldo@hotelsolar.tur.br</a></li>
              <li>Sua reserva será confirmada em até 24 horas úteis.</li>
            </ol>
          </div>
        </div>

      </div>
      
      <!-- Links -->
      <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
        <a href="https://motor-de-reservas-on-line-hotel-sol.vercel.app/?view=regulamento" style="color: #d4a853; text-decoration: none; font-size: 14px;">
          📄 Política de Reservas e Cancelamento
        </a>
        <p style="color: #64748b; margin: 16px 0 0 0; font-size: 12px;">
          Precisa cancelar sua reserva? 
          <a href="https://motor-de-reservas-on-line-hotel-sol.vercel.app/?view=cancelamento&reserva=${reservationId}" style="color: #ef4444; text-decoration: none;">
            Cancelar Reserva
          </a>
        </p>
      </div>
      
    </div>
    
    <!-- Footer -->
    <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="color: #64748b; margin: 0 0 8px 0; font-size: 13px;">
        Hotel Solar - Belém, PA
      </p>
      <p style="color: #64748b; margin: 0; font-size: 13px;">
        Email: <a href="mailto:reserva@hotelsolar.tur.br" style="color: #d4a853; text-decoration: none;">reserva@hotelsolar.tur.br</a>
      </p>
    </div>
    
  </div>
</body>
</html>
      `;

      const luxuryHotelHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
    
    <!-- Header com Logo -->
    <div style="background: linear-gradient(135deg, #1a3c34 0%, #2d5a4e 100%); padding: 30px 20px; text-align: center;">
      <img src="https://motor-de-reservas-on-line-hotel-sol.vercel.app/logo-gold.png" alt="Hotel Solar" style="height: 100px;">
    </div>
    
    <!-- Linha dourada -->
    <div style="height: 3px; background: linear-gradient(90deg, transparent, #d4a853, transparent);"></div>
    
    <!-- Conteúdo Principal -->
    <div style="background-color: #ffffff; padding: 32px 24px;">
      
      <!-- Título -->
      <h1 style="color: #1a3c34; margin: 0 0 8px 0; font-size: 24px;">
        🔔 Nova Reserva (Via Chatbot AI)
      </h1>
      <p style="color: #64748b; margin: 0 0 24px 0; font-size: 14px;">
        <strong style="color: #1e293b;">Número da Reserva:</strong> ${shortId}
      </p>
      
      <!-- Dados do Hóspede -->
      <div style="margin-bottom: 24px;">
        <h2 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
          Dados do Titular
        </h2>
        <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Nome:</strong> ${mainGuest.name}</p>
        <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Email:</strong> <a href="mailto:${mainGuest.email}" style="color: #d4a853;">${mainGuest.email}</a></p>
        <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Telefone:</strong> ${mainGuest.phone || 'Não informado'}</p>
        <p style="color: #475569; margin: 0;"><strong style="color: #1e293b;">CPF:</strong> ${mainGuest.cpf || 'Não informado'}</p>
      </div>

      <!-- Acompanhantes -->
      <div style="margin-bottom: 24px;">
        <h2 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
          Acompanhantes Cadastrados
        </h2>
        <ul style="color: #475569; margin: 0; padding-left: 20px;">
          ${guestsHtml}
        </ul>
      </div>
      
      <!-- Detalhes da Reserva -->
      <div style="margin-bottom: 24px;">
        <h2 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
          Detalhes da Reserva
        </h2>
        <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Check-in:</strong> ${checkIn.split('-').reverse().join('/')}</p>
        <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Check-out:</strong> ${checkOut.split('-').reverse().join('/')}</p>
        <p style="color: #475569; margin: 0;"><strong style="color: #1e293b;">Noites:</strong> ${nights}</p>
      </div>
      
      <!-- Acomodações -->
      <div style="margin-bottom: 24px;">
        <h3 style="color: #1a3c34; margin: 0 0 12px 0; font-size: 16px;">Acomodações:</h3>
        <ul style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;">
          ${roomsHtml}
        </ul>
      </div>
      
      <!-- Serviços Extras -->
      <div style="margin-bottom: 24px;">
        <h3 style="color: #1a3c34; margin: 0 0 12px 0; font-size: 16px;">Serviços Extras:</h3>
        <ul style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;">
          ${extrasHtml}
        </ul>
      </div>
      
      <!-- Observações do Cliente -->
      ${observations ? `
      <div style="margin-bottom: 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
        <h3 style="color: #1a3c34; margin: 0 0 12px 0; font-size: 16px;">📝 Observações do Cliente:</h3>
        <p style="color: #475569; margin: 0; font-size: 14px; line-height: 1.6; font-style: italic;">
          "${observations}"
        </p>
      </div>
      ` : ''}
      
      <!-- Valor e Pagamento -->
      <div style="margin-bottom: 24px;">
        <p style="color: #1a3c34; margin: 0 0 8px 0; font-size: 16px;">
          <strong>Valor Total:</strong> ${formatCurrencyLocal(totalPrice)}
        </p>
        <p style="color: #475569; margin: 0;">
          <strong style="color: #1e293b;">Forma de Pagamento:</strong> PIX
        </p>
      </div>
      
      <!-- Alerta de Ação -->
      <div style="background: rgba(212, 168, 83, 0.1); border-left: 4px solid #d4a853; padding: 16px; border-radius: 0 8px 8px 0;">
        <p style="color: #d4a853; margin: 0; font-size: 14px;">
          <strong>⚠️ Ação Necessária:</strong> Confirme o pagamento do PIX na Caixa Econômica (bot).
        </p>
      </div>
      
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

      if (!isCreditCard) {
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
    }

    const generatedShortId = reservationId.split('-')[0].toUpperCase();

    if (isCreditCard) {
      const draftUrl = `https://motor-de-reservas-on-line-hotel-sol.vercel.app/?paymentId=${reservationId}`;
      return res.status(200).json({ 
        success: true, 
        message: `Link seguro: ${draftUrl}`, 
        paymentLink: draftUrl, 
        isDraft: true,
        reservationId: reservationId,
        shortId: generatedShortId,
        emailDebug: emailDebugInfo 
      });
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Reserva criada com sucesso e inventário processado.',
      reservationId: reservationId, 
      shortId: generatedShortId,
      data, 
      emailDebug: emailDebugInfo 
    });

  } catch (error: any) {
    console.error('[API/Create-Reservation] Fatal error:', error);
    res.statusCode = 500;
    return res.end('FATAL_SANDBOX_EJECT:' + error.stack);
  }
}
