// Eventos do Google no motor de reservas: as conversões do Google Ads e os
// eventos do Analytics saem daqui, para o navegador mandar sempre o mesmo
// valor e o mesmo id de reserva que a Meta recebe (utils/metaEventos.ts).

import { safeArray } from './dataSafety.js';

/** Conta "Geraldo Barros Hotel Solar". Tem de ser o mesmo do index.html. */
export const GOOGLE_ADS_ID = 'AW-754939028';

/** Analytics do site (hotelsolar.tur.br). Tem de ser o mesmo do index.html. */
export const GOOGLE_ANALYTICS_ID = 'G-0TN73829QP';

/** Ações de conversão criadas no Google Ads ("send_to" de cada uma). */
export const CONVERSOES_GOOGLE = {
  reservaConcluida: `${GOOGLE_ADS_ID}/2YtdCMaUqo4dEJTp_ecC`,
  inicioDeReserva: `${GOOGLE_ADS_ID}/KEovCMmUqo4dEJTp_ecC`,
  cliqueNoWhatsApp: `${GOOGLE_ADS_ID}/zBWXCMyUqo4dEJTp_ecC`,
} as const;

type ReservaParaGoogle = {
  id: string;
  totalPrice: number;
  rooms?: Array<{ id?: string; name?: string; priceSnapshot?: number }>;
};

/**
 * Compra no formato do Google: o mesmo id em minúsculas da Meta vira
 * `transaction_id`, e o Google descarta a segunda conversão com o mesmo id.
 */
export function compraNoGoogle(reserva: ReservaParaGoogle) {
  const quartos = safeArray<any>(reserva.rooms);
  return {
    transaction_id: String(reserva.id ?? '').trim().toLowerCase(),
    value: Math.round((Number(reserva.totalPrice) || 0) * 100) / 100,
    currency: 'BRL',
    items: quartos.map(q => ({
      item_id: String(q?.id ?? ''),
      item_name: String(q?.name ?? q?.id ?? ''),
      item_category: 'hospedagem',
      price: Number(q?.priceSnapshot) || 0,
      quantity: 1,
    })),
  };
}
