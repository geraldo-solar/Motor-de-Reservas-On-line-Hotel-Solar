import { stripNegatedHumanRequests } from './humanIntent.js';

const normalize = (value: string) => stripNegatedHumanRequests(String(value || '')).normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\.(?=[a-z])/g, ' ').replace(/\s+/g, ' ').trim();
const otherSubject = /\b(?:locmil|quadriciclo|cardapio|menu|documentos?|pdf|guia|fotos?|imagens?|localizacao|instagram|youtube|wifi|wi-fi|outro hotel|supermercado|taxi|uber)\b/;
const financial = /\b(?:pagamento|pagar|pix|boleto|parcelad[oa]|parcelar|parcelamento|parcelas?|cartao|credito|sinal|saldo)\b/;
const dining = /\b(?:cafe|restaurantes?|cardapio|menu|reserva solar|solar 73|almoco|jantar|consumo|couvert|ingressos?|day[ -]?use)\b/;
const lodging = /\b(?:hospedagem|estadia|diarias?|quartos?|apartamentos?|aptos?|reserva(?! solar))\b/;
const unrelatedPayment = (s: string) => otherSubject.test(s) || dining.test(s) && !lodging.test(s);
const requestVerb = /\b(?:mande|manda|mandar|envie|envia|enviar|reenvie|reenviar|gere|gerar|solicito|preciso|quero|veja|verifique|conferir|verificar)\b/;
const refusal = /\bnao (?:quero|queremos|preciso|precisamos|desejo|mande|manda|envie|envia|reenvie|gere|gerar|enviar|solicite)\b|\b(?:dispenso|desisti|cancele)\b|^nao (?:o|a|os|as|meu|minha)\b/;
const informational = (s: string) => /\b(?:como (?:funciona|funcionam|faco|fazer|pedir|solicitar)|quero saber|gostaria de saber|queria saber|normalmente|em geral)\b/.test(s)
  || /\b(?:se|caso|quando) (?:eu )?(?:quiser|precisar|tiver|for|fizer|pagar)\b/.test(s);
type RequestPart = {text:string;requested:boolean;refused:boolean;informational:boolean};

// Keep each request's object together. In "mande o link ... e o guia", the
// guide must not veto the payment; in "link do guia", it still must. A noun
// coordinated with a request inherits its action/refusal, not a new consent.
function requestParts(message: string): RequestPart[] {
  const s=normalize(message);
  const boundary=/\s+e\s+(?=(?:(?:tambem|ainda)\s+)?(?:(?:o|a|os|as|do|da|dos|das|de|um|uma|meu|minha)\s+)?(?:link|guia|cardapio|menu|documento|pdf|foto|imagem|localizacao|wifi|wi-fi|contato)\b|(?:nao|mande|manda|envie|envia|quero|preciso|pode|posso|como|qual|que horas)\b)/;
  return s.split(/[!?;]|\.(?!\d)|\b(?:mas|porem)\b/).flatMap(sentence=>{
    let requested=false,refused=false,info=false;
    return sentence.split(boundary).map(value=>{
      const text=value.trim();
      const explicit=requestVerb.test(text);
      if(explicit||informational(text)){
        requested=explicit;refused=refusal.test(text);info=informational(text);
      }else if(refusal.test(text))refused=true;
      return {text,requested,refused,informational:info};
    });
  }).filter(part=>!!part.text);
}

function paymentParts(message: string): RequestPart[] {
  return requestParts(message).filter(part=>!unrelatedPayment(part.text)&&!part.refused);
}

export const paymentSupportContext = 'Preciso de ajuda da recepção com o link ou acesso ao pagamento da hospedagem.';
export const paymentSupportAnswer = 'Vou chamar a recepção para conferir o link e as condições de pagamento. Não envie senhas, códigos de acesso nem dados do cartão por aqui; não houve emissão de cobrança nem confirmação de pagamento.';

/** Customer wording that can establish a short payment-topic TTL. This is
 * not itself a request for a human or confirmation of any payment terms. */
export function paymentSupportTopic(message: string): boolean {
  const s=normalize(message);
  const hasFinancialTopic=paymentParts(message).some(part=>part.text===normalize(paymentSupportContext)||financial.test(part.text));
  // Keep general meal-payment FAQs out of room-payment continuity. This is
  // not a veto on an independent operational request for a payment link.
  return hasFinancialTopic&&(!dining.test(s)||lodging.test(s)||paymentSupportInquiry(message));
}

/** A bare "send the link" requires a fresh payment topic supplied by the
 * caller. Never interpret a menu/document/provider link as a payment link. */
export function paymentSupportInquiry(message: string, contextual = false): boolean {
  const s = normalize(message);
  if (!s) return false;
  if (s === normalize(paymentSupportContext)) return true;
  const parts=paymentParts(message);
  // "Menu and the link" is still ambiguous even after a prior payment topic.
  // A separate, explicit "link de pagamento" supplies its own financial scope.
  const financialContext = contextual&&!unrelatedPayment(s) || parts.some(part=>financial.test(part.text));
  for (const part of parts) {
    if(part.informational)continue;
    const clause=part.text;
    const sendLink = /\blink\b/.test(clause) && part.requested;
    if (financialContext && sendLink) return true;
    const access = /\b(?:codigos?|e[ -]?mail|acesso|entrar|abrir|abrem|abre|abriu|convidado|login|link)\b/.test(clause);
    const failure = /\b(?:nao (?:abrem|abre|abriu|funciona|funcionam|consigo|conseguimos|permite|deixa)|erro|falha|problema|so (?:abre|abriu) como convidado)\b/.test(clause);
    if (financialContext && access && failure) return true;
    if (financialContext && /\bnao (?:permite|deixa|consigo|conseguimos) parcelar\b|\b(?:parcelamento|parcelas) (?:nao (?:aparece|aparecem|funciona)|indisponivel)\b/.test(clause)) return true;
  }
  if (!contextual || s.length > 160 || unrelatedPayment(s) || refusal.test(s)) return false;
  return /^(?:(?:ok|e|mas|agora|entao)[,.! ]+)*(?:pode ser|como (?:posso )?(?:prosseguir|continuar)|e ja deixar tudo certo|prefiro pagar (?:logo |agora )?(?:no |por |via )?pix|vou tentar mais uma vez)[?.!]*$/.test(s);
}

/** Safe secondary-topic identifiers only; no raw financial text, URL,
 * credential, booking fact or confirmation is carried to the next step. */
export type PaymentSupportSupplementaryTopic='guest_guide'|'restaurant_menu';
export function readPaymentSupportTopics(value:unknown):PaymentSupportSupplementaryTopic[] {
  return Array.isArray(value)?[...new Set<PaymentSupportSupplementaryTopic>(value.filter(
    (item):item is PaymentSupportSupplementaryTopic=>item==='guest_guide'||item==='restaurant_menu'))]:[];
}
export function paymentSupportSupplementaryTopics(message:string,contextual=false):PaymentSupportSupplementaryTopic[] {
  if(!paymentSupportInquiry(message,contextual))return [];
  const parts=requestParts(message).filter(part=>!part.refused).map(part=>part.text);
  const topics:PaymentSupportSupplementaryTopic[]=[];
  if(parts.some(text=>/\bguia\b/.test(text)))topics.push('guest_guide');
  if(parts.some(text=>/\b(?:cardapio|menu)\b/.test(text)))topics.push('restaurant_menu');
  return topics;
}

/** For typed privacy redaction and audio continuity: all wording is fixed;
 * nothing from the customer's financial text or credentials is retained. */
export function paymentSupportContextFor(message:string):string {
  const topics=paymentSupportSupplementaryTopics(message);
  return [paymentSupportContext,
    topics.includes('guest_guide')?'Também quero o guia do hotel.':'',
    topics.includes('restaurant_menu')?'Também quero o cardápio do restaurante.':'',
  ].filter(Boolean).join(' ');
}

export function paymentSupportAnswerFor(value:unknown):string {
  const topics=readPaymentSupportTopics(value);
  return [paymentSupportAnswer,
    topics.includes('guest_guide')?'Guia do hóspede: https://www.hotelsolar.tur.br/guia':'',
    topics.includes('restaurant_menu')?'Vou pedir também à recepção o cardápio solicitado.':'',
  ].filter(Boolean).join('\n\n');
}
