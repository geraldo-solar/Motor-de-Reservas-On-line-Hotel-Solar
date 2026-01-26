// Serviço de envio de e-mails via Brevo (Sendinblue)

import { Reservation } from '../types';
import { sendManychatNotification } from './manychatService';

// API Key deve ser configurada como variável de ambiente na Vercel
const BREVO_API_KEY = import.meta.env.VITE_BREVO_API_KEY || '';
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

// Configurações do Hotel
const HOTEL_CONFIG = {
  name: 'Hotel Solar',
  email: 'geraldo@hotelsolar.tur.br',
  adminEmail: 'reserva@hotelsolar.tur.br',
  phone: '(91) 98100-0800',
  address: 'Belém, PA',
  logoUrl: 'https://motor-de-reservas-on-line-hotel-sol.vercel.app/logo-gold.png',
  regulamentoUrl: 'https://motor-de-reservas-on-line-hotel-sol.vercel.app/?view=regulamento',
  erpUrl: 'https://hotel-solar-erp.vercel.app', // URL do ERP para o pré-check-in
  // Dados PIX
  pix: {
    chave: '(91) 98100-0800',
    beneficiario: 'J Ramos Barros Hotelaria e Eventos Me',
    cnpj: '09.519.659/0001-90',
    banco: 'Caixa Econômica Federal',
    agencia: '3632',
    conta: '386-6',
    operacao: '003'
  }
};

// Formatar data para exibição sem erro de fuso horário
const formatDate = (dateStr: string): string => {
  if (!dateStr) return '---';
  try {
    // Se a data vier no formato YYYY-MM-DD, adicionamos o horário de meio-dia
    // para evitar que o fuso horário mude a data para o dia anterior.
    const normalizedStr = dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`;
    const date = new Date(normalizedStr);
    return date.toLocaleDateString('pt-BR');
  } catch {
    return dateStr;
  }
};

// Formatar valor em reais
const formatCurrency = (value: number): string => {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Gerar número da reserva curto (8 caracteres) - funciona com UUID ou RES-xxx
const getShortReservationId = (id: string): string => {
  // Remove prefixo RES- se existir, remove hífens do UUID, e pega os primeiros 8 caracteres
  return id.replace('RES-', '').replace(/-/g, '').substring(0, 8).toUpperCase();
};

// Template de e-mail para o cliente
const generateClientEmailHTML = (reservation: Reservation): string => {
  const shortId = getShortReservationId(reservation.id);
  const isPix = reservation.paymentMethod === 'PIX';

  // Gerar lista de acomodações
  const roomsHTML = reservation.rooms.map(room => {
    return `
      <li style="margin-bottom: 8px;">
        <strong style="color: #1a3c34;">${room.name}</strong> - ${formatCurrency(room.priceSnapshot)}
      </li>
    `;
  }).join('');

  // Gerar lista de extras
  const extrasHTML = reservation.extras.length > 0
    ? reservation.extras.map(extra => `
        <li style="margin-bottom: 4px;">
          ${extra.name} (${extra.quantity}x) - ${formatCurrency(extra.priceSnapshot * extra.quantity)}
        </li>
      `).join('')
    : '<li style="color: #666;">Nenhum serviço extra</li>';

  // Seção de pagamento
  let paymentSection = '';
  if (isPix) {
    paymentSection = `
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 24px 0;">
        <h3 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 18px;">
          📱 Instruções de Pagamento via PIX
        </h3>
        <ol style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;">
          <li>Realize o pagamento via PIX no valor de <strong style="color: #1a3c34;">${formatCurrency(reservation.totalPrice)}</strong></li>
          <li>Envie o comprovante para: <a href="mailto:${HOTEL_CONFIG.email}" style="color: #d4a853; text-decoration: none;">${HOTEL_CONFIG.email}</a></li>
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
            <td style="padding: 10px 0; text-align: right; font-weight: bold; border-bottom: 1px solid #f1f5f9;">${HOTEL_CONFIG.pix.chave}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">BENEFICIÁRIO</td>
            <td style="padding: 10px 0; text-align: right; font-weight: bold; border-bottom: 1px solid #f1f5f9;">${HOTEL_CONFIG.pix.beneficiario}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">CNPJ</td>
            <td style="padding: 10px 0; text-align: right; font-weight: bold; border-bottom: 1px solid #f1f5f9;">${HOTEL_CONFIG.pix.cnpj}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">BANCO</td>
            <td style="padding: 10px 0; text-align: right; font-weight: bold; border-bottom: 1px solid #f1f5f9;">${HOTEL_CONFIG.pix.banco}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">AGÊNCIA</td>
            <td style="padding: 10px 0; text-align: right; font-weight: bold; border-bottom: 1px solid #f1f5f9;">${HOTEL_CONFIG.pix.agencia}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">CONTA CORRENTE</td>
            <td style="padding: 10px 0; text-align: right; font-weight: bold; border-bottom: 1px solid #f1f5f9;">${HOTEL_CONFIG.pix.conta}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0; color: #1a3c34; font-weight: bold; font-size: 16px;">VALOR TOTAL</td>
            <td style="padding: 12px 0; text-align: right; color: #1a3c34; font-weight: bold; font-size: 20px;">${formatCurrency(reservation.totalPrice)}</td>
          </tr>
        </table>
        
        <div style="margin-top: 20px; padding: 16px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">
          <p style="color: #166534; margin: 0 0 12px 0; font-weight: bold;">✅ Após realizar a transferência:</p>
          <ol style="color: #166534; margin: 0; padding-left: 20px; line-height: 1.8; font-size: 13px;">
            <li>Envie o comprovante para: <a href="mailto:${HOTEL_CONFIG.email}" style="color: #1a3c34; font-weight: bold; text-decoration: none;">${HOTEL_CONFIG.email}</a></li>
            <li>Sua reserva será confirmada em até 24 horas úteis.</li>
          </ol>
        </div>
      </div>
    `;
  } else {
    const installmentsText = reservation.cardDetails?.installments && reservation.cardDetails.installments > 1
      ? `em ${reservation.cardDetails.installments}x`
      : 'à vista';
    paymentSection = `
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 24px 0;">
        <h3 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 18px;">
          💳 Pagamento via Cartão de Crédito
        </h3>
        <p style="color: #475569; margin: 0;">
          Pagamento ${installmentsText} no valor de <strong style="color: #1a3c34;">${formatCurrency(reservation.totalPrice)}</strong>
        </p>
        <p style="color: #64748b; margin: 12px 0 0 0; font-size: 13px;">
          Aguarde a confirmação do processamento do pagamento.
        </p>
      </div>
    `;
  }

  // O Link de Pré-Check-in agora aponta para o Próprio Motor de Reservas
  const preCheckInUrl = `https://motor-de-reservas-on-line-hotel-sol.vercel.app/pre-checkin/${reservation.id}`;

  return `
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
      <img src="${HOTEL_CONFIG.logoUrl}" alt="Hotel Solar" style="height: 120px; margin-bottom: 20px;">
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
        Olá <strong>${reservation.mainGuest.name}</strong>,
      </p>
      <p style="color: #475569; font-size: 14px; margin: 0 0 24px 0; line-height: 1.6;">
        Recebemos sua solicitação de reserva no Hotel Solar! Ficamos felizes com sua preferência. Para sua comodidade, você já pode agilizar sua chegada realizando o pré-check-in digital.
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
        <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Check-in:</strong> ${formatDate(reservation.checkIn)}</p>
        <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Check-out:</strong> ${formatDate(reservation.checkOut)}</p>
        <p style="color: #475569; margin: 0;"><strong style="color: #1e293b;">Noites:</strong> ${reservation.nights}</p>
      </div>
      
      <!-- Acomodações -->
      <div style="margin-bottom: 24px;">
        <h3 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 16px;">
          🏨 Acomodações
        </h3>
        <ul style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;">
          ${roomsHTML}
        </ul>
      </div>
      
      <!-- Serviços Extras -->
      <div style="margin-bottom: 24px;">
        <h3 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 16px;">
          ➕ Serviços Extras
        </h3>
        <ul style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;">
          ${extrasHTML}
        </ul>
      </div>
      
      <!-- Observações -->
      ${reservation.observations ? `
      <div style="margin-bottom: 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
        <h3 style="color: #1a3c34; margin: 0 0 12px 0; font-size: 16px;">
          📝 Observações
        </h3>
        <p style="color: #475569; margin: 0; font-size: 14px; line-height: 1.6; font-style: italic;">
          "${reservation.observations}"
        </p>
      </div>
      ` : ''}
      
      <!-- Valor Total -->
      <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-bottom: 24px;">
        ${reservation.discountApplied ? `
        <p style="color: #16a34a; margin: 0 0 8px 0; font-size: 14px;">
          <strong>Cupom (${reservation.discountApplied.code}):</strong> - ${formatCurrency(reservation.discountApplied.amount)}
        </p>
        ` : ''}
        ${reservation.packageDiscountApplied ? `
        <p style="color: #16a34a; margin: 0 0 8px 0; font-size: 14px;">
          <strong>Desconto Pacote (${reservation.packageDiscountApplied.percentage}%):</strong> - ${formatCurrency(reservation.packageDiscountApplied.amount)}
        </p>
        ` : ''}
        <p style="color: #1e293b; margin: 0; font-size: 18px;">
          <strong>Valor Total:</strong> 
          <span style="color: #1a3c34; font-size: 24px; font-weight: bold;">${formatCurrency(reservation.totalPrice)}</span>
        </p>
      </div>
      
      <!-- Seção de Pagamento -->
      <div style="color: #1e293b">
        ${paymentSection.replace(/color: #fff/g, 'color: #1e293b').replace(/color: #ccc/g, 'color: #475569').replace(/background: rgba\(255,255,255,0.1\)/g, 'background: #f1f5f9')}
      </div>
      
      <!-- Links -->
      <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
        <a href="${HOTEL_CONFIG.regulamentoUrl}" style="color: #d4a853; text-decoration: none; font-size: 14px;">
          📄 Política de Reservas e Cancelamento
        </a>
        <p style="color: #64748b; margin: 16px 0 0 0; font-size: 12px;">
          Precisa cancelar sua reserva? 
          <a href="https://motor-de-reservas-on-line-hotel-sol.vercel.app/?view=cancelamento&reserva=${reservation.id}" style="color: #ef4444; text-decoration: none;">
            Cancelar Reserva
          </a>
        </p>
      </div>
      
    </div>
    
    <!-- Footer -->
    <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="color: #64748b; margin: 0 0 8px 0; font-size: 13px;">
        ${HOTEL_CONFIG.name} - ${HOTEL_CONFIG.address}
      </p>
      <p style="color: #64748b; margin: 0; font-size: 13px;">
        Email: <a href="mailto:${HOTEL_CONFIG.adminEmail}" style="color: #d4a853; text-decoration: none;">${HOTEL_CONFIG.adminEmail}</a>
      </p>
    </div>
    
  </div>
</body>
</html>
  `;
};

// Template de e-mail para o hotel (notificação de nova reserva)
const generateHotelEmailHTML = (reservation: Reservation): string => {
  const shortId = getShortReservationId(reservation.id);

  // Determinar forma de pagamento
  let paymentMethodText = 'PIX';
  if (reservation.paymentMethod === 'CREDIT_CARD') {
    const installments = reservation.cardDetails?.installments || 1;
    paymentMethodText = installments > 1
      ? `Cartão de Crédito (${installments}x)`
      : 'Cartão de Crédito (à vista)';
  }

  // Gerar lista de acomodações
  const roomsHTML = reservation.rooms.map(room => `
    <li style="margin-bottom: 4px;">${room.name} - ${formatCurrency(room.priceSnapshot)}</li>
  `).join('');

  // Gerar lista de extras
  const extrasHTML = reservation.extras.length > 0
    ? reservation.extras.map(extra => `
        <li style="margin-bottom: 4px;">${extra.name} (${extra.quantity}x) - ${formatCurrency(extra.priceSnapshot * extra.quantity)}</li>
      `).join('')
    : '<li>Nenhum serviço extra</li>';

  return `
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
      <img src="${HOTEL_CONFIG.logoUrl}" alt="Hotel Solar" style="height: 100px;">
    </div>
    
    <!-- Linha dourada -->
    <div style="height: 3px; background: linear-gradient(90deg, transparent, #d4a853, transparent);"></div>
    
    <!-- Conteúdo Principal -->
    <div style="background-color: #ffffff; padding: 32px 24px;">
      
      <!-- Título -->
      <h1 style="color: #1a3c34; margin: 0 0 8px 0; font-size: 24px;">
        🔔 Nova Reserva
      </h1>
      <p style="color: #64748b; margin: 0 0 24px 0; font-size: 14px;">
        <strong style="color: #1e293b;">Número da Reserva:</strong> ${shortId}
      </p>
      
      <!-- Dados do Hóspede -->
      <div style="margin-bottom: 24px;">
        <h2 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
          Dados do Hóspede
        </h2>
        <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Nome:</strong> ${reservation.mainGuest.name}</p>
        <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Email:</strong> <a href="mailto:${reservation.mainGuest.email}" style="color: #d4a853;">${reservation.mainGuest.email}</a></p>
        <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Telefone:</strong> ${reservation.mainGuest.phone}</p>
        <p style="color: #475569; margin: 0;"><strong style="color: #1e293b;">CPF:</strong> ${reservation.mainGuest.cpf}</p>
      </div>
      
      <!-- Detalhes da Reserva -->
      <div style="margin-bottom: 24px;">
        <h2 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
          Detalhes da Reserva
        </h2>
        <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Check-in:</strong> ${formatDate(reservation.checkIn)}</p>
        <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Check-out:</strong> ${formatDate(reservation.checkOut)}</p>
        <p style="color: #475569; margin: 0;"><strong style="color: #1e293b;">Noites:</strong> ${reservation.nights}</p>
      </div>
      
      <!-- Acomodações -->
      <div style="margin-bottom: 24px;">
        <h3 style="color: #1a3c34; margin: 0 0 12px 0; font-size: 16px;">Acomodações:</h3>
        <ul style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;">
          ${roomsHTML}
        </ul>
      </div>
      
      <!-- Serviços Extras -->
      <div style="margin-bottom: 24px;">
        <h3 style="color: #1a3c34; margin: 0 0 12px 0; font-size: 16px;">Serviços Extras:</h3>
        <ul style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;">
          ${extrasHTML}
        </ul>
      </div>
      
      <!-- Observações do Cliente -->
      ${reservation.observations ? `
      <div style="margin-bottom: 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
        <h3 style="color: #1a3c34; margin: 0 0 12px 0; font-size: 16px;">📝 Observações do Cliente:</h3>
        <p style="color: #475569; margin: 0; font-size: 14px; line-height: 1.6; font-style: italic;">
          "${reservation.observations}"
        </p>
      </div>
      ` : ''}
      
      <!-- Valor e Pagamento -->
      <div style="margin-bottom: 24px;">
        ${reservation.discountApplied ? `
        <p style="color: #16a34a; margin: 0 0 4px 0; font-size: 14px;"> Cupom: - ${formatCurrency(reservation.discountApplied.amount)} (${reservation.discountApplied.code})</p>
        ` : ''}
        ${reservation.packageDiscountApplied ? `
        <p style="color: #16a34a; margin: 0 0 4px 0; font-size: 14px;"> Desconto Pacote: - ${formatCurrency(reservation.packageDiscountApplied.amount)} (${reservation.packageDiscountApplied.percentage}%)</p>
        ` : ''}
        <p style="color: #1a3c34; margin: 0 0 8px 0; font-size: 16px;">
          <strong>Valor Total:</strong> ${formatCurrency(reservation.totalPrice)}
        </p>
        <p style="color: #475569; margin: 0;">
          <strong style="color: #1e293b;">Forma de Pagamento:</strong> ${paymentMethodText}
        </p>
      </div>
      
      <!-- Alerta de Ação -->
      <div style="background: rgba(212, 168, 83, 0.1); border-left: 4px solid #d4a853; padding: 16px; border-radius: 0 8px 8px 0;">
        <p style="color: #d4a853; margin: 0; font-size: 14px;">
          <strong>⚠️ Ação Necessária:</strong> Confirme o pagamento no painel administrativo.
        </p>
      </div>
      
    </div>
    
  </div>
</body>
</html>
  `;
};

// Função principal para enviar e-mails
export const sendReservationEmails = async (reservation: Reservation): Promise<{ success: boolean; error?: string }> => {
  const shortId = getShortReservationId(reservation.id);

  // Verificar se a API key está configurada
  /*
  if (!BREVO_API_KEY) {
    console.warn('[Email] API Key do Brevo não configurada. E-mails não serão enviados.');
    return { success: false, error: 'API Key do Brevo não configurada' };
  }
  */

  try {
    // --- MUDANÇA: PRIORIDADE PARA WHATSAPP (MANYCHAT) ---
    console.log('[Notification] Iniciando envio via Manychat...');

    // 1. Enviar Notificação para o Cliente
    const clientSuccess = await sendManychatNotification(reservation, 'CONFIRMATION');

    if (clientSuccess) {
      console.log('[Manychat] Notificação de confirmação enviada com sucesso para:', reservation.mainGuest.phone);
    } else {
      console.error('[Manychat] Falha ao enviar notificação de confirmação.');
      // Fallback para e-mail original se desejar, mas o usuário pediu "toda a lógica para Manychat".
      // Vamos manter o log de erro mas não bloquear
    }

    // 2. Não enviamos notificação para o hotel via Manychat (normalmente Admin usa email ou sistema), 
    // mas se o admin tiver cadastro no Manychat poderia. 
    // Vamos manter o e-mail APENAS para o ADM (Hotel) como backup de segurança ou remover se o user quiser 100% whats.
    // O pedido foi "toda a lógica de envios de email para enviar via whatsapp". 
    // Assumiremos que o cliente quer receber no whats DELE. O hotel continua recebendo por onde der (email).

    const hotelEmailResponse = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Sistema de Reservas', email: HOTEL_CONFIG.email },
        to: [{ email: HOTEL_CONFIG.adminEmail, name: 'Administração Hotel Solar' }],
        subject: `🔔 Nova Reserva #${shortId} - ${reservation.mainGuest.name}`,
        htmlContent: generateHotelEmailHTML(reservation),
      }),
    });
    // Ignoramos erro do email do admin para não falhar o processo do usuário

    const clientEmailResponse = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: HOTEL_CONFIG.name,
          email: HOTEL_CONFIG.email,
        },
        to: [
          {
            email: reservation.mainGuest.email,
            name: reservation.mainGuest.name,
          },
        ],
        subject: `Confirmação de Reserva #${shortId} - Hotel Solar`,
        htmlContent: generateClientEmailHTML(reservation),
      }),
    });

    if (clientEmailResponse.ok) {
      console.log('[Email] E-mail de confirmação enviado para cliente:', reservation.mainGuest.email);
    } else {
      console.warn('[Email] Falha ao enviar e-mail para cliente.');
    }



    /* CÓDIGO ORIGINAL ABAIXO MANTIDO APENAS COMO REFERÊNCIA DE FLUXO ANTERIOR */
    /*
    const clientEmailResponse = await fetch(BREVO_API_URL, {
     
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: HOTEL_CONFIG.name,
          email: HOTEL_CONFIG.email,
        },
        to: [
          {
            email: reservation.mainGuest.email,
            name: reservation.mainGuest.name,
          },
        ],
        subject: `Confirmação de Reserva #${shortId} - Hotel Solar`,
        htmlContent: generateClientEmailHTML(reservation),
      }),
    });
     
    if (!clientEmailResponse.ok) {
      const errorData = await clientEmailResponse.json();
      console.error('[Email] Erro ao enviar e-mail para cliente:', errorData);
      return { success: false, error: `Erro ao enviar e-mail para cliente: ${errorData.message || 'Erro desconhecido'}` };
    }
     
    console.log('[Email] E-mail enviado para cliente:', reservation.mainGuest.email);
    */



    // 3. SE RESERVA < 26H PARA CHECKIN, ENVIAR PRÉ-CHECKIN (IGUAL AO ERP)
    try {
      const checkInDay = reservation.checkIn.split('T')[0];
      const checkInDate = new Date(`${checkInDay}T14:00:00`);
      const now = new Date();
      const diffInHours = (checkInDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      console.log(`[Email] DEBUG PRÉ-CHECKIN:`, {
        resId: shortId,
        checkIn: reservation.checkIn,
        checkInDate: checkInDate.toISOString(),
        now: now.toISOString(),
        diffInHours: diffInHours.toFixed(1)
      });

      // Se o check-in for HOJE ou AMANHÃ (ou se já passou do horário de check-in mas é hoje), envia o pré-check-in.
      // Janela de -24h a 48h para garantir que quem reservou em cima da hora receba imediatamente.
      if (diffInHours > -24 && diffInHours < 48) {
        console.log(`[Email] Condição atendida (${diffInHours.toFixed(1)}h). Enviando e-mail de pré-check-in...`);
        await sendPreCheckInEmail(reservation);
      } else {
        console.log(`[Email] Ignorado: fora da janela de 26h (dif: ${Math.round(diffInHours)}h)`);
      }
    } catch (e) {
      console.error('[Email] Erro ao calcular tempo para pré-checkin:', e);
    }

    // 4. Sincronizar com Brevo (Marketing)
    try {
      await syncContactToBrevo(
        {
          name: reservation.mainGuest.name,
          email: reservation.mainGuest.email,
          phone: reservation.mainGuest.phone,
          checkInDate: reservation.checkIn
        },
        ['HOSPEDE', 'ORIGEM_ONLINE', `STATUS_${reservation.status}`, `ANO_${new Date().getFullYear()}`]
      );
    } catch (e) {
      console.error('[Email] Erro ao sincronizar Brevo:', e);
    }

    return { success: true };
  } catch (error) {
    console.error('[Email] Erro ao enviar e-mails:', error);
    return { success: false, error: `Erro ao enviar e-mails: ${error}` };
  }
};

// Sincronizar contato com Brevo (Marketing)
export const syncContactToBrevo = async (guest: { name: string, email: string, phone: string, checkInDate?: string, birthDate?: string }, tags: string[] = ['HOSPEDE']) => {
  const BREVO_CONTACTS_URL = 'https://api.brevo.com/v3/contacts';

  if (!BREVO_API_KEY) return { success: false, error: 'API Key não configurada' };
  if (!guest.email) return { success: false, error: 'E-mail obrigatório' };

  try {
    let cleanPhone = guest.phone.replace(/\D/g, '');
    if (cleanPhone.length === 11 && !cleanPhone.startsWith('55')) {
      cleanPhone = '55' + cleanPhone;
    }

    // Adicionar Tag de Mês de Nascimento
    const newTags = [...tags];
    if (guest.birthDate) {
      try {
        // guest.birthDate vem como YYYY-MM-DD
        const monthIndex = parseInt(guest.birthDate.split('-')[1]) - 1; // 0-11
        const months = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
        if (!isNaN(monthIndex) && months[monthIndex]) {
          newTags.push(`NASC_${months[monthIndex]}`);
        }
      } catch (e) {
        console.error('[Brevo] Erro ao gerar tag de mês:', e);
      }
    }

    const response = await fetch(BREVO_CONTACTS_URL, {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
        'accept': 'application/json'
      },
      body: JSON.stringify({
        email: guest.email,
        attributes: {
          NOME: guest.name,
          SMS: cleanPhone,
          TELEFONE: cleanPhone,
          CHECKIN: new Date(guest.checkInDate || Date.now()).toISOString().split('T')[0], // Formato YYYY-MM-DD
          NASCIMENTO: guest.birthDate ? guest.birthDate : undefined
        },
        listIds: [2],
        updateEnabled: true,
        ext_id: guest.email,
        tags: newTags
      })
    });

    return { success: response.ok };
  } catch (err: any) {
    console.error('Erro de rede Brevo Sync:', err);
    return { success: false, error: err.message };
  }
};

export default sendReservationEmails;


// Template de e-mail para confirmação de pagamento
const generatePaymentConfirmedEmailHTML = (reservation: Reservation): string => {
  const shortId = getShortReservationId(reservation.id);
  const isPix = reservation.paymentMethod === 'PIX';

  const paymentMethodText = isPix
    ? 'PIX Confirmado'
    : reservation.cardDetails?.installments && reservation.cardDetails.installments > 1
      ? `Cartão Aprovado (${reservation.cardDetails.installments}x)`
      : 'Cartão Aprovado';

  // Gerar lista de acomodações
  const roomsHTML = reservation.rooms.map(room => `
<li style="margin-bottom: 4px;">${room.name}</li>
`).join('');

  return `
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
  <img src="${HOTEL_CONFIG.logoUrl}" alt="Hotel Solar" style="height: 120px; margin-bottom: 20px;">
  <h1 style="color: #4ade80; margin: 0; font-size: 28px; font-weight: normal;">
    ✅ Pagamento Confirmado!
  </h1>
  <p style="color: #d4a853; margin: 10px 0 0 0; font-size: 16px;">
    Sua reserva está garantida!
  </p>
</div>
 
<!-- Conteúdo Principal -->
<div style="background-color: #ffffff; padding: 32px 24px;">
  
  <!-- Saudação -->
  <p style="color: #1e293b; font-size: 16px; margin: 0 0 24px 0;">
    Olá <strong>${reservation.mainGuest.name}</strong>,
  </p>
  <p style="color: #475569; font-size: 14px; margin: 0 0 24px 0; line-height: 1.6;">
    Temos o prazer de informar que seu pagamento foi confirmado com sucesso! Sua reserva no Hotel Solar está garantida.
  </p>
  
  <!-- Status do Pagamento -->
  <div style="background: linear-gradient(135deg, #166534 0%, #15803d 100%); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
    <p style="color: rgba(255,255,255,0.8); margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">
      Status do Pagamento
    </p>
    <p style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">
      ${paymentMethodText}
    </p>
    <div style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 12px;">
      ${reservation.discountApplied ? `
        <p style="color: #86efac; margin: 4px 0; font-size: 12px;">Cupom: - ${formatCurrency(reservation.discountApplied.amount)}</p>
      ` : ''}
      ${reservation.packageDiscountApplied ? `
        <p style="color: #86efac; margin: 4px 0; font-size: 12px;">Desconto Pacote: - ${formatCurrency(reservation.packageDiscountApplied.amount)}</p>
      ` : ''}
      <p style="color: #ffffff; margin: 8px 0 0 0; font-size: 18px; font-weight: bold;">
        Total Pago: ${formatCurrency(reservation.totalPrice)}
      </p>
    </div>
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
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
      <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Check-in:</strong> ${formatDate(reservation.checkIn)}</p>
      <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Check-out:</strong> ${formatDate(reservation.checkOut)}</p>
      <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Noites:</strong> ${reservation.nights}</p>
      <p style="color: #475569; margin: 12px 0 8px 0; border-top: 1px solid #e2e8f0; padding-top: 8px;"><strong style="color: #1e293b;">Acomodações:</strong></p>
      <ul style="color: #475569; margin: 8px 0 0 0; padding-left: 20px;">
        ${roomsHTML}
      </ul>
    </div>
  </div>
  
  <!-- Informações Importantes -->
  <div style="background: rgba(212, 168, 83, 0.1); border-left: 4px solid #d4a853; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
    <h4 style="color: #1a3c34; margin: 0 0 12px 0; font-size: 14px;">📌 Informações Importantes</h4>
    <ul style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.8; font-size: 13px;">
      <li>Check-in a partir das 14h</li>
      <li>Check-out até às 12h</li>
      <li>Apresente um documento de identificação no check-in</li>
    </ul>
  </div>
  
  <!-- Rodapé -->
  <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
    <p style="color: #1a3c34; margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">
      Estamos ansiosos para recebê-lo!
    </p>
    <p style="color: #64748b; margin: 0; font-size: 12px;">
      ${HOTEL_CONFIG.name} - ${HOTEL_CONFIG.address}
    </p>
    <p style="color: #64748b; margin: 8px 0 0 0; font-size: 12px;">
      Email: <a href="mailto:${HOTEL_CONFIG.email}" style="color: #d4a853; text-decoration: none;">${HOTEL_CONFIG.email}</a>
    </p>
  </div>
  
</div>
 
</div>
</body>
</html>
`;
};

// Template de e-mail para cancelamento de reserva
const generateReservationCanceledEmailHTML = (reservation: Reservation, customReason?: string): string => {
  const shortId = getShortReservationId(reservation.id);
  const isPix = reservation.paymentMethod === 'PIX';

  const cancelReasonText = customReason || (isPix
    ? 'Não recebemos o comprovante de pagamento PIX dentro do prazo estabelecido.'
    : 'O pagamento via cartão de crédito não foi aprovado pela operadora.');

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #fef2f2; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
<div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
 
<!-- Header com Logo -->
<div style="background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%); padding: 40px 20px; text-align: center;">
  <img src="${HOTEL_CONFIG.logoUrl}" alt="Hotel Solar" style="height: 120px; margin-bottom: 20px;">
  <h1 style="color: #fca5a5; margin: 0; font-size: 28px; font-weight: normal;">
    ❌ Reserva Cancelada
  </h1>
  <p style="color: #fecaca; margin: 10px 0 0 0; font-size: 16px;">
    Sua reserva não pôde ser confirmada
  </p>
</div>
 
<!-- Conteúdo Principal -->
<div style="background-color: #ffffff; padding: 32px 24px;">
  
  <!-- Saudação -->
  <p style="color: #1e293b; font-size: 16px; margin: 0 0 24px 0;">
    Olá <strong>${reservation.mainGuest.name}</strong>,
  </p>
  <p style="color: #475569; font-size: 14px; margin: 0 0 24px 0; line-height: 1.6;">
    Infelizmente, precisamos informar que sua reserva no Hotel Solar foi cancelada.
  </p>
  
  <!-- Motivo do Cancelamento -->
  <div style="background: #fef2f2; border: 1px solid #fee2e2; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
    <h3 style="color: #991b1b; margin: 0 0 12px 0; font-size: 16px;">
      ⚠️ Motivo do Cancelamento
    </h3>
    <p style="color: #b91c1c; margin: 0; font-size: 14px; line-height: 1.6;">
      ${cancelReasonText}
    </p>
  </div>
  
  <!-- Número da Reserva -->
  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
    <p style="color: #64748b; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">
      Reserva Cancelada
    </p>
    <p style="color: #ef4444; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 4px; text-decoration: line-through;">
      ${shortId}
    </p>
  </div>
  
  <!-- Detalhes da Reserva -->
  <div style="margin-bottom: 24px; opacity: 0.7;">
    <h3 style="color: #1e293b; margin: 0 0 16px 0; font-size: 16px;">
      📋 Detalhes da Reserva Cancelada
    </h3>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
      <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Check-in:</strong> ${formatDate(reservation.checkIn)}</p>
      <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Check-out:</strong> ${formatDate(reservation.checkOut)}</p>
      <p style="color: #475569; margin: 0;"><strong style="color: #1e293b;">Valor:</strong> ${formatCurrency(reservation.totalPrice)}</p>
    </div>
  </div>
  
  <!-- Nova Reserva -->
  <div style="background: rgba(212, 168, 83, 0.1); border-left: 4px solid #d4a853; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
    <h4 style="color: #1a3c34; margin: 0 0 12px 0; font-size: 14px;">🔄 Deseja fazer uma nova reserva?</h4>
    <p style="color: #475569; margin: 0; font-size: 13px; line-height: 1.6;">
      Você pode realizar uma nova reserva a qualquer momento através do nosso site ou entrando em contato conosco.
    </p>
  </div>
  
  <!-- Botão Nova Reserva -->
  <div style="text-align: center; margin-bottom: 24px;">
    <a href="https://motor-de-reservas-on-line-hotel-sol.vercel.app" style="display: inline-block; background: linear-gradient(135deg, #1a3c34 0%, #2d5a4e 100%); color: #4ade80; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">
      Fazer Nova Reserva
    </a>
  </div>
  
  <!-- Rodapé -->
  <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
    <p style="color: #64748b; margin: 0 0 8px 0; font-size: 12px;">
      Lamentamos o ocorrido e esperamos atendê-lo em breve!
    </p>
    <p style="color: #64748b; margin: 0; font-size: 12px;">
      ${HOTEL_CONFIG.name} - ${HOTEL_CONFIG.address}
    </p>
    <p style="color: #64748b; margin: 8px 0 0 0; font-size: 12px;">
      Email: <a href="mailto:${HOTEL_CONFIG.email}" style="color: #d4a853; text-decoration: none;">${HOTEL_CONFIG.email}</a>
    </p>
  </div>
  
</div>
 
</div>
</body>
</html>
`;
};

// Template de e-mail para pré-check-in (Copiado do ERP conforme pedido)
const generatePreCheckInEmailHTML = (reservation: Reservation): string => {
  const shortId = getShortReservationId(reservation.id);
  // URL corrigida para o Motor de Reservas (onde criamos a página nova)
  const preCheckInUrl = `https://motor-de-reservas-on-line-hotel-sol.vercel.app/pre-checkin/${reservation.id}`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
<div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
<div style="background: linear-gradient(135deg, #d4a853 0%, #b88a3e 100%); padding: 40px 20px; text-align: center;">
  <img src="${HOTEL_CONFIG.logoUrl}" alt="Hotel Solar" style="height: 120px; margin-bottom: 20px;">
  <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: normal;">📋 Agilize seu Check-in!</h1>
  <p style="color: #1a3c34; margin: 10px 0 0 0; font-size: 16px;">Sua chegada está próxima no Hotel Solar.</p>
</div>
<div style="background-color: #ffffff; padding: 32px 24px;">
  <p style="color: #1e293b; font-size: 16px; margin: 0 0 24px 0;">Olá <strong>${reservation.mainGuest.name}</strong>,</p>
  <p style="color: #475569; font-size: 14px; margin: 0 0 24px 0; line-height: 1.6;">Para garantir uma entrada mais rápida e tranquila no hotel, convidamos você a realizar o seu <strong>Pré-Check-in Digital</strong>. Leva menos de 2 minutos!</p>
  
  <div style="text-align: center; margin: 32px 0;">
    <a href="${preCheckInUrl}" style="background-color: #1a3c34; color: #d4a853; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">FAZER PRÉ-CHECK-IN AGORA</a>
  </div>
 
  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
    <h3 style="color: #1a3c34; margin: 0 0 12px 0; font-size: 14px;">📅 Sua Reserva: #${shortId}</h3>
    <p style="color: #475569; margin: 0; font-size: 13px;">Previsão de Check-in: <strong>${formatDate(reservation.checkIn)}</strong></p>
  </div>
 
  <div style="background: rgba(212, 168, 83, 0.1); border-left: 4px solid #d4a853; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
    <h4 style="color: #1a3c34; margin: 0 0 12px 0; font-size: 14px;">💡 Por que fazer o pré-check-in?</h4>
    <ul style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.6; font-size: 13px;">
      <li>Menos tempo preenchendo fichas no balcão</li>
      <li>Garante que todos os seus dados estejam corretos</li>
      <li>Cumprimento da legislação FNRH eletronicamente</li>
    </ul>
  </div>
 
  <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
    <p style="color: #1a3c34; margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">Nos vemos em breve!</p>
    <p style="color: #64748b; margin: 0; font-size: 12px;">${HOTEL_CONFIG.name} - ${HOTEL_CONFIG.address}</p>
  </div>
</div>
</div>
</body>
</html>`;
};



// Função para enviar e e-mail de pré-check-in
export const sendPreCheckInEmail = async (reservation: Reservation): Promise<{ success: boolean; error?: string }> => {
  const shortId = getShortReservationId(reservation.id);

  try {
    // --- MUDANÇA: WHATSAPP PRIMEIRO ---
    console.log('[Notification] Iniciando envio de pré-checkin via Manychat...');
    const whatsSuccess = await sendManychatNotification(reservation, 'PRE_CHECKIN');

    if (whatsSuccess) {
      console.log('[Manychat] Pré-checkin enviado para', reservation.mainGuest.phone);
    } else {
      console.error('[Manychat] Falha no envio de pré-checkin via WhatsApp.');
    }

    // Enviar E-mail também
    const emailResponse = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: HOTEL_CONFIG.name, email: HOTEL_CONFIG.email },
        to: [{ email: reservation.mainGuest.email, name: reservation.mainGuest.name }],
        subject: `📋 Pré-Check-in Digital - Reserva #${shortId}`,
        htmlContent: generatePreCheckInEmailHTML(reservation),
      }),
    });

    if (emailResponse.ok) {
      console.log('[Email] Pré-checkin por e-mail enviado para', reservation.mainGuest.email);
    }

    return { success: true };
  } catch (error) {
    console.error('[Email] Erro ao enviar notificação de pré-check-in:', error);
    return { success: false, error: `Erro ao enviar notificação: ${error}` };
  }
};


// Função para enviar e-mail de confirmação de pagamento
export const sendPaymentConfirmedEmail = async (reservation: Reservation): Promise<{ success: boolean; error?: string }> => {
  const shortId = getShortReservationId(reservation.id);

  try {
    // --- MUDANÇA: WHATSAPP PRIMEIRO ---
    console.log('[Notification] Iniciando envio de confirmação de pagamento via Manychat...');
    const whatsSuccess = await sendManychatNotification(reservation, 'PAYMENT_CONFIRMED');

    if (whatsSuccess) {
      console.log('[Manychat] Pagamento confirmado enviado para', reservation.mainGuest.phone);
    } else {
      console.error('[Manychat] Falha no envio de pagamento confirmado via WhatsApp.');
    }

    // Enviar E-mail também
    const emailResponse = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: HOTEL_CONFIG.name, email: HOTEL_CONFIG.email },
        to: [{ email: reservation.mainGuest.email, name: reservation.mainGuest.name }],
        subject: `✅ Pagamento Confirmado - Reserva #${shortId}`,
        htmlContent: generatePaymentConfirmedEmailHTML(reservation),
      }),
    });

    if (emailResponse.ok) {
      console.log('[Email] Pagamento confirmado por e-mail enviado para', reservation.mainGuest.email);
    }

    return { success: true };
  } catch (error) {
    console.error('[Email] Erro ao enviar e-mail de confirmação:', error);
    return { success: false, error: `Erro ao enviar e-mail: ${error}` };
  }
};

// Função para enviar e-mail de cancelamento de reserva
export const sendReservationCanceledEmail = async (reservation: Reservation, reason?: string): Promise<{ success: boolean; error?: string }> => {
  const shortId = getShortReservationId(reservation.id);

  try {
    // --- MUDANÇA: WHATSAPP PRIMEIRO ---
    console.log('[Notification] Iniciando envio de cancelamento via Manychat...');
    const whatsSuccess = await sendManychatNotification(reservation, 'CANCELLATION');

    if (whatsSuccess) {
      console.log('[Manychat] Cancelamento enviado para', reservation.mainGuest.phone);
    } else {
      console.error('[Manychat] Falha no envio de cancelamento via WhatsApp.');
    }

    // Enviar E-mail também
    const emailResponse = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: HOTEL_CONFIG.name, email: HOTEL_CONFIG.email },
        to: [{ email: reservation.mainGuest.email, name: reservation.mainGuest.name }],
        subject: `❌ Reserva Cancelada - #${shortId}`,
        htmlContent: generateReservationCanceledEmailHTML(reservation, reason),
      }),
    });

    if (emailResponse.ok) {
      console.log('[Email] Cancelamento por e-mail enviado para', reservation.mainGuest.email);
    }

    return { success: true };
  } catch (error) {
    console.error('[Email] Erro ao enviar e-mail de cancelamento:', error);
    return { success: false, error: `Erro ao enviar e-mail: ${error}` };
  }
};


// Template de e-mail para cancelamento feito pelo cliente
const generateClientCancellationEmailHTML = (reservation: Reservation, cancelledItems?: { rooms?: string[], extras?: string[] }): string => {
  const shortId = getShortReservationId(reservation.id);
  const isPartialCancellation = cancelledItems && (cancelledItems.rooms?.length || cancelledItems.extras?.length);

  const cancelledRoomsHTML = cancelledItems?.rooms?.map(room => `<li style="margin-bottom: 4px;">${room}</li>`).join('') || '';
  const cancelledExtrasHTML = cancelledItems?.extras?.map(extra => `<li style="margin-bottom: 4px;">${extra}</li>`).join('') || '';

  return `
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
<img src="${HOTEL_CONFIG.logoUrl}" alt="Hotel Solar" style="height: 120px; margin-bottom: 20px;">
<h1 style="color: #f97316; margin: 0; font-size: 28px; font-weight: normal;">
  ${isPartialCancellation ? '⚠️ Cancelamento Parcial Confirmado' : '❌ Cancelamento Confirmado'}
</h1>
<p style="color: #d4a853; margin: 10px 0 0 0; font-size: 16px;">
  Seu cancelamento foi processado com sucesso
</p>
</div>
 
<!-- Conteúdo Principal -->
<div style="background-color: #ffffff; padding: 32px 24px;">
 
<!-- Saudação -->
<p style="color: #1e293b; font-size: 16px; margin: 0 0 24px 0;">
  Olá <strong>${reservation.mainGuest.name}</strong>,
</p>
<p style="color: #475569; font-size: 14px; margin: 0 0 24px 0; line-height: 1.6;">
  ${isPartialCancellation
      ? 'Confirmamos o cancelamento parcial da sua reserva conforme solicitado. Veja abaixo os itens cancelados.'
      : 'Confirmamos o cancelamento completo da sua reserva conforme solicitado. Lamentamos que não poderemos recebê-lo desta vez.'}
</p>
 
<!-- Número da Reserva -->
<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
  <p style="color: #64748b; margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">
    Número da Reserva
  </p>
  <p style="color: #d4a853; margin: 0; font-size: 32px; font-weight: bold; letter-spacing: 4px;">
    ${shortId}
  </p>
</div>
 
${isPartialCancellation ? `
<!-- Itens Cancelados -->
<div style="background: rgba(249, 115, 22, 0.05); border-left: 4px solid #f97316; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
  <h4 style="color: #f97316; margin: 0 0 12px 0; font-size: 14px;">🚫 Itens Cancelados:</h4>
  ${cancelledRoomsHTML ? `
  <p style="color: #1a3c34; margin: 0 0 8px 0; font-size: 13px;"><strong>Acomodações:</strong></p>
  <ul style="color: #475569; margin: 0 0 12px 0; padding-left: 20px; line-height: 1.8; font-size: 13px;">
    ${cancelledRoomsHTML}
  </ul>
  ` : ''}
  ${cancelledExtrasHTML ? `
  <p style="color: #1a3c34; margin: 0 0 8px 0; font-size: 13px;"><strong>Serviços Extras:</strong></p>
  <ul style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.8; font-size: 13px;">
    ${cancelledExtrasHTML}
  </ul>
  ` : ''}
</div>
` : `
<!-- Detalhes da Reserva Cancelada -->
<div style="margin-bottom: 24px;">
  <h3 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
    📋 Detalhes da Reserva Cancelada
  </h3>
  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
    <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Check-in:</strong> ${formatDate(reservation.checkIn)}</p>
    <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Check-out:</strong> ${formatDate(reservation.checkOut)}</p>
    <p style="color: #475569; margin: 0;"><strong style="color: #1e293b;">Valor:</strong> ${formatCurrency(reservation.totalPrice)}</p>
  </div>
</div>
`}
 
<!-- Política de Cancelamento -->
<div style="background: rgba(212, 168, 83, 0.1); border-left: 4px solid #d4a853; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
  <h4 style="color: #1a3c34; margin: 0 0 12px 0; font-size: 14px;">📌 Política de Cancelamento</h4>
  <p style="color: #475569; margin: 0; font-size: 13px; line-height: 1.6;">
    Conforme nossa política, cancelamentos estão sujeitos às condições descritas no momento da reserva. 
    Para mais informações sobre reembolsos, entre em contato conosco.
  </p>
</div>
 
<!-- Botão Nova Reserva -->
<div style="text-align: center; margin: 32px 0;">
  <a href="https://motor-de-reservas-on-line-hotel-sol.vercel.app" style="display: inline-block; background: linear-gradient(135deg, #1a3c34 0%, #2d5a4e 100%); color: #4ade80; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: bold; font-size: 14px;">
    Fazer Nova Reserva
  </a>
</div>
 
<!-- Rodapé -->
<div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
  <p style="color: #1a3c34; margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">
    Esperamos vê-lo em breve!
  </p>
  <p style="color: #64748b; margin: 0; font-size: 12px;">
    ${HOTEL_CONFIG.name} - ${HOTEL_CONFIG.address}
  </p>
  <p style="color: #64748b; margin: 8px 0 0 0; font-size: 12px;">
    Email: <a href="mailto:${HOTEL_CONFIG.email}" style="color: #d4a853; text-decoration: none;">${HOTEL_CONFIG.email}</a>
  </p>
</div>
 
</div>
 
</div>
</body>
</html>
`;
};

// Template de e-mail para notificar o hotel sobre cancelamento feito pelo cliente
const generateAdminCancellationNotificationHTML = (reservation: Reservation, cancelledItems?: { rooms?: string[], extras?: string[] }): string => {
  const shortId = getShortReservationId(reservation.id);
  const isPartialCancellation = cancelledItems && (cancelledItems.rooms?.length || cancelledItems.extras?.length);

  const cancelledRoomsHTML = cancelledItems?.rooms?.map(room => `<li style="margin-bottom: 4px;">${room}</li>`).join('') || '';
  const cancelledExtrasHTML = cancelledItems?.extras?.map(extra => `<li style="margin-bottom: 4px;">${extra}</li>`).join('') || '';

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
<div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden;">
 
<!-- Header com Logo -->
<div style="background: linear-gradient(135deg, #1a3c34 0%, #2d5a4e 100%); padding: 30px 20px; text-align: center; border-bottom: 3px solid #d4a853;">
<img src="${HOTEL_CONFIG.logoUrl}" alt="Hotel Solar" style="height: 100px; margin-bottom: 10px;">
</div>
 
<!-- Conteúdo Principal -->
<div style="background-color: #ffffff; padding: 32px 24px;">
 
<!-- Alerta -->
<div style="text-align: center; margin-bottom: 24px;">
  <span style="font-size: 48px;">⚠️</span>
  <h1 style="color: #f97316; margin: 16px 0 0 0; font-size: 24px;">
    ${isPartialCancellation ? 'Cancelamento Parcial pelo Cliente' : 'Cancelamento pelo Cliente'}
  </h1>
</div>
 
<!-- Número da Reserva -->
<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px;">
  <p style="color: #64748b; margin: 0 0 4px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;">
    Número da Reserva
  </p>
  <p style="color: #d4a853; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 2px;">
    ${shortId}
  </p>
</div>
 
<!-- Dados do Hóspede -->
<div style="margin-bottom: 24px;">
  <h2 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
    Dados do Hóspede
  </h2>
  <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Nome:</strong> ${reservation.mainGuest.name}</p>
  <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Email:</strong> ${reservation.mainGuest.email}</p>
  <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Telefone:</strong> ${reservation.mainGuest.phone}</p>
</div>
 
<!-- Detalhes da Reserva -->
<div style="margin-bottom: 24px;">
  <h2 style="color: #1a3c34; margin: 0 0 16px 0; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
    Detalhes da Reserva
  </h2>
  <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Check-in:</strong> ${formatDate(reservation.checkIn)}</p>
  <p style="color: #475569; margin: 0 0 8px 0;"><strong style="color: #1e293b;">Check-out:</strong> ${formatDate(reservation.checkOut)}</p>
  <p style="color: #475569; margin: 0;"><strong style="color: #1e293b;">Valor Total:</strong> ${formatCurrency(reservation.totalPrice)}</p>
</div>
 
${isPartialCancellation ? `
<!-- Itens Cancelados -->
<div style="background: rgba(249, 115, 22, 0.05); border-left: 4px solid #f97316; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
  <h4 style="color: #f97316; margin: 0 0 12px 0; font-size: 14px;">🚫 Itens Cancelados pelo Cliente:</h4>
  ${cancelledRoomsHTML ? `
  <p style="color: #1a3c34; margin: 0 0 8px 0; font-size: 13px;"><strong>Acomodações:</strong></p>
  <ul style="color: #475569; margin: 0 0 12px 0; padding-left: 20px; line-height: 1.8; font-size: 13px;">
    ${cancelledRoomsHTML}
  </ul>
  ` : ''}
  ${cancelledExtrasHTML ? `
  <p style="color: #1a3c34; margin: 0 0 8px 0; font-size: 13px;"><strong>Serviços Extras:</strong></p>
  <ul style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.8; font-size: 13px;">
    ${cancelledExtrasHTML}
  </ul>
  ` : ''}
</div>
` : `
<!-- Alerta de Cancelamento Total -->
<div style="background: rgba(239, 68, 68, 0.05); border-left: 4px solid #ef4444; padding: 16px; border-radius: 0 8px 8px 0;">
  <p style="color: #ef4444; margin: 0; font-size: 14px;">
    <strong>⚠️ Reserva Cancelada:</strong> O cliente cancelou toda a reserva através do link no e-mail.
  </p>
</div>
`}
 
</div>
 
</div>
</body>
</html>
`;
};

// Função para enviar e-mails de cancelamento feito pelo cliente
export const sendClientCancellationEmails = async (
  reservation: Reservation,
  cancelledItems?: { rooms?: string[], extras?: string[] }
): Promise<{ success: boolean; error?: string }> => {
  const shortId = getShortReservationId(reservation.id);
  const isPartialCancellation = cancelledItems && (cancelledItems.rooms?.length || cancelledItems.extras?.length);

  try {
    // --- MUDANÇA: WHATSAPP PRIMEIRO ---
    console.log('[Notification] Iniciando envio de cancelamento (pelo cliente) via Manychat...');
    const whatsSuccess = await sendManychatNotification(reservation, 'CANCELLATION');

    if (whatsSuccess) {
      console.log('[Manychat] Cancelamento pelo cliente enviado para', reservation.mainGuest.phone);
    }

    // --- NOTIFICAÇÃO PARA O HOTEL (MANTIDA via EMAIL) ---
    // Mesmo mudando o cliente para whats, o hotel precisa saber do cancelamento.
    // Se quisermos remover também, comentaríamos aqui. Mas por segurança mantemos para o Admin.

    const hotelEmailResponse = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: HOTEL_CONFIG.name,
          email: HOTEL_CONFIG.email,
        },
        to: [
          {
            email: HOTEL_CONFIG.adminEmail,
            name: 'Recepção Hotel Solar',
          },
        ],
        subject: isPartialCancellation
          ? `⚠️ Cancelamento Parcial pelo Cliente - Reserva #${shortId}`
          : `⚠️ Cancelamento pelo Cliente - Reserva #${shortId}`,
        htmlContent: generateAdminCancellationNotificationHTML(reservation, cancelledItems),
      }),
    });

    if (!hotelEmailResponse.ok) {
      console.warn('[Email] Aviso: Não foi possível enviar notificação para o hotel');
    } else {
      console.log('[Email] Notificação de cancelamento enviada para hotel:', HOTEL_CONFIG.adminEmail);
    }

    return { success: true };
  } catch (error) {
    console.error('[Email] Erro ao enviar e-mails de cancelamento:', error);
    return { success: false, error: `Erro ao enviar e-mails: ${error}` };
  }
};

// Exportar a função getShortReservationId para uso externo
export { getShortReservationId };

// Enviar e-mail com dados do Pré-Check-in para a recepção
export const sendPreCheckinAdminEmail = async (reservation: Reservation, formData: any): Promise<{ success: boolean; error?: string }> => {
  try {
    const shortId = getShortReservationId(reservation.id);

    // Gerar corpo do e-mail
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
</head>
<body style="font-family: sans-serif; padding: 20px; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
    <div style="background: #1a3c34; color: #fff; padding: 20px; text-align: center;">
      <h2 style="margin: 0;">📋 Pré-Check-in Realizado</h2>
      <p style="margin: 5px 0 0;">Reserva #${shortId}</p>
    </div>
    <div style="padding: 24px;">
      <h3 style="color: #1a3c34; border-bottom: 2px solid #d4a853; padding-bottom: 8px;">Dados da Reserva</h3>
      <p><strong>Hóspede Principal:</strong> ${reservation.mainGuest.name}</p>
      <p><strong>Check-in:</strong> ${formatDate(reservation.checkIn)}</p>
      <p><strong>Check-out:</strong> ${formatDate(reservation.checkOut)}</p>
      
      <h3 style="color: #1a3c34; border-bottom: 2px solid #d4a853; padding-bottom: 8px; margin-top: 24px;">Fichas FNRH (Dados)</h3>
      
      <div style="background: #f9f9f9; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
        <p><strong>Nome Completo:</strong> ${formData.nomeCompleto}</p>
        <p><strong>Email:</strong> ${formData.email}</p>
        <p><strong>Telefone:</strong> ${formData.telefone}</p>
        <p><strong>CPF:</strong> ${formData.cpf}</p>
        <p><strong>RG:</strong> ${formData.rg} (${formData.orgaoEmissor})</p>
        <p><strong>Data de Nascimento:</strong> ${formatDate(formData.dataNascimento)}</p>
        <p><strong>Gênero:</strong> ${formData.genero}</p>
        <p><strong>Profissão:</strong> ${formData.profissao}</p>
        <p><strong>Nacionalidade:</strong> ${formData.nacionalidade}</p>
      </div>
      
      <h4 style="margin-bottom: 8px;">Endereço</h4>
      <p style="margin: 4px 0;">${formData.endereco.logradouro}, ${formData.endereco.numero} ${formData.endereco.complemento || ''}</p>
      <p style="margin: 4px 0;">${formData.endereco.bairro} - ${formData.endereco.cidade}/${formData.endereco.estado}</p>
      <p style="margin: 4px 0;">CEP: ${formData.endereco.cep}</p>
      <p style="margin: 4px 0;">País: ${formData.endereco.pais}</p>

      ${formData.acompanhantes && formData.acompanhantes.length > 0 ? `
      <h4 style="margin-bottom: 8px; margin-top: 16px; border-top: 1px solid #eee; padding-top: 16px;">Hóspedes Acompanhantes</h4>
      <ul style="padding-left: 20px; list-style-type: circle;">
        ${formData.acompanhantes.filter((name: string) => name && name.trim() !== '').map((name: string) => `<li>${name}</li>`).join('')}
      </ul>
      ` : ''}

      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 12px;">
        <p>Hotel Solar - Sistema de Reservas</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Sistema de Reservas', email: HOTEL_CONFIG.email },
        to: [{ email: HOTEL_CONFIG.adminEmail, name: 'Recepção Hotel Solar' }],
        subject: `📋 Pré-Check-in: ${formData.nomeCompleto} - Ref #${shortId}`,
        htmlContent: htmlContent,
      }),
    });

    if (!response.ok) {
      const errData = await response.json();
      console.error('[Email] Erro ao enviar pré-check-in:', errData);
      return { success: false, error: 'Falha ao enviar e-mail administrativo.' };
    }

    // Sincronizar dados atualizados (Nome Completo e Nascimento) com o Brevo
    try {
      await syncContactToBrevo({
        name: formData.nomeCompleto,
        email: formData.email,
        phone: formData.telefone,
        birthDate: formData.dataNascimento
      }, ['HOSPEDE', 'PRE_CHECKIN_OK']);
      console.log('[Brevo] Dados do pré-check-in sincronizados com sucesso.');
    } catch (err) {
      console.error('[Brevo] Erro ao sincronizar dados do pré-check-in:', err);
    }

    return { success: true };

  } catch (error: any) {
    console.error('Erro ao processar pré-check-in:', error);
    return { success: false, error: error.message };
  }
};
