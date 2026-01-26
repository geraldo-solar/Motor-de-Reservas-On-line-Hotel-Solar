import { Reservation } from '../types';

const MANYCHAT_API_URL = 'https://api.manychat.com/fb/subscriber';
const MANYCHAT_TOKEN = import.meta.env.VITE_MANYCHAT_API_KEY || '';

// IDs de Custom Fields no Manychat (O usuário precisará mapear isso ou usar nomes se a API suportar)
// Por enquanto, vamos assumir que enviamos dados via 'setCustomFieldByName' se possível, 
// ou o usuário terá que configurar os IDs reais aqui.
// Estratégia: Identificar o usuário pelo telefone e disparar um Flow específico ou atualizar campos.

interface ManychatUser {
    id: string;
    name: string;
}

export const formatPhoneForManychat = (phone: string): string => {
    const clean = phone.replace(/\D/g, '');
    // Assume Brasil se não tiver DDI
    if (clean.length <= 11) {
        return `55${clean}`;
    }
    return clean;
};

// Encontra ou cria um assinante no Manychat
export const findOsCreateSubscriber = async (user: { name: string, phone: string, email?: string }): Promise<ManychatUser | null> => {
    if (!MANYCHAT_TOKEN) return null;

    const phone = formatPhoneForManychat(user.phone);

    try {
        // 1. Tentar encontrar/criar via telefone
        // Manychat não tem um 'upsert' direto simples público documentado igual para todos os canais sem complexidade,
        // mas o endpoint 'createSubscriber' muitas vezes retorna o existente.
        // Melhor abordagem segura: 'findByCustomField' ou apenas tentar enviar o flow pelo telefone se a API permitir (WhatsApp normalmente exige opt-in).

        // Para WhatsApp, usamos geralmente o createSubscriber na versão v2 ou específica.
        // Vamos usar a abordagem genérica: Criar subscriber.

        // Nota: A API do Manychat pode mudar. Esta é uma implementação padrão.
        // Se falhar, verifique a documentação atual do Manychat.

        const response = await fetch(`${MANYCHAT_API_URL}/createSubscriber`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${MANYCHAT_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                first_name: user.name.split(' ')[0],
                last_name: user.name.split(' ').slice(1).join(' '),
                phone: phone,
                email: user.email,
                consent_phrase: "Reserva Hotel Solar" // Necessário para alguns canais
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            return {
                id: data.data.id,
                name: data.data.name
            };
        } else {
            console.warn('[Manychat] Erro ao criar/buscar subscriber:', data);
            return null;
        }
    } catch (error) {
        console.error('[Manychat] Erro de conexão:', error);
        return null;
    }
};

// Dispara um Flow Específico
export const sendFlow = async (subscriberId: string, flowId: string): Promise<boolean> => {
    if (!MANYCHAT_TOKEN || !flowId) return false;

    try {
        const response = await fetch(`${MANYCHAT_API_URL}/sendFlow`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${MANYCHAT_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                subscriber_id: subscriberId,
                flow_ns: flowId // flow_ns é muitas vezes usado no lugar de id numérico
            })
        });

        const data = await response.json();
        return data.status === 'success';

    } catch (error) {
        console.error('[Manychat] Erro ao enviar Flow:', error);
        return false;
    }
}

// Atualiza campos do usuário (útil para gatilhos de automação)
export const setCustomFields = async (subscriberId: string, fields: Record<string, any>): Promise<boolean> => {
    if (!MANYCHAT_TOKEN) return false;

    try {
        const response = await fetch(`${MANYCHAT_API_URL}/setCustomFields`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${MANYCHAT_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                subscriber_id: subscriberId,
                fields: fields
            })
        });

        const data = await response.json();
        return data.status === 'success';
    } catch (error) {
        console.error('[Manychat] Erro ao setar campos:', error);
        return false;
    }
}

// Função principal de notificação
export const sendManychatNotification = async (reservation: Reservation, type: 'CONFIRMATION' | 'CANCELLATION' | 'PAYMENT_CONFIRMED' | 'PRE_CHECKIN'): Promise<boolean> => {
    if (!MANYCHAT_TOKEN) {
        console.warn('[Manychat] Token não configurado.');
        return false;
    }

    // Obter IDs dos Flows das variáveis de ambiente
    const FLOW_CONFIRMATION = import.meta.env.VITE_MANYCHAT_FLOW_CONFIRMATION;
    const FLOW_CANCELLATION = import.meta.env.VITE_MANYCHAT_FLOW_CANCELLATION;
    const FLOW_PAYMENT = import.meta.env.VITE_MANYCHAT_FLOW_PAYMENT;
    const FLOW_PRE_CHECKIN = import.meta.env.VITE_MANYCHAT_FLOW_PRE_CHECKIN;

    const subscriber = await findOsCreateSubscriber({
        name: reservation.mainGuest.name,
        phone: reservation.mainGuest.phone,
        email: reservation.mainGuest.email
    });

    if (!subscriber) {
        console.error('[Manychat] Não foi possível identificar o usuário.');
        return false;
    }

    // Atualizar dados da reserva nos Custom Fields para uso no Flow
    // Nota: Os campos precisam existir no Manychat com esses nomes exatos ou IDs.
    // Vamos usar nomes textuais que é mais fácil de debugar, mas IDs são mais robustos.
    // Campos sugeridos para criar no Manychat:
    // - reservation_id
    // - reservation_status
    // - reservation_dates
    // - reservation_total
    // - reservation_link

    const reservationFields = {
        reservation_id: reservation.id.slice(0, 8).toUpperCase(),
        reservation_status: type,
        reservation_checkin: new Date(reservation.checkIn).toLocaleDateString('pt-BR'),
        reservation_checkout: new Date(reservation.checkOut).toLocaleDateString('pt-BR'),
        reservation_total: reservation.totalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        reservation_link: `https://motor-de-reservas-on-line-hotel-sol.vercel.app/pre-checkin/${reservation.id}`
    };

    await setCustomFields(subscriber.id, reservationFields);

    // Disparar o Flow correspondente
    let targetFlowId = '';
    switch (type) {
        case 'CONFIRMATION': targetFlowId = FLOW_CONFIRMATION; break;
        case 'CANCELLATION': targetFlowId = FLOW_CANCELLATION; break;
        case 'PAYMENT_CONFIRMED': targetFlowId = FLOW_PAYMENT; break;
        case 'PRE_CHECKIN': targetFlowId = FLOW_PRE_CHECKIN; break;
    }

    if (targetFlowId) {
        console.log(`[Manychat] Disparando Flow ${type} (${targetFlowId}) para ${subscriber.name}`);
        return await sendFlow(subscriber.id, targetFlowId);
    } else {
        console.log(`[Manychat] Flow ID não configurado para ${type}. Apenas campos foram atualizados.`);
        // Se não tiver Flow ID, confiamos que a atualização do 'reservation_status' pode disparar uma automação interna no Manychat
        return true;
    }
};
