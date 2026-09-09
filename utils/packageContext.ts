import { childPolicyQuestion, childAgeFollowup } from './packageChildInquiry.js';

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
export function packageFollowup(message: string) {
  const s = norm(message);
  if (newTripRequest(message)) return false;
  if (/\b(comprovante|paguei)\b|pagamento.{0,30}(confirmad|recebid)|(?:confirmad|recebid).{0,30}pagamento/.test(s)) return false;
  if (/\b(fotos?|imagens?|fotografias?|galeria|album|cardapio|menu|reserva solar|solar 73|academia|playground|parquinho|piscinas?|hidromassagem|bicicletas?|bikes?)\b/.test(s)) return false;
  if (/\b(outro assunto|esquece|esqueca|mudar de assunto|nao quero esse|nao quero o pacote)\b/.test(s)) return false;
  if (childPolicyQuestion(message) || childAgeFollowup(message)) return true;
  if (/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(s)) return true;
  return /\b(indica|indicam|recomenda|recomendam|melhor|sugere|sugestao|pessoas|hospedes|adultos?|casal|criancas?|bebe|familia|valores?|precos?|custa|custos?|mais barato|mais economico|quanto|pagamento|parcelamento|parcelar|parcelas|inclui|inclus[oa]s?|inclusoes|ceia|open bar|programacao|horarios?|barco|catamara|regras|periodo|noites|diarias|datas|entrada|saida|loft|suites?|quartos?|acomodacoes|acomodacao|informacoes|detalhes|reservar|prosseguir)\b/.test(s)
    || /^(sim|nao|pode ser|quero|pode mostrar|quais opcoes|\d{1,2})[.!?]*$/.test(s);
}
export function packageBookingRequest(message: string) {
  const s = norm(message);
  return !/\?|\b(qual|quais|quanto|como|indica|recomenda|nao|talvez|depois|saber|informacoes|detalhes|valores|precos|comparar|conhecer|ver|mostrar|consultar|inclui|inclusoes)\b/.test(s)
    && !/^(quero|pode ser)[.!]*$/.test(s)
    && /\b(reservar|prosseguir|quero|prefiro|escolho|escolhi|aceito|pode ser|fico com|vou ficar|vou querer)\b/.test(s);
}
export function packageRecommendationInquiry(message: string) {
  return /\b(indica|indicam|recomenda|recomendam|melhor|sugere|sugestao|pessoas|hospedes|adultos?|casal|familia|valores?|precos?|custa|mais barato|mais economico|loft|suites?|quartos?|acomodacoes|acomodacao)\b/.test(norm(message));
}
