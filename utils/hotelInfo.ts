import { publicEventInquiry, isPrivateEventRequest } from './publicEvents.js';

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function eventInquiry(message: string) {
  const s = norm(message);
  if (/\b(nao quero|nao e|sem)\s+(evento|festa|aniversario)|\b(apenas|so) hospedagem individual/.test(s)) return false;
  if (isPrivateEventRequest(message)) return true;
  if (publicEventInquiry(message)) return false;
  // Public package programming is not a request to organize a private event.
  if (/\b(programacao|shows?|feriados?|pacotes?|reveillon)\b/.test(s) && !/orcamento|organizar|realizar|contratar|meu evento|minha festa/.test(s)) return false;
  if (/\b(eventos?|corporativ[oa]s?|empresariais|confraternizacoes?|confraternizacao|casamentos?|reunioes|treinamentos?)\b/.test(s)) return true;
  if (/\baniversarios?\b/.test(s) && (/orcamento|fazer|organizar|realizar|festa|convidad/.test(s) || Number(s.match(/\b(\d+)\s*pessoas\b/)?.[1])>=5)) return true;
  return /\bgrupos?\b/.test(s) && !/barco|biciclet/.test(s) && /orcamento|cotacao|hospedagem|reserva|excursao|\bgrupo de \d+/.test(s);
}

export const eventContactText = 'Para organizar seu evento ou a hospedagem do grupo, fale com a Luiza Barros, responsável pelos orçamentos personalizados. Ela orienta sobre espaços, formatos e valores conforme o que você precisa.\n\nWhatsApp da Luiza: https://wa.me/5591991654050\n\nSe já souber, envie a data desejada e a quantidade de participantes para ela preparar a proposta.';

// Two actual photos from the official hotel homepage, visually checked 2026-09-04.
const photos: Record<string, {url: string; caption: string}> = {
  RESERVA_1: {url:'https://www.hotelsolar.tur.br/assets/images/reserva-1.webp', caption:'Reserva Solar 📷\nRestaurante pé na areia: mesas no deck de frente para o mar.'},
  RESERVA_2: {url:'https://www.hotelsolar.tur.br/assets/images/reserva-2.webp', caption:'Reserva Solar 📷\nOutro ângulo do ambiente do restaurante à beira-mar.'},
};
export const reservaPhotoRequest = (message: string) => /\b(fotos?|fotografias?|imagem|imagens|galeria|album)\b/.test(norm(message)) && /\breserva\s+solar\b/.test(norm(message));
export const sitePhotoUrl = (reference: string) => /^SITE_ID\|RESERVA_[12](?:\|RESERVA_2)?$/.test(reference) ? photos[reference.split('|')[1]]?.url : undefined;
export function sitePhotoResult(next = false, reference = '') {
  const key = next ? reference === 'SITE_ID|RESERVA_1|RESERVA_2' ? 'RESERVA_2' : '' : 'RESERVA_1';
  if (!key) return {quote_request:'ROOM_DONE', quote_text:'', conversation_text:''};
  return {quote_request:`SITE_ID|${key}${key === 'RESERVA_1' ? '|RESERVA_2' : ''}`, quote_text:photos[key].caption, conversation_text:photos[key].caption, match_type:'restaurant_photo', availability_checked:false};
}
