import { childPolicyQuestion, childAgeFollowup } from './packageChildInquiry.js';
import { publicEventInquiry, publicEventWeekdayReference } from './publicEvents.js';

// A catalog reference is conversational context, never a quote or consent.
export type PackageContext = {id: string; name: string; start_date: string; end_date: string; updated_at: number};
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s?/,.-]/g, ' ').replace(/\s+/g, ' ').trim();
export function readPackageContext(value: any, now = Date.now()): PackageContext | undefined {
  if (!value || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id)
    || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 180 || /@|\b(?:\d[.\s-]*){11,}\b/.test(value.name)
    || !Number.isFinite(value.updated_at) || value.updated_at <= 0 || now < value.updated_at || now - value.updated_at > 30 * 60000) return;
  for (const key of ['start_date', 'end_date']) {
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(value[key] || '')) return;
    const date = new Date(`${value[key]}T12:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value[key]) return;
  }
  if (value.end_date <= value.start_date) return;
  return {id:value.id, name:value.name.trim(), start_date:value.start_date, end_date:value.end_date, updated_at:value.updated_at};
}
export function packageInquiry(message: string) {
  return /\b(pacotes?|feriados?|reveillon|natal|ano novo|virada|carnaval|pascoa|finados|corpus christi|dia das criancas|dia das maes|dia dos pais|dia dos namorados)\b/.test(norm(message));
}
export function namedPackageInquiry(message: string) {
  return /\b(reveillon|natal|ano novo|virada|carnaval|pascoa|finados|corpus christi|dia das criancas|dia das maes|dia dos pais|dia dos namorados|ostrabeach|independencia)\b/.test(norm(message));
}
export function newTripRequest(message: string) {
  const s = norm(message);
  return /\b(outro periodo|outras datas|outra estadia|outra viagem)\b/.test(s)
    && (/\b(quero|prefiro|vou|vamos|mudar|trocar|desejo)\b/.test(s) || /^(outro periodo|outras datas|outra estadia|outra viagem)[.!]*$/.test(s));
}
/** Keep the package available for clarification without choosing its dates. */
export function packageWeekdayClarification(message: string, value: unknown, now = Date.now()): string | undefined {
  if (!readPackageContext(value, now) || !publicEventInquiry(message)
    || publicEventWeekdayReference(message) !== 'ambiguous') return;
  const weekday = norm(message).match(/\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/)?.[1];
  const label = weekday === 'sabado' ? 'sábado' : weekday === 'terca' ? 'terça-feira'
    : weekday && !['domingo'].includes(weekday) ? `${weekday}-feira` : 'domingo';
  const masculine = weekday === 'sabado' || weekday === 'domingo';
  return `Você quer saber a programação ${masculine ? 'do' : 'da'} ${label} do pacote que estávamos conversando ou ${masculine ? 'do próximo' : 'da próxima'} ${label}? Se preferir, informe a data desejada.`;
}
/** Expand only a short answer to an active, validated weekday question. */
export function packageWeekdayReply(message: string, previousQuestion: string): string | undefined {
  if (typeof previousQuestion !== 'string' || !/\bprogramacao\b/.test(norm(previousQuestion))) return;
  const weekday = norm(previousQuestion).match(/\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/)?.[1];
  if (!weekday) return;
  const label = (value: string) => value === 'sabado' ? 'sábado' : value === 'terca' ? 'terça-feira'
    : value === 'domingo' ? 'domingo' : `${value}-feira`;
  const next = (value: string) => `Qual a programação ${['sabado','domingo'].includes(value) ? 'do próximo' : 'da próxima'} ${label(value)}?`;
  const s = norm(message).replace(/[.!?]+$/g, '').trim();
  if (/^(?:sim|nao|\d{1,2})$/.test(s)) return previousQuestion;
  if (/^(?:(?:o|a|do|da|no|na) )?proxim[oa]$/.test(s)) return next(weekday);
  const namedNext = /^(?:(?:o|a|do|da|no|na) )?proxim[oa] (domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:[- ]feira)?$/.exec(s);
  if (namedNext) return next(namedNext[1]);
  const packageChoice = /^(?:(?:o|a|do|da|no|na) )?(?:(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:[- ]feira)? do )?pacote$/.exec(s);
  if (packageChoice) return `Qual a programação de ${label(packageChoice[1] || weekday)} do pacote?`;
  if (/^(?:hoje|amanha)$/.test(s)) return `Qual a programação de ${s === 'amanha' ? 'amanhã' : 'hoje'}?`;
  const date = /^(?:dia )?(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?$/.exec(s);
  if (date) {
    const iso = `${date[3] || '2000'}-${date[2].padStart(2, '0')}-${date[1].padStart(2, '0')}`;
    const parsed = new Date(`${iso}T12:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) return previousQuestion;
    return `Qual a programação do hotel em ${date[1]}/${date[2]}${date[3] ? `/${date[3]}` : ''}?`;
  }
  return undefined;
}
export function packageFollowup(message: string) {
  const s = norm(message);
  if (newTripRequest(message)) return false;
  // A present-calendar reference must not borrow the active package's dates.
  // Unqualified weekdays are handled by packageWeekdayClarification instead.
  const weekdayReference = publicEventWeekdayReference(message);
  if (publicEventInquiry(message) && weekdayReference !== undefined && weekdayReference !== 'package') return false;
  if (/\b(comprovante|paguei)\b|pagamento.{0,30}(confirmad|recebid)|(?:confirmad|recebid).{0,30}pagamento/.test(s)) return false;
  if (/\b(fotos?|imagens?|fotografias?|galeria|album|cardapio|menu|reserva solar|solar 73|academia|playground|parquinho|piscinas?|hidromassagem|bicicletas?|bikes?)\b/.test(s)) return false;
  if (/\b(outro assunto|esquece|esqueca|mudar de assunto|nao quero esse|nao quero o pacote)\b/.test(s)) return false;
  if (weekdayReference === 'package') return true;
  if (childPolicyQuestion(message) || childAgeFollowup(message)) return true;
  if (/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(s)) return true;
  return /\b(indica|indicam|recomenda|recomendam|melhor|sugere|sugestao|pessoas|hospedes|adultos?|casal|criancas?|filh[oa]s?|bebe|familia|valores?|precos?|custa|custos?|mais barato|mais economico|quanto|pagamento|parcelamento|parcelar|parcelas|inclui|inclus[oa]s?|inclusoes|ceia|open bar|programacao|horarios?|barco|catamara|regras|periodo|noites|diarias|datas|entrada|saida|loft|suites?|quartos?|acomodacoes|acomodacao|informacoes|detalhes|reservar|prosseguir)\b/.test(s)
    || /^(sim|nao|pode ser|quero|pode mostrar|quais opcoes|\d{1,2})[.!?]*$/.test(s);
}
export function packageBookingRequest(message: string) {
  const s = norm(message);
  return !/\?|\b(qual|quais|quanto|como|indica|recomenda|nao|talvez|depois|saber|informacoes|detalhes|valores|precos|comparar|conhecer|ver|mostrar|consultar|inclui|inclusoes)\b/.test(s)
    && !/^(quero|pode ser)[.!]*$/.test(s)
    && /\b(reservar|prosseguir|quero|prefiro|escolho|escolhi|aceito|pode ser|fico com|vou ficar|vou querer)\b/.test(s);
}
export function packageRecommendationInquiry(message: string) {
  return /\b(indica|indicam|recomenda|recomendam|melhor|sugere|sugestao|pessoas|hospedes|adultos?|casal|filh[oa]s?|familia|valores?|precos?|custa|mais barato|mais economico|loft|suites?|quartos?|acomodacoes|acomodacao)\b/.test(norm(message));
}
