import { extraCodes } from './extraMedia.js';
import { eventInquiry } from './hotelInfo.js';
import { namedPackageInquiry, packageInquiry } from './packageContext.js';
import { publicEventInquiry } from './publicEvents.js';
import { guestFacilityInquiry } from './guestFacilities.js';
import { diningPolicyAnswer } from './diningPolicy.js';
import { hotelPolicyInquiry } from './hotelPolicy.js';

export type GuestInquiry = 'lodging_faq' | 'day_use' | 'dining';

const normalize = (value: string) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9\s?,;.!/-]/g, ' ').replace(/\s+/g, ' ').trim();

const lodgingTarget = '(?:hospedagem|estadia|diarias?|quartos?|apartamentos?|aptos?|loft|suites?)';
const mealWords = /\b(?:almoco|almocar|almocamos|jantar|jantares|jantaremos|cafe(?: da manha| da tarde)?|refeic(?:ao|oes)|restaurantes?|cardapio|menu|reserva solar|solar 73|avuado|mesas?)\b/;
const dayUseWords = /\b(?:day[ -]?use|passar (?:o|um|apenas o|so o) dia|passar somente o dia)\b/;
const mediaWords = /\b(?:fotos?|fotografias?|imagem|imagens|videos?|galeria|album)\b/;
const humanWords = /\b(?:atendente|humano|reembolso|reclamacao|quero reclamar|cancelar minha reserva|falar com (?:uma pessoa|alguem|a recepcao)|(?:chama|chame|chamar|encaminhar) (?:para )?(?:a )?recepcao|nao quero informar|prefiro nao informar)\b|^recepcao$/;
const procedureWords = /\b(?:como (?:eu )?(?:faco|posso|consigo|funciona)|como funciona|o que (?:preciso|e necessario)|quais (?:os )?(?:documentos|dados)|preciso (?:informar|enviar)|passo a passo)\b/;

function quotedAmountQuestion(s: string): boolean {
  const previousAmount = /\b(?:esse|este|aquele) (?:valor|total|preco)\b|\b(?:valor|total|preco) (?:informado|enviado|apresentado|cotado)\b/.test(s);
  const billingUnit = /\b(?:por|pel[oa]s?|d[ao]s?) (?:as? |os? )?(?:(?:\d+|uma?|duas?|dois|tres|quatro|cinco) )?(?:diarias?|dias?|noites?|pessoas?|hospedes?|quartos?|pacotes?)\b/.test(s);
  // Reference to an amount already shown is a question about its basis, not
  // permission to replace that quote or infer another room/date/occupancy.
  return previousAmount && billingUnit;
}

function stayDateDeclaration(s: string): boolean {
  if (!/\b(?:check[ -]?in|check[ -]?out|checkin|checkout)\b/.test(s)) return false;
  const dates = /\b(?:20\d{2}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/(?:20)?\d{2})?)\b/.test(s)
    || /\b\d{1,2} (?:de )?(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/.test(s);
  const policy = /\b(?:horarios?|horas?|qual|quais|como|funciona|politicas?|regras?|antecipar|antecipado|early|late|tolerancia|limite|documentos?|dados|cpf)\b/.test(s);
  return dates && !policy;
}

function roomRequirementQuestion(s: string): boolean {
  return new RegExp(`\\b${lodgingTarget}\\b`).test(s)
    && /\b(?:tem|ha|existe|existem|possui|possuem|oferece|oferecem|saber|qual|quais|capacidade)\b/.test(s)
    && /\b(?:adaptad[oa]s?|acessivel|acessiveis|acessibilidade|cadeirantes?|interligad[oa]s?|conjugad[oa]s?|comporta|comportam|cabe|cabem|capacidade|banheira|varanda|sacada|frigobar|ar condicionado|camas?|bercos?)\b/.test(s);
}

/**
 * A request to price/book lodging, not consent to confirm a reservation.
 * Deliberately requires a lodging object: reserving a table or day use is not
 * a room request. Merely mentioning "reserva" in a policy/payment question is
 * not enough either. Callers must still keep human/media/event routes first.
 */
export function explicitLodgingRequest(message: string): boolean {
  const s = normalize(message);
  if (!s) return false;
  if (stayDateDeclaration(s)) return true;
  const clauses = s.split(/[;.!?]|\bmas\b/).map(clause => clause.trim());
  return clauses.some(clause => {
    if (quotedAmountQuestion(clause)) return false;
    if (/\bnao (?:quero|pretendo|vou|vamos|preciso|desejo|gostaria)\b/.test(clause)) return false;
    if (procedureWords.test(clause)) return false;
    // A rate/availability inquiry may legitimately start a lodging quote,
    // even when the customer also asks about breakfast or other amenities.
    const directRate = new RegExp(`\\b(?:valor(?:es)?|precos?|tarifas?|custo) (?:d[ao]s? |de |para |por |uma? |as? |os? )*${lodgingTarget}\\b`);
    const howMuch = new RegExp(`\\bquanto (?:custa|fica|sai|e) (?:a |o |uma? |para )*${lodgingTarget}\\b`);
    const availability = new RegExp(`\\b(?:vagas?|disponibilidade) (?:d[ao]s? |de |para |em |uma? |as? |os? )*${lodgingTarget}\\b`);
    const availableRoom = /\b(?:tem|ha|existem) (?:um |uma |algum |alguma )?(?:quartos?|apartamentos?|aptos?|loft|suites?)\b|\b(?:quartos?|apartamentos?|aptos?|loft|suites?) (?:disponivel|disponiveis|vago|vagos|vaga|vagas)\b/;
    if (directRate.test(clause) || howMuch.test(clause) || availability.test(clause)
      || availableRoom.test(clause) && !roomRequirementQuestion(clause) && !guestFacilityInquiry(clause)) return true;
    const quoteForLodging = new RegExp(`\\b(?:cotacao|orcamento|simulacao) (?:d[ao]s? |de |para |uma? |as? |os? )*${lodgingTarget}\\b`);
    if (quoteForLodging.test(clause)) return true;
    // "Quote for two guests ... with breakfast" is lodging even when the
    // room noun is omitted. Require hóspedes, never just meal participants.
    if (/\b(?:cotacao|orcamento|simulacao|cotar)\b/.test(clause)
      && /\b(?:\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+hospedes?\b/.test(clause)
      && !dayUseWords.test(clause) && !/\b(?:nao|sem) (?:a )?hospedagem\b/.test(clause)) return true;
    const request = '(?:quero|queria|gostaria(?: de)?|preciso(?: de)?|desejo|pode(?:ria)?|podem|consegue(?:m)?)';
    const action = '(?:cotar|reservar|simular|fazer (?:uma? )?(?:reserva|cotacao|simulacao|orcamento))';
    for (const match of clause.matchAll(new RegExp(`\\b${request} (?:me )?${action}\\b`, 'g'))) {
      const tail = clause.slice(match.index! + match[0].length, match.index! + match[0].length + 70);
      const target = new RegExp(`\\b${lodgingTarget}\\b`).exec(tail);
      if (!target) continue;
      const beforeTarget = tail.slice(0, target.index);
      // "Reservar day use/uma mesa, sem hospedagem" must not turn the
      // explicit rejection of lodging into the object of the reservation.
      if (!dayUseWords.test(beforeTarget) && !mealWords.test(beforeTarget)
        && !/\b(?:sem|nao)\b/.test(beforeTarget)) return true;
    }
    if (new RegExp(`^(?:por favor )?${action} (?:d[ao]s? |de |para |uma? |as? |os? )*${lodgingTarget}\\b`).test(clause)) return true;
    // "Quero conhecer o quarto" is not a booking selection. An explicit
    // "quero reservar hospedagem e saber..." above remains a lodging request.
    if (/\b(?:saber|conhecer|entender|explicar|consultar as regras)\b/.test(clause)
      && !/\b(?:cotar|cotacao|orcamento|simulacao)\b/.test(clause)) return false;
    if (new RegExp(`\\b${request} (?:uma? |as? |os? )*${lodgingTarget}\\b`).test(clause)) return true;
    if (/\b(?:quero|queria|gostaria de|preciso|desejo) (?:me hospedar|nos hospedar|ficar hospedado|ficar hospedada)\b/.test(clause)) return true;
    // The hotel name disambiguates a generic reservation only when it is not
    // explicitly a restaurant/day-use reservation.
    return !mealWords.test(clause) && !dayUseWords.test(clause)
      && new RegExp(`\\b${request} (?:fazer )?(?:uma? )?reserva (?:no|para o|do) hotel(?: solar)?\\b`).test(clause);
  });
}

function lodgingFaq(s: string): boolean {
  if (hotelPolicyInquiry(s)) return true;
  if (quotedAmountQuestion(s) || roomRequirementQuestion(s) || guestFacilityInquiry(s)) return true;
  const includedMeal = mealWords.test(s)
    && /\b(?:inclus[oa]s?|incluid[oa]s?|inclui|inclusao|diarias?|hospedagem|estadia)\b/.test(s);
  if (includedMeal) return true;
  if (/\b(?:pets?|pet friendly|cachorros?|caes|gatos?|animais?|animal|bercos?|acessibilidade|cadeirantes?|estacionamento|garagem|wi[ -]?fi|internet)\b/.test(s)) return true;
  if (/\b(?:check[ -]?in|check[ -]?out|checkin|checkout|early check[ -]?in|late check[ -]?out)\b/.test(s)) return true;
  if (/\b(?:horarios?|horas?|que horas)\b/.test(s)
    && /\b(?:entrar|entrada|sair|saida|chegar|chegada|liberacao|libera|quarto|hospedagem|diaria)\b/.test(s)) return true;
  if (/\b(?:pagamento|pagar|pago|pix|cartao|cartoes|parcelamento|parcelar|parcelas|sinal|deposito)\b/.test(s)
    && /\b(?:reserva|hospedagem|diaria|estadia|formas?|como|aceita|aceitam|precisa|funciona|politica)\b/.test(s)) return true;
  if (/\b(?:capacidade|quantas pessoas cabem|quantos hospedes cabem)\b/.test(s)
    && new RegExp(`\\b${lodgingTarget}\\b`).test(s)) return true;
  if (/\b(?:criancas?|bebe|menor(?:es)?)\b/.test(s)
    && /\b(?:paga|pagam|gratis|gratuidade|cortesia|politica|regra|idade|idades)\b/.test(s)) return true;
  if (/\b(?:tem|possui|possuem|oferece|oferecem|inclui|inclus[oa]|incluid[oa])\b/.test(s)
    && /\b(?:banheira|varanda|sacada|frigobar|ar condicionado|tv|televisao|cama|camas|berco|toalhas?|roupa de cama)\b/.test(s)) return true;
  return (procedureWords.test(s) || /\b(?:politicas?|regras?|documentos?|cpf|cadastro de pessoas fisicas)\b/.test(s))
    && /\b(?:reservar|reserva|hospedagem|hospedar|check[ -]?in|entrar|quarto|diaria)\b/.test(s);
}

/**
 * Classifies information that must not supply room dates/occupancy or trigger
 * a lodging quote merely because it contains "diária", "reserva" or people.
 * No hotel policy, price, availability, facts or consent is inferred here.
 * Preserve existing package/human/event/media routes ahead of this helper.
 */
export function guestInquiry(message: string): GuestInquiry | undefined {
  const s = normalize(message);
  if (!s || mediaWords.test(s) || humanWords.test(s)
    || eventInquiry(message) || publicEventInquiry(message)) return;
  // A holiday in an admission FAQ is not a lodging-package request.
  // Reuse the narrow policy guard so meals, events and bookings stay distinct.
  if (diningPolicyAnswer(message)) return 'dining';
  // "Esse valor é por diária ou pelo pacote?" explains the previous amount;
  // the generic word pacote must not turn it into a fresh catalog request.
  if (packageInquiry(message) && (!quotedAmountQuestion(s) || namedPackageInquiry(message))) return;
  if (explicitLodgingRequest(message)) return;
  if (dayUseWords.test(s)) return 'day_use';
  // Keep the established leisure/extra handlers, including their photo
  // context and commercial distinctions, outside this informational guard.
  if (extraCodes(message).length) return;
  const faq = lodgingFaq(s);
  if (mealWords.test(s)) {
    if (faq && /\b(?:diarias?|hospedagem|estadia|quartos?|loft|suites?)\b/.test(s)
      && !/\b(?:nao|sem) (?:a )?(?:hospedagem|estadia)\b/.test(s)) return 'lodging_faq';
    return 'dining';
  }
  return faq ? 'lodging_faq' : undefined;
}
