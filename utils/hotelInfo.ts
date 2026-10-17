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

// Official photos of the hotel areas, taken from www.hotelsolar.tur.br
// (sitehotelsolar repo, assets/images) and visually checked on 17/10/2026.
// Served as JPEG from this site's public/media folder.
const photo = (file: string, caption: string) => ({url: `/media/${file}`, caption});
const photos: Record<string, {url: string; caption: string}> = {
  RESERVA_1: photo('reserva-solar-deck.jpg', 'Reserva Solar 📷\nRestaurante pé na areia: mesas no deck de frente para o mar.'),
  RESERVA_2: photo('reserva-solar-varanda.jpg', 'Reserva Solar 📷\nOutro ângulo do ambiente do restaurante à beira-mar.'),
  RESERVA_TRAPICHE: photo('reserva-solar-trapiche.jpg', 'Trapiche que leva ao Reserva Solar 📷'),
  RESERVA_AEREA: photo('reserva-solar-aerea.jpg', 'Vista aérea do Reserva Solar e da praia 📷'),
  S73_SALAO: photo('solar73-salao.jpg', 'Restaurante Solar 73 📷\nSalão interno, onde também é servido o café da manhã.'),
  S73_EXTERNA: photo('solar73-area-externa.jpg', 'Restaurante Solar 73 📷\nÁrea externa.'),
  S73_PISCINA: photo('solar73-piscina.jpg', 'Restaurante Solar 73 📷\nMesas ao lado da piscina.'),
  CAFE: photo('cafe-da-manha.jpg', 'Café da manhã 📷\nIncluído nas diárias, das 7h às 10h.'),
  BAR: photo('bar.jpg', 'Bar do Hotel Solar 📷'),
  BAR_LOUNGE: photo('bar-lounge.jpg', 'Ambiente do bar 📷'),
  HOTEL_AEREA: photo('hotel-aerea.jpg', 'Vista aérea do Hotel Solar 📷'),
  HOTEL_FACHADA: photo('hotel-fachada.jpg', 'Entrada do Hotel Solar 📷'),
  HOTEL_HALL: photo('hotel-hall.jpg', 'Hall de entrada 📷'),
  HOTEL_PISCINA: photo('hotel-piscina-predio.jpg', 'Piscina e prédio do Hotel Solar 📷'),
  HOTEL_NOITE: photo('hotel-noite.jpg', 'Hotel Solar à noite 📷'),
  PRAIA: photo('praia-solar.jpg', 'Praia do Solar 📷\nFaixa de areia tranquila junto ao Reserva Solar.'),
  PRAIA_2: photo('praia-solar-casal.jpg', 'Praia do Solar 📷'),
  JOGOS: photo('sala-de-jogos.jpg', 'Sala de jogos 📷'),
  QUADRA: photo('quadra.jpg', 'Quadra poliesportiva 📷'),
  CAPELA: photo('capela.jpg', 'Capela do Hotel Solar 📷'),
  AUDITORIO: photo('auditorio.jpg', 'Auditório do Hotel Solar 📷'),
  AUDITORIO_2: photo('auditorio-evento.jpg', 'Auditório montado para evento 📷'),
  COFFEE: photo('coffee-break.jpg', 'Coffee break de evento 📷'),
};
// Subjects in the customer's own words. Rooms, pools, bicycles, the boat and
// the paid extras keep their own media flows.
const siteSubjects: {re: RegExp; keys: string[]}[] = [
  {re: /\breserva\s+solar\b|\brestaurantes? (?:da|na|de) praia\b|\bpe na areia\b|\btrapiche\b/, keys: ['RESERVA_1', 'RESERVA_2', 'RESERVA_TRAPICHE', 'RESERVA_AEREA']},
  {re: /\bsolar\s*73\b/, keys: ['S73_SALAO', 'S73_EXTERNA', 'S73_PISCINA']},
  {re: /\brestaurantes?\b|\bgastronomia\b/, keys: ['S73_SALAO', 'S73_PISCINA', 'RESERVA_1', 'RESERVA_2']},
  {re: /\bcafe da manha\b/, keys: ['CAFE']},
  {re: /\bbar\b/, keys: ['BAR', 'BAR_LOUNGE']},
  {re: /\bpraias?\b/, keys: ['PRAIA', 'PRAIA_2']},
  {re: /\b(?:sala de jogos|jogos|sinuca|pebolim)\b/, keys: ['JOGOS']},
  {re: /\b(?:quadras?|campo de futebol|futebol)\b/, keys: ['QUADRA']},
  {re: /\bcapela\b/, keys: ['CAPELA']},
  {re: /\b(?:auditorio|salao de eventos|espacos? (?:para|de) eventos?|eventos? corporativos?|coffee break)\b/, keys: ['AUDITORIO', 'AUDITORIO_2', 'COFFEE']},
  {re: /\b(?:fachada|entrada|hall|recepcao)\b/, keys: ['HOTEL_FACHADA', 'HOTEL_HALL']},
  {re: /\b(?:hotel|estrutura|dependencias|areas? comuns?|areas? de lazer|lazer|espacos?|ambientes?)\b/, keys: ['HOTEL_AEREA', 'HOTEL_PISCINA', 'HOTEL_HALL', 'PRAIA']},
];
const sitePhotoWords = /\b(fotos?|fotografias?|imagem|imagens|galeria|album|video|videos)\b/;
const otherMediaSubjects = /\b(aptos?|apartamentos?|quartos?|acomodac(?:ao|oes)|suites?|lofts?|piscinas?|hidro\w*|parquinhos?|parque infantil|playground|biciclet\w*|bikes?|barcos?|catamara|passeio|mesa posta|lua de mel|kit)\b/;
/** The site areas a photo request names, in the order the customer named them. */
export function sitePhotoKeys(message: string): string[] {
  const s = norm(message).replace(/\bhotel solar\b/g, 'hotel');
  if (!sitePhotoWords.test(s)) return [];
  // "Fotos da piscina do hotel" is the pool; "fotos do hotel" is the tour.
  const masked = otherMediaSubjects.test(s) ? s.replace(/\b(?:hotel|espacos?|ambientes?)\b/g, ' ') : s;
  const found: {index: number; keys: string[]}[] = [];
  let rest = masked;
  for (const subject of siteSubjects) {
    const match = subject.re.exec(rest);
    if (!match) continue;
    found.push({index: match.index, keys: subject.keys});
    // "Restaurante Reserva Solar" names one place, not two.
    rest = rest.slice(0, match.index) + ' '.repeat(match[0].length) + rest.slice(match.index + match[0].length);
    if (subject.keys[0] === 'RESERVA_1' || subject.keys[0] === 'S73_SALAO') rest = rest.replace(/\brestaurantes?\b/g, m => ' '.repeat(m.length));
  }
  if (!found.length) return [];
  // ManyChat delivers at most 4 photos per request.
  return [...new Set(found.sort((a, b) => a.index - b.index).flatMap(item => item.keys))].slice(0, 4);
}
/** A short reply that only names hotel areas ("restaurante", "e da quadra?"). */
export function siteSubjectOnly(message: string) {
  let s = norm(message).replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return false;
  let found = false;
  for (const subject of siteSubjects) {
    const re = new RegExp(subject.re.source, 'g');
    s = s.replace(re, () => { found = true; return ' @ '; });
  }
  return found && /^(?:(?:e|agora|tambem|a|o|as|os|da|do|das|dos|de|no|na|me|mande|manda|envie|envia|ver|por favor|pfv|@)\s*)+$/.test(s.replace(/\s+/g, ' ').trim());
}
export const reservaPhotoRequest = (message: string) => sitePhotoKeys(message).length > 0;
const siteReference = /^SITE_ID\|([A-Z0-9_]+)(?:\|([A-Z0-9_,]*))?$/;
export const sitePhotoUrl = (reference: string) => {
  const match = siteReference.exec(reference);
  return match ? photos[match[1]]?.url : undefined;
};
const siteResult = (keys: string[]) => {
  const valid = keys.filter(key => photos[key]);
  if (!valid.length) return {quote_request:'ROOM_DONE', quote_text:'', conversation_text:''};
  const [key, ...rest] = valid;
  const text = photos[key].caption + (rest.length ? '' : '\n\nSe quiser ver outro espaço do hotel, é só me dizer qual.');
  return {quote_request:`SITE_ID|${key}${rest.length ? '|' + rest.join(',') : ''}`, quote_text:text, conversation_text:text, match_type:'site_photo', availability_checked:false};
};
export function sitePhotoResult(next = false, reference = '', message = '') {
  if (next) {
    const match = siteReference.exec(reference);
    // Legacy "SITE_ID|RESERVA_1|RESERVA_2" still continues with RESERVA_2.
    return siteResult(match?.[2] ? match[2].split(',').filter(Boolean) : []);
  }
  return siteResult(message ? sitePhotoKeys(message) : ['RESERVA_1', 'RESERVA_2']);
}
