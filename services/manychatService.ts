import { Reservation } from '../types';
import { formatDisplayDate } from '../utils/dateUtils';

const MANYCHAT_TOKEN = import.meta.env.MANYCHAT_API_KEY || 'managed-on-server'; // Apenas para verificação não-nula, a chave real está no servidor

interface ManychatUser {
    id: string;
    name: string;
}

export const formatPhoneForManychat = (phone: string): string => {
    let clean = phone.replace(/\D/g, '');

    // Se não começar com 55 (DDI Brasil), adiciona. (Assumindo maioria PT-BR)
    // Mas cuidado com números que já começam com 55 (ex: (55) 999...) - raro, mas possível.
    // Melhor heurística: se tiver 10 ou 11 dígitos, é Brasil sem DDI.
    if (clean.length >= 10 && clean.length <= 11) {
        clean = `55${clean}`;
    }

    // Adicionar o '+' obrigatório do E.164
    return `+${clean}`;
};

// Encontra ou cria um assinante no Manychat
export const findOsCreateSubscriber = async (user: { name: string, phone: string, email?: string }): Promise<ManychatUser | null> => {
    // Usamos proxy, não precisamos do token aqui, mas mantemos check rapido se desejado
    const phone = formatPhoneForManychat(user.phone);

    try {
        const response = await fetch('/api/send-manychat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                endpoint: '/fb/subscriber/createSubscriber',
                method: 'POST',
                body: {
                    first_name: user.name.split(' ')[0],
                    last_name: user.name.split(' ').slice(1).join(' '),
                    phone: phone,
                    email: user.email,
                    consent_phrase: "Reserva Hotel Solar"
                }
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            return {
                id: data.data.id,
                name: data.data.name
            };
        } else {
            console.warn('[Manychat] Erro ao criar/buscar subscriber via Proxy:', data);
            return null;
        }
    } catch (error) {
        console.error('[Manychat] Erro de conexão Proxy:', error);
        return null;
    }
};

// Dispara um Flow Específico
export const sendFlow = async (subscriberId: string, flowId: string): Promise<boolean> => {
    if (!flowId) return false;

    try {
        const response = await fetch('/api/send-manychat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                endpoint: '/fb/sending/sendFlow',
                method: 'POST',
                body: {
                    subscriber_id: subscriberId,
                    flow_ns: flowId
                }
            })
        });

        const data = await response.json();
        return data.status === 'success';

    } catch (error) {
        console.error('[Manychat] Erro ao enviar Flow via Proxy:', error);
        return false;
    }
}

// Atualiza campos do usuário
export const setCustomFields = async (subscriberId: string, fields: Record<string, any>): Promise<boolean> => {
    try {
        const response = await fetch('/api/send-manychat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                endpoint: '/fb/subscriber/setCustomFields',
                method: 'POST',
                body: {
                    subscriber_id: subscriberId,
                    fields: fields
                }
            })
        });

        const data = await response.json();
        return data.status === 'success';
    } catch (error) {
        console.error('[Manychat] Erro ao setar campos via Proxy:', error);
        return false;
    }
}

// Função principal de notificação
export const sendManychatNotification = async (reservation: Reservation, type: 'CONFIRMATION' | 'CANCELLATION' | 'PAYMENT_CONFIRMED' | 'PRE_CHECKIN'): Promise<boolean> => {
    // Check local removido pois a chave está no servidor.
    // Mas se quiser checar ENV VAR publica:
    // if (!import.meta.env.VITE_MANYCHAT_FLOW_CONFIRMATION) ...

    // Obter IDs dos Flows das variáveis de ambiente ou usar Fallback Hardcoded (Solicitado pelo usuário)
    const FLOW_CONFIRMATION = import.meta.env.VITE_MANYCHAT_FLOW_CONFIRMATION || 'content20260125143022_701932';
    const FLOW_CANCELLATION = import.meta.env.VITE_MANYCHAT_FLOW_CANCELLATION || 'content20260125144913_999301';
    const FLOW_PAYMENT = import.meta.env.VITE_MANYCHAT_FLOW_PAYMENT || 'content20260125182711_860549';
    const FLOW_PRE_CHECKIN = import.meta.env.VITE_MANYCHAT_FLOW_PRE_CHECKIN || 'content20260126181459_262252';

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
        reservation_checkin: formatDisplayDate(reservation.checkIn),
        reservation_checkout: formatDisplayDate(reservation.checkOut),
        reservation_total: reservation.totalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        reservation_link: `https://motor-de-reservas-on-line-hotel-sol.vercel.app/pre-checkin/${reservation.id}`,
        reservation_uuid: reservation.id
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
