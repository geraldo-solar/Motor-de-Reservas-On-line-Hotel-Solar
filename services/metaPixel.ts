// Pixel da Meta no navegador. O index.html só carrega o pixel no endereço de
// produção; fora dele `fbq` não existe e estas chamadas não fazem nada.

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

/** Evento padrão da Meta. Com `eventId`, casa com o mesmo evento do servidor. */
export function rastrearNaMeta(evento: string, dados: Record<string, unknown>, eventId?: string): void {
  try {
    if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
    if (eventId) window.fbq('track', evento, dados, { eventID: eventId });
    else window.fbq('track', evento, dados);
  } catch {
    // Rastreamento nunca pode atrapalhar a reserva.
  }
}
