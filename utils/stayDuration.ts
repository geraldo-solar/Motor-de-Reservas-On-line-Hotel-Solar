// A stated duration is conversational intent, not permission to extend a stay.
export type StayDuration = { count: number; unit: 'days' | 'nights'; at: number };
export type StayDatePending = {
  at: number;
  reason: 'duration_conflict' | 'relative_dates' | 'unparsed_dates';
  check_in?: string;
  check_out?: string;
  suggested_check_out?: string;
};
const norm = (s: string) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const recent = (at: unknown, now: number) => typeof at === 'number' && Number.isFinite(at) && at > 0 && at <= now && now - at <= 30 * 60000;
const validDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
export const stayNights = (start: string, end: string) => (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000;

export function readStayDuration(value: any, now = Date.now()): StayDuration | undefined {
  if (!value || !Number.isInteger(value.count) || value.count < 1 || value.count > 30
    || !['days', 'nights'].includes(value.unit) || !recent(value.at, now)) return;
  return { count: value.count, unit: value.unit, at: value.at };
}

export function readStayDatePending(value: any, now = Date.now()): StayDatePending | undefined {
  if (!value || !recent(value.at, now)) return;
  if (value.reason === 'relative_dates' || value.reason === 'unparsed_dates') return { at: value.at, reason: value.reason };
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
  if (pending.reason !== 'duration_conflict' || !pending.check_in || !pending.check_out || !pending.suggested_check_out)
    return 'Para evitar usar datas de outra conversa, pode informar as datas de entrada e saída no formato dia/mês?';
  const label = (s: string) => s.slice(0, 10).split('-').reverse().join('/');
  const nights = stayNights(pending.check_in, pending.check_out);
  return `Preciso confirmar o período: de ${label(pending.check_in)} a ${label(pending.check_out)} corresponde a ${nights} ${nights === 1 ? 'noite' : 'noites'}. Você deseja entrada em ${label(pending.check_in)} e saída em ${label(pending.check_out)} ou em ${label(pending.suggested_check_out)}? Responda com as datas desejadas de entrada e saída; não alterei nem confirmei a estadia.`;
}
