// Eventos da Meta do motor de reservas: o pixel no navegador e a API de
// Conversões no servidor montam a compra daqui, para os dois lados mandarem
// o mesmo valor e o mesmo id. Id diferente desliga a deduplicação sem erro
// visível, e a Meta passa a contar cada reserva duas vezes.

import { safeArray } from './dataSafety.js';

/**
 * "Hotel Solar - Site", do portfólio Hotel Solar Salinópolis. É o mesmo do
 * site (api/capture-lead) e tem de ser o mesmo do index.html.
 */
export const META_PIXEL_ID = '743518114034395';

/**
 * Só o endereço publicado conta. Antes, ~89% dos eventos do pixel vinham de
 * 127.0.0.1 e localhost (testes), o que ensina a Meta com visitas falsas.
 */
export function ehHostDeProducao(host: unknown): boolean {
  const nome = String(host ?? '').trim().toLowerCase().replace(/:\d+$/, '');
  return nome === 'hotelsolar.tur.br' || nome.endsWith('.hotelsolar.tur.br');
}

export const idDoEventoDeCompra = (reservaId: string): string =>
  `reserva-${String(reservaId ?? '').trim().toLowerCase()}`;

type ReservaParaMeta = {
  id: string;
  checkIn: string;
  checkOut: string;
  totalPrice: number;
  rooms?: Array<{ id?: string; priceSnapshot?: number }>;
};

/** custom_data da compra: valor em reais, datas da estadia e acomodações. */
export function dadosDaCompra(reserva: ReservaParaMeta) {
  const quartos = safeArray<any>(reserva.rooms);
  const valor = Math.round((Number(reserva.totalPrice) || 0) * 100) / 100;
  return {
    currency: 'BRL',
    value: valor,
    order_id: String(reserva.id ?? '').trim().toLowerCase(),
    content_category: 'hospedagem',
    content_ids: quartos.map(q => String(q?.id ?? '')).filter(Boolean),
    contents: quartos.map(q => ({ id: String(q?.id ?? ''), quantity: 1, item_price: Number(q?.priceSnapshot) || 0 })),
    num_items: quartos.length,
    checkin_date: reserva.checkIn,
    checkout_date: reserva.checkOut,
  };
}
