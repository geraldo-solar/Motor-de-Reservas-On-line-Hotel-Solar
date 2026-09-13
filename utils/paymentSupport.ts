import { stripNegatedHumanRequests } from './humanIntent.js';

const normalize = (value: string) => stripNegatedHumanRequests(String(value || '')).normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\.(?=[a-z])/g, ' ').replace(/\s+/g, ' ').trim();
const otherSubject = /\b(?:locmil|quadriciclo|cardapio|menu|documentos?|pdf|guia|fotos?|imagens?|localizacao|instagram|youtube|wifi|wi-fi|outro hotel|supermercado|taxi|uber)\b/;
const financial = /\b(?:pagamento|pagar|pix|boleto|parcelad[oa]|parcelar|parcelamento|parcelas?|cartao|credito|sinal|saldo)\b/;
const dining = /\b(?:cafe|restaurantes?|reserva solar|solar 73|almoco|jantar|consumo|couvert|ingressos?|day[ -]?use)\b/;
const lodging = /\b(?:hospedagem|estadia|diarias?|quartos?|apartamentos?|aptos?|reserva(?! solar))\b/;
const unrelatedPayment = (s: string) => otherSubject.test(s) || dining.test(s) && !lodging.test(s);

export const paymentSupportContext = 'Preciso de ajuda da recepção com o link ou acesso ao pagamento da hospedagem.';
export const paymentSupportAnswer = 'Vou chamar a recepção para conferir o link e as condições de pagamento. Não envie senhas, códigos de acesso nem dados do cartão por aqui; não houve emissão de cobrança nem confirmação de pagamento.';

/** Customer wording that can establish a short payment-topic TTL. This is
 * not itself a request for a human or confirmation of any payment terms. */
export function paymentSupportTopic(message: string): boolean {
  const s = normalize(message);
  return !!s && !unrelatedPayment(s) && (s === normalize(paymentSupportContext) || financial.test(s));
}

/** A bare "send the link" requires a fresh payment topic supplied by the
 * caller. Never interpret a menu/document/provider link as a payment link. */
export function paymentSupportInquiry(message: string, contextual = false): boolean {
  const s = normalize(message);
  if (!s || unrelatedPayment(s)) return false;
  if (s === normalize(paymentSupportContext)) return true;
  if (/\b(?:como (?:funciona|funcionam|faco|fazer|pedir|solicitar)|quero saber|gostaria de saber|queria saber|normalmente|em geral)\b/.test(s)
    || /\b(?:se|caso|quando) (?:eu )?(?:quiser|precisar|tiver|for|fizer|pagar)\b/.test(s)) return false;
  const financialContext = contextual || financial.test(s);
  for (const clause of s.split(/[!?;]|\.(?!\d)|\b(?:mas|porem)\b/).map(part => part.trim())) {
    if (/\bnao (?:quero|queremos|preciso|precisamos|desejo|mande|manda|envie|envia|reenvie|gere|gerar|enviar|solicite)\b|\b(?:dispenso|desisti|cancele)\b/.test(clause)) continue;
    const sendLink = /\blink\b/.test(clause)
      && /\b(?:mande|manda|mandar|envie|envia|enviar|reenvie|reenviar|gere|gerar|solicito|preciso|quero|pode mandar|pode enviar|veja|verifique|conferir|verificar)\b/.test(clause);
    if (financialContext && sendLink) return true;
    const access = /\b(?:codigos?|e[ -]?mail|acesso|entrar|abrir|abrem|abre|abriu|convidado|login|link)\b/.test(clause);
    const failure = /\b(?:nao (?:abrem|abre|abriu|funciona|funcionam|consigo|conseguimos|permite|deixa)|erro|falha|problema|so (?:abre|abriu) como convidado)\b/.test(clause);
    if (financialContext && access && failure) return true;
    if (financialContext && /\bnao (?:permite|deixa|consigo|conseguimos) parcelar\b|\b(?:parcelamento|parcelas) (?:nao (?:aparece|aparecem|funciona)|indisponivel)\b/.test(clause)) return true;
  }
  if (!contextual || s.length > 160) return false;
  return /^(?:(?:ok|e|mas|agora|entao)[,.! ]+)*(?:pode ser|como (?:posso )?(?:prosseguir|continuar)|e ja deixar tudo certo|prefiro pagar (?:logo |agora )?(?:no |por |via )?pix|vou tentar mais uma vez)[?.!]*$/.test(s);
}
