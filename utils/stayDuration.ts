import {readSplitStayDates,splitStayQuestion,type SplitStayDatePending} from './conversationalStayDates.js';
import {affirmedStayInformation} from './stayInformation.js';
// A stated duration is conversational intent, not permission to extend a stay.
export type StayDuration = { count: number; unit: 'days' | 'nights'; at: number };
export type StayDatePending = {
  at: number;
  reason: 'duration_conflict' | 'relative_dates' | 'unparsed_dates' | 'rejected_dates' | 'relative_checkout' | 'checkout_correction' | 'split_dates' | 'alternative_dates';
  days?: [number,number]; month?:number; year?:number; weekday_span?:[number,number];
  check_in?: string;
  check_out?: string;
  suggested_check_out?: string;
  checkout_weekday?: number;
};
const norm = (s: string) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\bhj\b/g, 'hoje').replace(/\s+/g, ' ').trim();
const recent = (at: unknown, now: number) => typeof at === 'number' && Number.isFinite(at) && at > 0 && at <= now && now - at <= 30 * 60000;
const validDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
export const stayNights = (start: string, end: string) => (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000;
const belemDate = (now: number): string | undefined => {
  const date = new Date(now - 3 * 3600000);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : undefined;
};

export function readStayDuration(value: any, now = Date.now()): StayDuration | undefined {
  if (!value || !Number.isInteger(value.count) || value.count < 1 || value.count > 30
    || !['days', 'nights'].includes(value.unit) || !recent(value.at, now)) return;
  return { count: value.count, unit: value.unit, at: value.at };
}

export function readStayDatePending(value: any, now = Date.now()): StayDatePending | undefined {
  if (!value || !recent(value.at, now)) return;
  if(value.reason==='split_dates')return readSplitStayDates(value,now);
  if (value.reason === 'relative_dates' || value.reason === 'unparsed_dates' || value.reason === 'rejected_dates' || value.reason === 'alternative_dates') return { at: value.at, reason: value.reason };
  if (value.reason === 'checkout_correction') return validDate(value.check_in)
    ? {at:value.at,reason:'checkout_correction',check_in:value.check_in} : undefined;
  if (value.reason === 'relative_checkout') {
    // A relative entry belongs to the local day when the customer said it.
    // Crossing midnight requires a new date clarification, not an old "today".
    if (!validDate(value.check_in) || value.check_in !== belemDate(value.at)
      || value.check_in !== belemDate(now)) return;
    if (value.suggested_check_out !== undefined && (!validDate(value.suggested_check_out)
      || stayNights(value.check_in, value.suggested_check_out) < 1
      || stayNights(value.check_in, value.suggested_check_out) > 30)) return;
    if (value.checkout_weekday !== undefined && (!Number.isInteger(value.checkout_weekday)
      || value.checkout_weekday < 0 || value.checkout_weekday > 6 || !value.suggested_check_out
      || new Date(value.suggested_check_out+'T12:00:00Z').getUTCDay() !== value.checkout_weekday)) return;
    return { at: value.at, reason: 'relative_checkout', check_in: value.check_in,
      ...(value.suggested_check_out === undefined ? {} : {suggested_check_out:value.suggested_check_out}),
      ...(value.checkout_weekday === undefined ? {} : {checkout_weekday:value.checkout_weekday}) };
  }
  if (value.reason !== 'duration_conflict' || !validDate(value.check_in)
    || !validDate(value.check_out) || !validDate(value.suggested_check_out)) return;
  const nights = stayNights(value.check_in, value.check_out);
  const suggested = stayNights(value.check_in, value.suggested_check_out);
  if (nights < 1 || nights > 30 || suggested < 1 || suggested > 30 || nights === suggested) return;
  return { at: value.at, reason: 'duration_conflict', check_in: value.check_in,
    check_out: value.check_out, suggested_check_out: value.suggested_check_out };
}

export function stayDurationRequest(message: string, now = Date.now()): StayDuration | undefined {
  const s = norm(message);
  const words: Record<string, number> = { um:1, uma:1, dois:2, duas:2, tres:3, quatro:4, cinco:5, seis:6, sete:7, oito:8, nove:9, dez:10 };
  const match = /\b(\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+(dias?|noites?|diarias?)\b/.exec(s);
  if (!match || /\bnao\b.{0,25}$/.test(s.slice(0, match.index))) return;
  const count = words[match[1]] || Number(match[1]);
  return readStayDuration({ count, unit: /^dias?$/.test(match[2]) ? 'days' : 'nights', at: now }, now);
}

export const explicitStayBoundaries = (message: string) => /\b(?:entrada|check.?in|chego|entro)\b/.test(norm(message))
  && /\b(?:saida|check.?out|saio)\b/.test(norm(message));
export const explicitStayEntry = (message: string) => /\b(?:entrada|check.?in|chego|entro)\b/.test(norm(message));
export const explicitStayExit = (message: string) => /\b(?:saida|check.?out|saio)\b/.test(norm(message));
export const calendarDateMention = (message: string) => /\b(?:20\d{2}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/(?:20)?\d{2})?|\d{1,2}(?:\s+de)?\s+(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro))\b/.test(norm(message));
export const relativeStayDateMention = (message: string) => /\b(?:hoje|amanha|depois de amanha)\b/.test(norm(message));

const checkoutWeekdays=['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
const checkoutWeekdayLabels=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
const weekdayPeriodEnd = `(?:(?:na|no|nesta|neste|nessa|nesse) )?(?:proxim[oa] )?(?:${checkoutWeekdays.join('|')})(?:[ -]feira)?(?: (?:que vem|da semana que vem|da proxima semana|desta semana|dessa semana))?`;
const relativePeriodEnd='(?:depois de amanha|amanha)';
const periodEnd=`(?:${relativePeriodEnd}|${weekdayPeriodEnd})`;
const availabilityPredicate='(?:(?:voce|voces|vc|vcs|o hotel(?: solar)?) )?(?:tem|ha|teria|teriam|existe|existem|possui|possuem) (?:alguma? )?(?:disponibilidade|vagas?|quartos?|suites?|apartamentos?)';
// Recognize an indirect availability question by its verb AND complement,
// not by removing every "se". A later "caso/se eu decidir" remains a guard.
const inquiryVerb='(?:saber|soubesse|ver|veja|visse|verificar|verifica|verifique|verificasse|verificassem|consultar|consulte|consultasse|consultassem|conferir|confira|conferisse|informar|informe|informasse|dizer|diga|dissesse)';
const inquiryAside='(?:(?:(?:pra|para) (?:mim|nos|gente|a gente)|por favor|pfv),? )*';
const indirectAvailability=new RegExp(`\\b${inquiryVerb} ${inquiryAside}se (?=${availabilityPredicate}\\b)`,'g');
// Read both boundaries from one current message. The allowed tail contains
// only a party, courtesy, or availability question; extra dates/times and
// alternatives must never silently select the first matching endpoint.
const todayPeriod=new RegExp(`\\bhoje(?: (?:a|ate|ao|para|pra) |(?:,? e |, | )(?:a )?(?:saida(?: e| sera)?|saio|sair|saindo|check.?out)(?: (?:e|sera))? )(${periodEnd})\\b`);
function combinedTodayPeriod(s:string):RegExpExecArray|undefined{
  const period=todayPeriod.exec(s);
  if(!period)return;
  const outside=s.slice(0,period.index)+' '+s.slice(period.index+period[0].length);
  // Spoken requests may repeat the same arrival ("vaga hoje, entrando
  // hoje..."). A different relative day or weekday is still ambiguous.
  if(new RegExp(`\\b(?:amanha|${checkoutWeekdays.join('|')})\\b`).test(outside))return;
  const tail=s.slice(period.index+period[0].length).replace(/^[,;.!?\s]+/,'').replace(/[.!?]+$/,'').trim();
  if(!tail||/^(?:por favor|pfv)$/.test(tail)||new RegExp(`^${availabilityPredicate}(?: (?:por favor|pfv))?$`).test(tail))return period;
  if(/^(?:para|pra|somos) (?:\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|casal)\b/.test(tail)
    && !/\b(?:ou|talvez|horas?|as|manha|tarde|noite)\b|\d\s*[:h]/.test(tail))return period;
}

// This recognizes an arrival requested for today, not merely a conversation
// happening today. An earlier checkout is only a candidate, never a stay fact.
export function todayStayDatePending(message: string, previousCheckOut?: string, now = Date.now(), awaitingDates=false): StayDatePending | undefined {
  const s = norm(message);
  const period = combinedTodayPeriod(s);
  const shortToday=awaitingDates&&/^(?:(?:para|pra|entrada|entro|chego)(?: e| sera)? )?hoje[.!?]*$/.test(s);
  if (!/\bhoje\b/.test(s) || calendarDateMention(s) || stayDurationRequest(s, now)
    || !period && (explicitStayExit(s) || /\b(?:amanha|ate)\b/.test(s))) return;
  // A conditional availability question supplies a date to CONSULT, not
  // consent to book. Other hypothetical/negated statements remain excluded.
  const conditionalInquiry=/\b(?:se|caso) (?:eu |nos )?(?:quiser|quisermos|for|formos)\b/.test(s)
    && /\b(?:tem|ha|teria|teriam) (?:alguma? )?(?:vagas?|quartos?|disponibilidade)\b/.test(s);
  const hypothesisText=s.replace(indirectAvailability,'consultar ');
  if (/\bnao\b/.test(s)||/\b(?:se|caso|quando)\b/.test(hypothesisText)&&!conditionalInquiry) return;
  if (/\b(?:day[ -]?use|restaurante|reserva solar|cardapio|cafe|almoco|jantar|massagem|massagens|passeio|piscina|fotos?|imagens?|horarios?|que horas|inclui|incluso|inclusa|pagamento|pagar|paguei|pagamos|comprovante|boleto|reembolso|ja estou hospedado|ja estamos hospedados)\b/.test(s)) return;
  const lodging = /\b(?:diarias?|hospedagem|estadia|hospedar|quartos?|apartamentos?|aptos?|suites?|vagas?|disponibilidade|check.?in|entrada)\b/.test(s);
  const arrivalToday = /\b(?:para|pra|de|em) (?:o dia de )?hoje\b|\b(?:diarias?|hospedagem|estadia|hospedar|quartos?|apartamentos?|aptos?|suites?|vagas?|chego|chegar|chegando|entro|entrar|entrando) hoje\b|\b(?:entrada|check.?in) (?:e |sera )?hoje\b/.test(s);
  const inquiry = /\b(?:valor|preco|quanto|qual|orcamento|cotacao|cotar|disponibilidade|tem|quero|queremos|preciso|precisamos|gostaria|pretendo|vamos|vou|chego|entro|entrada|check.?in)\b/.test(s);
  const declaredArrival=/\b(?:entrar|entrando|chego|chegar|chegando|entro|entrada|check.?in) hoje\b/.test(s);
  const barePeriod=!!period&&/^(?:de )?$/.test(s.slice(0,period.index));
  const contextualPeriod=!!period&&(awaitingDates||lodging&&inquiry||declaredArrival||barePeriod);
  if (!shortToday&&!contextualPeriod&&(!lodging || !arrivalToday || !inquiry)) return;
  const check_in = belemDate(now);
  if (!check_in) return;
  // The combined period supplies a candidate, not confirmed dates. Reuse the
  // same calendar calculation as a separate weekday reply, without bypassing
  // the controller's shown-question gate for a subsequent "sim".
  if(period){
    const relativeEnd=relativeCheckoutDate(check_in,period[1]);
    if(relativeEnd)return readStayDatePending({at:now,reason:'relative_checkout',check_in,
      suggested_check_out:relativeEnd,checkout_weekday:new Date(relativeEnd+'T12:00:00Z').getUTCDay()},now);
    return weekdayCheckoutCandidate({at:now,reason:'relative_checkout',check_in},period[1],now);
  }
  const candidate = validDate(previousCheckOut) && stayNights(check_in, previousCheckOut) >= 1
    && stayNights(check_in, previousCheckOut) <= 30 ? previousCheckOut : undefined;
  return readStayDatePending({at:now,reason:'relative_checkout',check_in,
    ...(candidate ? {suggested_check_out:candidate} : {})}, now);
}

function relativeCheckoutDate(checkIn:string,relative:string):string|undefined{
  const days=relative==='amanha'?1:relative==='depois de amanha'?2:undefined;
  if(days===undefined)return;
  const end=new Date(checkIn+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+days);
  return end.toISOString().slice(0,10);
}

// An answer to the current checkout question, never a date taken from a
// meal, an unrelated "tomorrow", or a model-generated answer.
export function relativeCheckoutReply(value:unknown,message:string,shown:boolean,now=Date.now()):{check_in:string;check_out:string}|undefined {
  const pending=readStayDatePending(value,now),s=norm(message);
  if(!shown||pending?.reason!=='relative_checkout'||!pending.check_in)return;
  const match=/^(?:(?:saida(?: e| sera)?|saio|sair|ate|vamos sair|quero sair) )?(amanha|depois de amanha)[.!]*$/.exec(s);
  if(!match)return;
  return {check_in:pending.check_in,check_out:relativeCheckoutDate(pending.check_in,match[1])!};
}

// A weekday reply supplies a candidate, not a checkout fact. The concrete
// calendar date must be shown and confirmed through the existing question gate.
export function weekdayCheckoutPending(value:unknown,message:string,shown:boolean,now=Date.now()):StayDatePending|undefined {
  const pending=readStayDatePending(value,now);
  if(shown!==true||pending?.reason!=='relative_checkout'||!pending.check_in)return;
  return weekdayCheckoutCandidate(pending,message,now);
}

function weekdayCheckoutCandidate(pending:StayDatePending,message:string,now:number):StayDatePending|undefined {
  if(!pending.check_in)return;
  const match=new RegExp(`^(?:(?:a )?(?:saida(?: e| sera)?|saio|sair|ate|vamos sair|quero sair) )?(?:(?:na|no|nesta|neste|nessa|nesse) )?(?:(proxim[oa]|outr[oa]) )?(${checkoutWeekdays.join('|')})(?:[ -]feira)?(?: (que vem|da semana que vem|da proxima semana|desta semana|dessa semana))?[.!]*$`).exec(norm(message));
  if(!match)return;
  const weekday=checkoutWeekdays.indexOf(match[2]);
  const entry=new Date(pending.check_in+'T12:00:00Z');
  let days=(weekday-entry.getUTCDay()+7)%7||7;
  if(match[3]==='da semana que vem'||match[3]==='da proxima semana')
    days=7-((entry.getUTCDay()+6)%7)+((weekday+6)%7);
  else if(match[3]==='desta semana'||match[3]==='dessa semana'){
    days=((weekday+6)%7)-((entry.getUTCDay()+6)%7);
    if(days<=0)return; // Do not reinterpret a past/same-day exit as next week.
  } else if(/^outr/.test(match[1]||'')){
    if(pending.checkout_weekday!==weekday||!pending.suggested_check_out)return;
    days=stayNights(pending.check_in,pending.suggested_check_out)+7;
  }
  const end=new Date(entry);end.setUTCDate(end.getUTCDate()+days);
  return readStayDatePending({at:now,reason:'relative_checkout',check_in:pending.check_in,
    suggested_check_out:end.toISOString().slice(0,10),checkout_weekday:weekday},now);
}

// The caller must establish that THIS deterministic checkout question was
// actually shown. A model's offer, history alone or a bare "sim" is not proof.
// This confirms only customer-declared dates, never availability or a booking.
export function confirmRelativeCheckout(value: unknown, message: string, shownToCustomer: boolean, now = Date.now()): {check_in:string;check_out:string} | undefined {
  if (shownToCustomer !== true) return;
  const pending = readStayDatePending(value, now);
  if (pending?.reason !== 'relative_checkout' || !pending.check_in || !pending.suggested_check_out) return;
  if (!/^(?:sim(?:,? por favor)?|isso(?: mesmo)?|pode manter|mantenha|mantem)[.!]*$/.test(norm(message))
    && !affirmedStayInformation(message)) return;
  return {check_in:pending.check_in,check_out:pending.suggested_check_out};
}
export const unparsedStayDateDeclaration = (message: string) => {
  const s = norm(message);
  return /\b(?:entrada|entrar|check.?in|chego|entro)\b/.test(s)
    && /\b(?:saida|sair|check.?out|saio)\b/.test(s)
    && /\b\d{1,2}-\d{1,2}(?:-(?:20)?\d{2})?\b/.test(s);
};

export function conflictingStayDuration(request: StayDuration, start: string, end: string, message: string, now: number): StayDatePending | undefined {
  const nights = stayNights(start, end);
  if (!Number.isInteger(nights) || nights < 1 || nights > 30 || nights === request.count) return;
  // "Two days, check-in 11 and checkout 12" explicitly means two calendar
  // days spanning one night. Unlabelled dates do not settle that ambiguity.
  if (request.unit === 'days' && explicitStayBoundaries(message)) return;
  const candidate = new Date(`${start}T12:00:00Z`);
  candidate.setUTCDate(candidate.getUTCDate() + request.count);
  return { at: now, reason: 'duration_conflict', check_in: start, check_out: end,
    suggested_check_out: candidate.toISOString().slice(0, 10) };
}

export function stayDateClarification(pending: StayDatePending): string {
  if(pending.reason==='alternative_dates')return 'Posso consultar outro período para vocês. Quais datas de entrada e saída você prefere? Pode informar no formato dia/mês. Vou recalcular os valores para essas datas; a cotação anterior não vale para o novo período.';
  if(pending.reason==='rejected_dates')return 'Entendi que esse período não serve. Quais são as datas desejadas de entrada e saída? Informe no formato dia/mês; não vou usar o período recusado na cotação.';
  if(pending.reason==='split_dates')return splitStayQuestion(pending as SplitStayDatePending);
  if (pending.reason === 'checkout_correction' && pending.check_in)
    return `Mantendo a entrada em ${pending.check_in.split('-').reverse().join('/')}, qual será a nova data de saída? Informe no formato dia/mês. A saída anterior não será usada na cotação.`;
  if (pending.reason === 'relative_checkout' && pending.check_in) {
    const label = (s: string) => s.slice(0, 10).split('-').reverse().join('/');
    if(pending.checkout_weekday!==undefined&&pending.suggested_check_out)
      return `Entrada hoje, ${label(pending.check_in)}. Você se refere à saída em ${checkoutWeekdayLabels[pending.checkout_weekday]}, ${label(pending.suggested_check_out)}? Se for essa data, responda sim; se for outra, informe a data desejada.`;
    return pending.suggested_check_out
      ? `Entrada hoje, ${label(pending.check_in)}. Mantém a saída em ${label(pending.suggested_check_out)}? Se for outra data, informe a saída no formato dia/mês.`
      : `Entrada hoje, ${label(pending.check_in)}. Qual será a data de saída? Informe no formato dia/mês.`;
  }
  if (pending.reason !== 'duration_conflict' || !pending.check_in || !pending.check_out || !pending.suggested_check_out)
    return 'Quais são as datas de entrada e saída? Pode informar no formato dia/mês.';
  const label = (s: string) => s.slice(0, 10).split('-').reverse().join('/');
  const nights = stayNights(pending.check_in, pending.check_out);
  return `Preciso confirmar o período: de ${label(pending.check_in)} a ${label(pending.check_out)} corresponde a ${nights} ${nights === 1 ? 'noite' : 'noites'}. Você deseja entrada em ${label(pending.check_in)} e saída em ${label(pending.check_out)} ou em ${label(pending.suggested_check_out)}? Responda com as datas desejadas de entrada e saída; não alterei nem confirmei a estadia.`;
}
