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
  // Confirmed by the owner on 30/09/2026.
  party_details_confirmed_at: '2026-09-30',
  party_hours: 'das 21h às 2h',
  party_venue: 'na pérgola da piscina do hotel',
  party_seating: 'não há lugar marcado: os lugares são por ordem de chegada',
  party_min_age: 'não há idade mínima',
  rdc_bookings: 'as reservas da RDC Viagens são feitas somente pelo canal de atendimento da própria RDC',
  // Confirmed by the owner on 01/10/2026 for the lodging package (not the
  // party-only wristband): up to 6x on card, or 10% off when paid à vista.
  package_installments: 6,
  cash_discount_pct: 10,
  payment_confirmed_at: '2026-10-01',
};

export type NewYearSalesReply = {kind: 'party_only' | 'party_detail' | 'partial_stay' | 'unknown_partner' | 'payment' | 'price_objection'; answer: string; handoff: boolean};

const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const belemToday = (now: number) => new Date(now - 3 * 3600000).toISOString().slice(0, 10);
const campaignActive = (now: number) => belemToday(now) <= '2026-12-31';
const privateEvent = /\b(?:aniversario|casamento|formatura|confraternizacao|evento|debutante|15 anos|cha de|empresa|corporativ[oa])\b/;
const newYearWords = /\b(?:reveillon|revellion|reveilon|revelion|ano novo|virada|festa da virada|31\/12)\b/;

export const newYearPartyOnlyAnswer = 'A Festa da Virada no Hotel Solar também pode ser comprada sem hospedagem, com pulseira: R$ 800 por pessoa, com ceia, open bar, Banda Zona Rural e DJ. O pagamento é no Pix ou no cartão de crédito em até 3x. Vou chamar nossa equipe para enviar o pagamento por aqui.';
const partyIncluded = 'a festa tem ceia, open bar, Banda Zona Rural e DJ, e está incluída no pacote de hospedagem';
export const newYearPartyDetailAnswer = `Esse detalhe da Festa da Virada ainda não está confirmado por aqui, e prefiro não te passar nada impreciso. O que já está confirmado: ${partyIncluded}. Se esse detalhe for decisivo para você, escreva “recepção” que a nossa equipe confirma.`;

/** Party details the owner confirmed (30/09); anything else stays unconfirmed. */
export function newYearPartyDetailReply(message: string): string {
  const s = norm(message);
  const p = newYearSalesPolicy;
  const known: string[] = [];
  if (/\b(?:que horas|horario|comeca|termina|ate que horas)\b/.test(s)) known.push(`A Festa da Virada vai ${p.party_hours}.`);
  if (/\b(?:onde (?:vai ser|sera|fica|e|acontece)|local)\b/.test(s)) known.push(`Ela acontece ${p.party_venue}.`);
  if (/\b(?:lugar(?:es)? marcad[oa]s?|assentos?|cadeiras?|sentar|mesas?)\b/.test(s)) known.push(`Na festa, ${p.party_seating}.`);
  if (/\b(?:idade minima|menores?)\b/.test(s)) known.push(`Para a festa, ${p.party_min_age}.`);
  const unknown = /\b(?:traje|roupa|dress|cardapio|o que tem na ceia|bebidas?)\b/.test(s);
  if (!known.length) return newYearPartyDetailAnswer;
  if (unknown) known.push(`O traje e o cardápio ainda não estão confirmados por aqui; se forem decisivos, escreva “recepção” que a nossa equipe confirma.`);
  return known.join(' ');
}
const newYearPartialStayRule = 'No Réveillon, a hospedagem é vendida somente no pacote completo, de 31/12/2026 a 03/01/2027 (3 diárias), com a Festa da Virada incluída. Não temos estadia parcial nesse período, como só de 01 a 03/01. Se quiserem, dá para somar diárias antes de 31/12 ou depois de 03/01 ao pacote completo.';
export const newYearPartialStayAnswer = newYearPartialStayRule + ' Para quantas pessoas seria? Contando adultos e crianças, já te passo o valor do pacote completo.';
export const unknownPartnerAnswer = (label?: string) => `Não tenho condição especial${label ? ` com ${label}` : ''} confirmada aqui: os valores que passo são os do próprio hotel, com reserva direto conosco. Se quiser que a nossa equipe confira, escreva “recepção”.`;

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
  // Parking is general hotel knowledge (free for guests), not a party detail.
  return /\b(?:lugar(?:es)? marcad[oa]s?|assentos?|cadeiras?|sentar|mesas?|onde (?:vai ser|sera|fica|e|acontece)|local|traje|roupa|dress|que horas|horario|comeca|termina|ate que horas|idade minima|menores?|cardapio|o que tem na ceia|bebidas?)\b/.test(s);
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
  // "Entrada dia 22, saída dia 23" gives dates without a month: never assume
  // the Réveillon (and December) for them.
  if (/\b(?:dias?|de|do)\s+\d{1,2}\s+(?:a|ao|ate|e)\s+(?:o\s+)?(?:dia\s+)?\d{1,2}\b|\bdias?\s+\d{1,2}\b|\b(?:entrada|saida|check ?-?in|check ?-?out|chegada|chegar|sair)\b/.test(s)) return;
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
export function newYearSalesTurn(message: string, context: unknown, guests: number | undefined, now = Date.now(), campaignLead = false): NewYearSalesReply | undefined {
  const reply = newYearSalesReply(message, context, now) || newYearPaymentReply(message, context, campaignLead, now);
  if (reply?.kind !== 'partial_stay') return reply;
  const s = norm(message);
  // Declining the party night itself ("não quero passar a virada") gets the rule.
  if (newYearStayRange(message) && (guests || partyMention.test(s)) && !skipsPartyNight(s)) return;
  return guests ? {...reply, answer: newYearPartialStayRule} : reply;
}

// "à vista" is a payment term only outside room views ("vista mar", "a vista
// para o mar", "Sacada Vista Mar").
const cash = '(?:a vista|avista)(?!\\s*(?:e\\s+|eh\\s+)?(?:mar|para|pro|pra|do|da|de|das|dos|piscina|frontal|lateral|bonita|mais|linda))';
const paymentQuestion = new RegExp(`\\b(?:${cash}|desconto|pix|parcel\\w*|em quantas vezes|quantas vezes|formas? de pagamento|como (?:eu )?(?:pago|pagar|faco o pagamento)|como funciona o pagamento|no cartao|de cartao)\\b`);
const payCashIntent = new RegExp(`\\b(?:quero|vou|prefiro|vamos|pode ser|fecho|fechamos|consigo|da pra|posso)\\b.{0,25}\\b(?:${cash}|no pix|via pix)|^(?:${cash}|no pix)(?: entao| mesmo| por favor)?[.!]*$`);
const priceObjection = /\b(?:caro|cara|carissimo|susto|salgad[oa]|puxad[oa]|fora do (?:meu |nosso )?orcamento|acima do (?:meu |nosso )?orcamento|nao cabe no (?:meu |nosso )?bolso|absurdo|muito alto|valor alto|nao tenho condic\w*|nao temos condic\w*|por (?:esse|este) (?:valor|preco))\b/;

export const newYearPaymentAnswer = () => `No pacote do Réveillon, você pode pagar em até ${newYearSalesPolicy.package_installments}x no cartão ou à vista com ${newYearSalesPolicy.cash_discount_pct}% de desconto. Se preferir à vista com o desconto, é só me avisar que a nossa equipe finaliza o pagamento com você por aqui.`;
export const newYearCashIntentAnswer = () => `Combinado! No pagamento à vista, o pacote do Réveillon tem ${newYearSalesPolicy.cash_discount_pct}% de desconto. Vou chamar a nossa equipe para finalizar o pagamento com você por aqui.`;
export const newYearPriceObjectionFallback = () => `Entendo! O pacote inclui as 3 noites, a Festa da Virada com ceia, open bar, Banda Zona Rural e DJ, e o passeio de barco. Dá para parcelar em até ${newYearSalesPolicy.package_installments}x no cartão ou pagar à vista com ${newYearSalesPolicy.cash_discount_pct}% de desconto, e criança de até 6 anos não paga. Quer que eu calcule a opção mais em conta para o seu grupo?`;

/** A campaign lead talks about the Réveillon unless the stay facts point to
 * another period (a lost package focus must not lose the 6x/discount rule). */
export function newYearCampaignFocus(campaign: unknown, facts?: {check_in?: string; check_out?: string}) {
  if (campaign !== 'RV27') return false;
  if (!facts?.check_in || !facts?.check_out) return true;
  return facts.check_in < newYearSalesPolicy.package_end && facts.check_out > newYearSalesPolicy.package_start;
}

/** Lodging payment and price reactions in the Réveillon conversation. */
function newYearPaymentReply(message: string, context: unknown, campaignLead: boolean, now: number): NewYearSalesReply | undefined {
  const s = norm(message);
  if (!campaignActive(now) || !s || s.length > 300) return;
  if (!(newYearWords.test(s) || focusedOnNewYear(context, now) || campaignLead)) return;
  if (/\b(?:pulseiras?|ingressos?|comprovante|paguei|ja paguei|reembolso|estorno)\b/.test(s)) return;
  if (payCashIntent.test(s)) return {kind: 'payment', answer: newYearCashIntentAnswer(), handoff: true};
  if (paymentQuestion.test(s)) return {kind: 'payment', answer: newYearPaymentAnswer(), handoff: false};
  if (priceObjection.test(s) && !/\b(?:barat[oa]|mais em conta|mais economic[oa])\b/.test(s))
    return {kind: 'price_objection', answer: newYearPriceObjectionFallback(), handoff: false};
  return;
}

/** Confirmed Réveillon rules for the AI context while the campaign runs. The
 * prompt gives the most recent owner confirmation priority over older rules
 * (e.g. "30/12 a 02/01 precisa de consulta à recepção", replaced on 29/09). */
export function newYearPolicyContext(message: string, context: unknown, campaignLead: boolean, now = Date.now()) {
  if (!campaignActive(now) || !(campaignLead || focusedOnNewYear(context, now) || newYearWords.test(norm(message)))) return undefined;
  return {
    confirmado_pelo_responsavel_em: newYearSalesPolicy.confirmed_at,
    prevalece_sobre: 'Regras antigas que mandavam consultar a recepção para outras datas do Réveillon.',
    hospedagem: 'Vendida somente no pacote completo de 31/12/2026 a 03/01/2027 (3 diárias). Não há estadia parcial dentro desse período (como 30/12 a 02/01 ou 01 a 03/01). Diárias antes de 31/12 ou depois de 03/01 podem ser somadas ao pacote completo. Explique a regra e ofereça calcular o pacote completo para o grupo; não mande consultar a recepção por isso.',
    festa_da_virada: `Incluída no pacote: ceia, open bar, Banda Zona Rural e DJ. Horário: ${newYearSalesPolicy.party_hours}. Local: ${newYearSalesPolicy.party_venue}. Lugares: ${newYearSalesPolicy.party_seating}. Idade: ${newYearSalesPolicy.party_min_age}. (Confirmado em 30/09/2026.)`,
    rdc_viagens: `${newYearSalesPolicy.rdc_bookings[0].toUpperCase()}${newYearSalesPolicy.rdc_bookings.slice(1)}. Por aqui, somente reservas diretas com o hotel.`,
    festa_sem_hospedagem: `Pulseira R$ ${newYearSalesPolicy.party_wristband_price} por pessoa, ${newYearSalesPolicy.party_payment}, com ceia, open bar, Banda Zona Rural e DJ. A equipe envia o pagamento nesta conversa.`,
    pagamento_do_pacote: `Em até ${newYearSalesPolicy.package_installments}x no cartão, ou à vista com ${newYearSalesPolicy.cash_discount_pct}% de desconto (confirmado em 01/10/2026). Não use a regra de 3x das reservas comuns para o Réveillon. Pagamento à vista é finalizado pela equipe nesta conversa.`,
    detalhes_nao_confirmados: 'Traje, cardápio da ceia e bebidas do open bar ainda não foram confirmados. Diga que esse detalhe ainda não está confirmado, sem inventar, e continue ajudando; se o cliente quiser, ele pode escrever “recepção”.',
    como_reservar: `Escolher a acomodação na simulação e confirmar a opção; a recepção finaliza nesta conversa. Também é possível reservar pelo site: https://reservas.hotelsolar.tur.br/?pacote=${newYearCampaignPackage.id}`,
  };
}

/** Self-service checkout for the exact package period (the site checks
 * availability and takes payment online). */
export function newYearSiteLink(checkIn: string, checkOut: string, now = Date.now()) {
  if (!campaignActive(now) || checkIn !== newYearSalesPolicy.package_start || checkOut !== newYearSalesPolicy.package_end) return;
  return `https://reservas.hotelsolar.tur.br/?pacote=${newYearCampaignPackage.id}&utm_source=whatsapp&utm_medium=ia&utm_campaign=reveillon2027`;
}

/** Deterministic Réveillon sales answers, in priority order. */
export function newYearSalesReply(message: string, context?: unknown, now = Date.now()): NewYearSalesReply | undefined {
  if (newYearPartyOnlyInquiry(message, context, now)) return {kind: 'party_only', answer: newYearPartyOnlyAnswer, handoff: true};
  if (partialNewYearStay(message, context, now)) return {kind: 'partial_stay', answer: newYearPartialStayAnswer, handoff: false};
  // Unconfirmed details are answered as such and the AI keeps selling; the
  // customer can still ask for the team (owner, 30/09: the AI should answer).
  if (newYearPartyDetailInquiry(message, context, now)) return {kind: 'party_detail', answer: newYearPartyDetailReply(message), handoff: false};
  if (unknownPartnerRequest(message)) {
    const label = unknownPartnerInquiry(message);
    return {kind: 'unknown_partner', handoff: false, answer: /^rdc/i.test(label || '')
      ? `Por aqui não fazemos reservas da RDC: ${newYearSalesPolicy.rdc_bookings}. Se quiser reservar direto com o hotel, os valores que passo são os nossos e posso seguir com você por aqui.`
      : unknownPartnerAnswer(label)};
  }
  return undefined;
}
