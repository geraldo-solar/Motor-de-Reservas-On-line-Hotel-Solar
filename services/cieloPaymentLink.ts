export const ERP_URL = 'https://erp-hotel-solar.vercel.app';

// O endereço enviado ao hóspede confere a situação atual da reserva antes
// de encaminhar para a página de pagamento da Cielo.
export const linkPagamentoReserva = (reservationId: string) =>
    `${ERP_URL}/api/reservas/pagamento-cartao/abrir?reservationId=${encodeURIComponent(reservationId)}`;
