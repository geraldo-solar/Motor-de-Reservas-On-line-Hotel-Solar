import {readPackageContext} from './packageContext.js';

// Owner-confirmed on 2026-09-29 for the Réveillon Solar 2027 campaign:
// - the party can be bought without lodging (wristband R$ 800 per person,
//   Pix or credit card in up to 3x, with ceia, open bar, Banda Zona Rural + DJ);
// - lodging is sold only as the full 31/12–03/01 package. Partial stays such
//   as 01–03/01 are not accepted; nights before/after the package can be added.
// Anything else about the party (seating, venue, dress code) is not confirmed
// here and goes to the team instead of being guessed.
export const newYearSalesPolicy = {
  confirmed_at: '2026-09-29',
  package_start: '2026-12-31',
  package_end: '2027-01-03',
  party_wristband_price: 800,
  party_payment: 'Pix ou cartão de crédito em até 3x',
};

export type NewYearSalesReply = {kind: 'party_only' | 'party_detail' | 'partial_stay' | 'unknown_partner'; answer: string; handoff: boolean};

const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const belemToday = (now: number) => new Date(now - 3 * 3600000).toISOString().slice(0, 10);
const campaignActive = (now: number) => belemToday(now) <= '2026-12-31';
const privateEvent = /\b(?:aniversario|casamento|formatura|confraternizacao|evento|debutante|15 anos|cha de|empresa|corporativ[oa])\b/;
const newYearWords = /\b(?:reveillon|revellion|reveilon|revelion|ano novo|virada|festa da virada|31\/12)\b/;

export const newYearPartyOnlyAnswer = 'A Festa da Virada no Hotel Solar também pode ser comprada sem hospedagem, com pulseira: R$ 800 por pessoa, com ceia, open bar, Banda Zona Rural e DJ. O pagamento é no Pix ou no cartão de crédito em até 3x. Vou chamar nossa equipe para enviar o pagamento por aqui.';
export const newYearPartyDetailAnswer = 'Ainda não tenho essa informação da Festa da Virada confirmada aqui. Vou chamar nossa equipe para te responder por aqui.';
const newYearPartialStayRule = 'No Réveillon, a hospedagem é vendida somente no pacote completo, de 31/12/2026 a 03/01/2027 (3 diárias), com a Festa da Virada incluída. Não temos estadia parcial nesse período, como só de 01 a 03/01. Se quiserem, dá para somar diárias antes de 31/12 ou depois de 03/01 ao pacote completo.';
export const newYearPartialStayAnswer = newYearPartialStayRule + ' Para quantas pessoas seria? Contando adultos e crianças, já te passo o valor do pacote completo.';
export const unknownPartnerAnswer = (label?: string) => `Não tenho essa condição${label ? ` (${label})` : ''} confirmada aqui. Vou chamar nossa equipe para te responder por aqui.`;

function focusedOnNewYear(context: unknown, now: number) {
  const focus = readPackageContext(context, now);
  return !!focus && /\b(?:reveillon|ano novo|virada)\b/.test(norm(focus.name));
}

/** Party without lodging ("só a festa", "pulseira", "sem ficar hospedado"). */
export function newYearPartyOnlyInquiry(message: string, context?: unknown, now = Date.now()): boolean {
  const s = norm(message);
  if (!campaignActive(now) || !s || s.length > 400) return false;
  if (/\b(?:inclu(?:i|so|sa|sos|sas|ido|ida)|incluid[oa]s?)\b/.test(s) || privateEvent.test(s)) return false;
  const wristband = /\b(?:pulseiras?|ingressos?)\b/.test(s);
  const withoutLodging = /\b(?:so|somente|apenas)\s+(?:(?:a|na|pra|para a|para)\s+)?festa\b/.test(s)
    || /\bsem (?:ficar |me |nos |estar )?(?:hospedad[oa]s?|hospedagem|hospedar|estadia|dormir|pernoitar)\b/.test(s)
    || /\bnao (?:vou|vamos|quero|queremos|pretendo|pretendemos|precisamos|preciso) (?:ficar hospedad[oa]s?|me hospedar|nos hospedar|de hospedagem|dormir|pernoitar)\b/.test(s)
    || /\bfesta\b.{0,40}\b(?:avuls[oa]|separad[oa]|sem hospedagem|sem estadia)\b/.test(s);
  if (!wristband && !withoutLodging) return false;
  return wristband && (newYearWords.test(s) || /\bfesta\b/.test(s) || focusedOnNewYear(context, now) || /\bpulseiras?\b/.test(s))
    || withoutLodging && (newYearWords.test(s) || /\bfesta\b/.test(s) || focusedOnNewYear(context, now));
}

/** Specific party arrangements that are not confirmed in the catalogue. */
export function newYearPartyDetailInquiry(message: string, context?: unknown, now = Date.now()): boolean {
  const s = norm(message);
  if (!campaignActive(now) || !s || s.length > 400) return false;
  const party = /\bfesta\b/.test(s) || /\b(?:virada|reveillon|ano novo)\b/.test(s) && /\bnoite\b/.test(s);
  if (!party || privateEvent.test(s) || !newYearWords.test(s) && !focusedOnNewYear(context, now)) return false;
  if (/\b(?:inclu(?:i|so|sa|sos|sas|ido|ida)|incluid[oa]s?|fotos?|imagens?|videos?)\b/.test(s)) return false;
  return /\b(?:lugar(?:es)? marcad[oa]s?|assentos?|cadeiras?|sentar|mesas?|onde (?:vai ser|sera|fica|e|acontece)|local|traje|roupa|dress|que horas|horario|comeca|termina|ate que horas|idade minima|menores?|cardapio|o que tem na ceia|bebidas?|estacionamento)\b/.test(s);
}

type Range = {start: string; end: string};
/** "31/12 a 01/01", "de 30 a 2 de janeiro": a stay range around the New Year. */
export function newYearStayRange(message: string): Range | undefined {
  return newYearRange(norm(message));
}
function newYearRange(s: string): Range | undefined {
  const m = s.match(/\b(?:dia\s+)?(\d{1,2})(?:\/(\d{1,2})(?:\/(?:20)?2[67])?)?\s*(?:a|ate|ao|-)\s*(?:o\s+)?(?:dia\s+)?(\d{1,2})(?:\/(\d{1,2})(?:\/(?:20)?2[67])?)?(?!\s*(?:anos?|meses?|pessoas?|criancas?|adultos?|hospedes?|horas?|h\b|x\b|vezes))(?:\s+de\s+(dezembro|janeiro))?\b/);
  if (!m) return;
  const month = (day: number, explicit?: string) => explicit ? Number(explicit) : m[5] === 'janeiro' ? 1 : m[5] === 'dezembro' ? 12 : day >= 20 ? 12 : 1;
  let first = month(+m[1], m[2]);
  const last = month(+m[3], m[4]);
  // "de 30 a 2 de janeiro" names only the final month.
  if (!m[2] && m[5] === 'janeiro' && +m[1] > +m[3]) first = 12;
  if (![1, 12].includes(first) || ![1, 12].includes(last)) return;
  const iso = (mon: number, day: number) => {
    const year = mon === 12 ? 2026 : 2027;
    const d = new Date(Date.UTC(year, mon - 1, day, 12));
    return d.getUTCMonth() === mon - 1 && d.getUTCDate() === day ? d.toISOString().slice(0, 10) : undefined;
  };
  const start = iso(first, +m[1]), end = iso(last, +m[3]);
  return start && end && end > start ? {start, end} : undefined;
}

const skipsPartyNight = (s: string) => /\b(?:sem|nao (?:quero|queremos|vou|vamos|pretendo|pretendemos))\s+(?:passar|ficar|estar|participar)?\s*(?:a |na |da |do )?(?:virada|festa|reveillon|noite (?:de|do dia) 31|dia 31)\b/.test(s)
  || /\b(?:depois|apos) (?:da virada|do reveillon|do dia 31)\b/.test(s);

/** A stay inside the New Year period that leaves out part of the package. */
export function partialNewYearStay(message: string, context?: unknown, now = Date.now()): boolean {
  const s = norm(message);
  if (!campaignActive(now) || !s || s.length > 500) return false;
  const newYear = newYearWords.test(s) || focusedOnNewYear(context, now);
  const skipsParty = skipsPartyNight(s);
  const range = newYearRange(s);
  const partialRange = !!range && range.start < newYearSalesPolicy.package_end && range.end > newYearSalesPolicy.package_start
    && !(range.start <= newYearSalesPolicy.package_start && range.end >= newYearSalesPolicy.package_end);
  const stayWords = /\b(?:ficar|hospedar|hospedagem|estadia|reservar|reserva|chegar|entrar|sair|diarias?|noites?|pacote|so de|apenas de|somente de|dias|disponibilidade|vagas?|quartos?|apartamentos?|suites?|pessoas|adultos|hospedes)\b/.test(s);
  if (partialRange && stayWords && (newYear || /\bjaneiro\b/.test(s) || range!.start >= '2026-12-31')) return true;
  return skipsParty && newYear && stayWords && !/\bfesta\b.{0,30}\bsem hospedagem\b/.test(s);
}

const knownAcceptance = new Set(['pix', 'cartao', 'cartoes', 'credito', 'debito', 'dinheiro', 'especie', 'boleto', 'transferencia', 'cheque',
  'pet', 'pets', 'cachorro', 'cachorros', 'gato', 'gatos', 'animal', 'animais', 'crianca', 'criancas', 'bebe', 'bebes', 'reserva', 'reservas',
  'parcelamento', 'parcelado', 'grupo', 'grupos', 'evento', 'eventos', 'visita', 'visitas', 'visitante', 'visitantes', 'day', 'use']);

/** Partners, agencies, vouchers and unknown acronyms ("aceitam RDC?"). */
export function unknownPartnerInquiry(message: string): string | undefined {
  const raw = String(message || '');
  const s = norm(raw);
  if (!s || s.length > 400) return;
  const named = /\b(rdc(?: viagens)?|cvc|hurb|decolar|livelo|smiles|123 ?milhas)\b/.exec(s);
  if (named) return named[1].toUpperCase().replace('VIAGENS', 'Viagens');
  if (/\b(?:convenio|parceria|agencia de viage(?:m|ns)|operadora de turismo|voucher|vale[- ]viagem|milhas)\b/.test(s)
    && /\b(?:aceit|tem|possu|trabalh|fazem|faz|usar|posso|da pra|desconto)/.test(s)) return;
  const acronym = /\b(?:aceita[m]?|aceitam|trabalha[m]? com|tem convenio com|tem parceria com|atende[m]?|desconto (?:do|da|pelo|pela|para))\s+(?:o |a |os |as |com |pelo |pela )?([A-Z]{2,6})\b/.exec(raw.normalize('NFD').replace(/[̀-ͯ]/g, ''));
  if (acronym && !knownAcceptance.has(acronym[1].toLowerCase()) && !/^(?:PIX|CPF|RG|CNH|PCD|TV|AC|DJ|WIFI|OK)$/.test(acronym[1])) return acronym[1];
  const token = /\baceit(?:a|am|em)\s+(?:o|a|os|as)\s+([a-z0-9]{2,12})\s*[?.!]*$/.exec(s);
  if (token && !knownAcceptance.has(token[1])) return token[1].length <= 5 ? token[1].toUpperCase() : token[1];
  return undefined;
}

export function unknownPartnerRequest(message: string): boolean {
  const s = norm(message);
  return unknownPartnerInquiry(message) !== undefined
    || /\b(?:convenio|parceria|agencia de viage(?:m|ns)|operadora de turismo|voucher|vale[- ]viagem|milhas)\b/.test(s)
      && /\b(?:aceit|tem|possu|trabalh|fazem|faz|usar|posso|da pra|desconto)/.test(s);
}

// Catalogue record of the campaign package (ManyChat tag "RV27 IA"). The
// resolver re-reads it from the catalogue by id before answering anything.
export const newYearCampaignPackage = {
  id: '0267abd7-ba19-4492-8894-aea827edea33',
  name: 'Réveillon Solar 2027: A Virada em Salinas',
  start_date: newYearSalesPolicy.package_start,
  end_date: newYearSalesPolicy.package_end,
};

/** A campaign lead's conversation starts in the Réveillon package ("2 adultos
 * e 1 criança" answers the ad's greeting). Another period, holiday or stay
 * already being quoted is a different trip and is never forced into it. */
export function newYearCampaignSeed(message: string, facts: {check_in?: string; check_out?: string} | undefined, now = Date.now()) {
  if (!campaignActive(now)) return;
  const s = norm(message);
  if (/\b\d{1,2}\s*\/\s*\d{1,2}\b|\b\d{1,2}\s+(?:de\s+)?(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\b/.test(s)) return;
  if (/\b(?:feriados?|natal|carnaval|pascoa|finados|ostrabeach|dia das criancas|independencia|fim de semana|final de semana|hoje|amanha|semana que vem|setembro|outubro|novembro|janeiro|fevereiro|marco|abril|julho)\b/.test(s)) return;
  // "Qual o valor da diária para casal" asks the ordinary rate, not the package.
  if (!newYearWords.test(s) && /\b(?:diarias?|pernoites?|day ?use|segunda|terca|quarta|quinta|sexta|sabado|domingo|(?:esta|essa|nesta|nessa|proxima) semana|(?:este|esse|neste|nesse) mes|mes que vem)\b/.test(s)) return;
  if (facts?.check_in && facts?.check_out
    && !(facts.check_in < newYearCampaignPackage.end_date && facts.check_out > newYearCampaignPackage.start_date)) return;
  return {...newYearCampaignPackage, updated_at: now};
}

/** Dates that touch the full-period package without covering it (31/12–01/01)
 * are quoted as the whole package, keeping any extra nights asked for. */
export function newYearFullPeriod(checkIn?: string, checkOut?: string, now = Date.now()) {
  const {package_start: start, package_end: end} = newYearSalesPolicy;
  if (!campaignActive(now) || !checkIn || !checkOut || checkOut <= checkIn) return;
  if (!(checkIn < end && checkOut > start) || checkIn <= start && checkOut >= end) return;
  return {check_in: checkIn < start ? checkIn : start, check_out: checkOut > end ? checkOut : end};
}

export type NewYearStayRequest = {requested_check_in: string; requested_check_out: string};

/** The partial dates a widened quote came from, while they still explain the facts. */
export function readNewYearStayRequest(value: any, facts: {check_in?: string; check_out?: string} | undefined, now = Date.now()): NewYearStayRequest | undefined {
  const full = newYearFullPeriod(value?.requested_check_in, value?.requested_check_out, now);
  return full && full.check_in === facts?.check_in && full.check_out === facts?.check_out
    ? {requested_check_in: value.requested_check_in, requested_check_out: value.requested_check_out} : undefined;
}

const formatDay = (iso: string) => iso.split('-').reverse().join('/');
export const newYearFullPeriodNote = (asked: NewYearStayRequest) =>
  `📌 Você pediu ${formatDay(asked.requested_check_in)} a ${formatDay(asked.requested_check_out)}, mas no Réveillon a hospedagem é vendida somente no pacote completo. Por isso os valores já consideram ${formatDay(newYearFullPeriod(asked.requested_check_in, asked.requested_check_out)?.check_in || newYearSalesPolicy.package_start)} a ${formatDay(newYearFullPeriod(asked.requested_check_in, asked.requested_check_out)?.check_out || newYearSalesPolicy.package_end)}.`;

const partyMention = /\b(?:\d{1,2}|uma|um|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+(?:pessoas?|adultos?|hospedes?)\b|\bcasal\b/;

/** Réveillon sales answer for this turn. "31/12 a 01/01 para 5 pessoas" has
 * everything to price the full package, so it is quoted (widened dates)
 * instead of only declining the partial stay. */
export function newYearSalesTurn(message: string, context: unknown, guests: number | undefined, now = Date.now()): NewYearSalesReply | undefined {
  const reply = newYearSalesReply(message, context, now);
  if (reply?.kind !== 'partial_stay') return reply;
  const s = norm(message);
  // Declining the party night itself ("não quero passar a virada") gets the rule.
  if (newYearStayRange(message) && (guests || partyMention.test(s)) && !skipsPartyNight(s)) return;
  return guests ? {...reply, answer: newYearPartialStayRule} : reply;
}

/** Deterministic Réveillon sales answers, in priority order. */
export function newYearSalesReply(message: string, context?: unknown, now = Date.now()): NewYearSalesReply | undefined {
  if (newYearPartyOnlyInquiry(message, context, now)) return {kind: 'party_only', answer: newYearPartyOnlyAnswer, handoff: true};
  if (partialNewYearStay(message, context, now)) return {kind: 'partial_stay', answer: newYearPartialStayAnswer, handoff: false};
  if (newYearPartyDetailInquiry(message, context, now)) return {kind: 'party_detail', answer: newYearPartyDetailAnswer, handoff: true};
  if (unknownPartnerRequest(message)) return {kind: 'unknown_partner', answer: unknownPartnerAnswer(unknownPartnerInquiry(message)), handoff: true};
  return undefined;
}
