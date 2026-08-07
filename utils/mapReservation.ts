import { Reservation } from '../types';
import { safeArray, safeObject } from './dataSafety';

/**
 * Converte uma linha crua da tabela `reservations` no formato usado pelo app.
 *
 * Vive aqui (e não dentro do useSupabaseData) porque a página de pré-check-in
 * busca a reserva direto pelo ID e precisa do mesmo mapeamento.
 */
export const mapReservationRow = (r: any): Reservation => {
  try {
    return {
      id: String(r.id || ''),
      createdAt: (r.created_at || r.createdAt) ? new Date(r.created_at || r.createdAt) : new Date(),
      checkIn: String(r.check_in || r.checkIn || ''),
      checkOut: String(r.check_out || r.checkOut || ''),
      nights: Number(r.nights || 1),
      mainGuest: safeObject(r.main_guest || r.mainGuest, { name: 'Hóspede', email: '', phone: '', cpf: '' }),
      additionalGuests: safeArray(r.additional_guests || r.additionalGuests),
      observations: String(r.observations || ''),
      rooms: safeArray(r.rooms || r.reservation_rooms).map((rm: any) => ({
        id: String(rm.id || rm.room_id || ''),
        name: String(rm.name || 'Acomodação'),
        priceSnapshot: Number(rm.priceSnapshot || rm.price_snapshot || 0)
      })),
      extras: safeArray(r.extras || r.reservation_extras).map((ex: any) => ({
        id: String(ex.id || ex.extra_id || ''),
        name: String(ex.name || 'Serviço'),
        priceSnapshot: Number(ex.priceSnapshot || ex.price_snapshot || 0),
        quantity: Number(ex.quantity || 1)
      })),
      totalPrice: Number(r.total_price || r.totalPrice || 0),
      discountApplied: (r.discount_applied || r.discountApplied) ? {
        code: String((r.discount_applied || r.discountApplied).code || ''),
        amount: Number((r.discount_applied || r.discountApplied).amount || 0)
      } : undefined,
      paymentMethod: (r.payment_method || r.paymentMethod || 'PIX') as 'PIX' | 'CREDIT_CARD',
      cardDetails: r.card_details || r.cardDetails ? safeObject(r.card_details || r.cardDetails, undefined) : undefined,
      status: (r.status === 'CANCELLED' ? 'CANCELED' : (r.status || 'PENDING')) as any,
      cancellationReason: r.cancellation_reason || r.cancellationReason || '',
      packageDiscountApplied: (r.package_discount_applied || r.packageDiscountApplied) ? {
        percentage: Number((r.package_discount_applied || r.packageDiscountApplied).percentage || 0),
        amount: Number((r.package_discount_applied || r.packageDiscountApplied).amount || 0)
      } : undefined,
      amountPaid: r.amount_paid !== undefined ? Number(r.amount_paid) : (r.amountPaid !== undefined ? Number(r.amountPaid) : undefined),
      paymentHistory: safeArray(r.payment_history),
      id_empresa: r.id_empresa || null,
      companyName: r.companies?.trade_name || null,
      groupId: r.group_id || null,
    };
  } catch (e) {
    console.error('[Mapper] Erro ao mapear reserva individual:', e, r);
    // Retorna uma reserva mínima para não quebrar o loop
    return { id: 'ERR', mainGuest: { name: 'Erro Dados', email: '', phone: '', cpf: '' }, status: 'PENDING', totalPrice: 0, rooms: [], extras: [], checkIn: '', checkOut: '', nights: 1, createdAt: new Date() } as any;
  }
};

export const mapReservations = (data: any[]): Reservation[] => safeArray(data).map(mapReservationRow);
