// Tag do Google no navegador. O index.html só carrega a tag no endereço de
// produção; fora dele `gtag` não existe e estas chamadas não fazem nada.

import { CONVERSOES_GOOGLE } from '../utils/googleEventos';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/** Evento do Analytics (view_item, begin_checkout, purchase...). */
export function rastrearNoGoogle(evento: string, dados: Record<string, unknown> = {}): void {
  try {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
    window.gtag('event', evento, dados);
  } catch {
    // Rastreamento nunca pode atrapalhar a reserva.
  }
}

/** Conversão do Google Ads, pelo nome da ação em CONVERSOES_GOOGLE. */
export function converterNoGoogle(
  conversao: keyof typeof CONVERSOES_GOOGLE,
  dados: Record<string, unknown> = {},
): void {
  rastrearNoGoogle('conversion', { send_to: CONVERSOES_GOOGLE[conversao], ...dados });
}
