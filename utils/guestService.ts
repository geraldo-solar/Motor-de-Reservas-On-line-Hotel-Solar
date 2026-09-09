export type GuestService = 'housekeeping' | 'maintenance' | 'room_service' | 'booking_document' | 'lost_item';

const normalize = (value: string) => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const contextMessages: Record<GuestService, string> = {
  housekeeping: 'Solicito atendimento humano para reposição de itens.',
  maintenance: 'Solicito atendimento humano para verificar um problema de manutenção.',
  room_service: 'Quero fazer um pedido de alimentação.',
  booking_document: 'Solicito atendimento humano para um documento pendente de reserva.',
  lost_item: 'Solicito atendimento humano para verificar um objeto esquecido.',
};
const room = '(?:quarto|apartamento|apto|suite)';
const supplies = /\b(?:toalhas?|travesseiros?|lencol|lencois|cobertor|cobertores|roupa de (?:cama|banho)|papel higienico|reposicao de itens)\b/;
const food = /\b(?:hamburguer(?:es)?|burger(?:kids)?|burguer(?:kids)?|coca(?:[ -]cola)?|refrigerantes?|sucos?|sanduiches?|lanches?|pizza|cervejas?|agua|pedido de alimentacao)\b/;
const request = /\b(?:preciso|precisamos|quero|queremos|vou querer|gostaria|solicito|solicitamos|mande|mandem|manda|envie|enviem|traga|tragam|trazer|mandar|enviar|providenciar)\b/;

/** Current, concrete service needs only. No fulfillment, room identifier,
 * contact data or booking change is inferred or returned. General policies,
 * facilities, photos and withdrawn requests remain outside this handoff. */
export function guestServiceRequest(message: string): GuestService | undefined {
  const s = normalize(message);
  if (!s) return;
  if (guestFacilityServiceRequest(s)) return 'room_service';
  const safeCategory = (Object.keys(contextMessages) as GuestService[]).find(kind => normalize(contextMessages[kind]) === s);
  if (safeCategory) return safeCategory;
  const roomContext = /\b(?:estou|estamos|estamos todos|ja estou|ja estamos) hospedad[oa]s?\b/.test(s)
    || new RegExp(`\\b(?:meu|minha|nosso|nossa|no|na|do|da|para o|para a|pro|pra|ao) ${room}\\b`).test(s)
    || new RegExp(`\\b${room} (?:[a-z]\\s*)?\\d{1,4}\\b`).test(s)
    || /\b(?:no|do|para o|pro) [a-z]\d{2,4}\b/.test(s);
  for (const clause of s.split(/[;.!?]|\bmas\b|\bporem\b/).map(part => part.trim())) {
    if (!clause || /\b(?:fotos?|fotografias?|imagem|imagens|videos?|cardapio|menu)\b/.test(clause)) continue;
    // A question about how the service works is not an order to perform it.
    if (/\b(?:quero|queria|gostaria de) saber\b|\bcomo (?:funciona|solicito|solicitar|peco|pedir|posso pedir|posso solicitar|faco para pedir|faco para solicitar)\b|\bo que fazer se\b/.test(clause)) continue;
    if (/\bnao (?:quero|queremos|preciso|precisamos|desejo|vamos|vou|gostaria)\b|\b(?:dispenso|desisti|cancele|cancelar|cancela|remova|remover|retire|retirar|nao mande|nao envie|nao traga)\b/.test(clause)) continue;

    if (!/\bnao (?:esqueci|esquecemos|perdi|perdemos|deixei|deixamos)\b/.test(clause)
      && /\b(?:esqueci|esquecemos|perdi|perdemos|deixei|deixamos)\s+(?:(?:uma?|o|a|os|as|meu|minha|meus|minhas|nosso|nossa)\s+)*(?:blusa|camisa|camiseta|casaco|roupas?|peca de roupa|objeto pessoal|vestido|chinelos?|sapatos?|tenis|oculos|bolsa|mochila|mala|carteira|celular|carregador|chaves?)\b/.test(clause)) return 'lost_item';

    const document = /\b(?:notas? fiscais?|nota fiscal|nf[ -]?e|voucher|vouchers|documento pendente)\b/.test(clause);
    const awaitingDocument = /\b(?:aguardando|aguardo|aguardamos|nao recebi|nao recebemos|ainda falta|pendente)\b/.test(clause);
    const ownBooking = /\b(?:minha|meu|nossa|nosso|reserva|hospedagem|estadia|do grupo|da empresa)\b/.test(clause);
    const addressedDocument = /\b(?:pode|podem|poderia|poderiam) (?:me|nos) (?:emitir|enviar|mandar|reenviar)\b|\b(?:me|nos) (?:mande|envie|reenvie)\b|^(?:por favor[, ]+)?(?:emita|envie|reenvie|mande)\b/.test(clause);
    if (document && (awaitingDocument || addressedDocument || ownBooking && (request.test(clause)
      || /\b(?:pode|podem|poderia|poderiam) (?:me )?(?:emitir|enviar|mandar|reenviar)\b/.test(clause)))) return 'booking_document';

    const missingSupplies = /\b(?:nao tem|nao ha|faltam?|acabou|acabaram|estou sem|estamos sem|ficamos sem)\b/.test(clause);
    const newStay = /\b(?:orcamento|cotacao|simulacao|cotar|reservar|hospedagem|diarias?|estadia)\b/.test(clause)
      || new RegExp(`\\b(?:quero|queria|vou querer|preciso|gostaria(?: de)?) (?:um |uma |o |a )?${room}\\b`).test(clause);
    if (!newStay && supplies.test(clause) && (roomContext || /\b(?:estou|estamos|ficamos) sem\b/.test(clause))
      && (request.test(clause) || missingSupplies)) return 'housekeeping';
    const explicitFoodOrder = /\b(?:vou querer|quero pedir|gostaria de pedir|quero fazer (?:um )?pedido)\b|\b(?:quero|mande|manda|envie|traga)\s+(?:\d{1,2}|um|uma|dois|duas)\b/.test(clause);
    if (!newStay && food.test(clause) && request.test(clause) && (roomContext || explicitFoodOrder)
      && !/\b(?:orcamento|cotacao|cotar|preco|valor)\b/.test(clause)) return 'room_service';
    if (!roomContext) continue;
    const appliance = /\b(?:ar condicionado|chuveiro|fechadura|frigobar|televisao|tv|descarga|pia|torneira|wifi|wi-fi|internet)\b/.test(clause);
    const inspect = /\b(?:teria|tem) como (?:ver|verificar|conferir)\b|\b(?:pode|podem|poderia|poderiam) (?:me )?(?:verificar|conferir|ver)\b/.test(clause);
    const problem = /\b(?:nao (?:esta |estao )?(?:funcionando|gelando|liga|ligam)|parou de funcionar|quebrad[oa]s?|com defeito|vazando)\b/.test(clause)
      && !/\bnao (?:esta|estao|e|ficou) (?:quebrad[oa]|com defeito|vazando)\b/.test(clause);
    if (appliance && (problem || inspect) || /\b(?:manutencao|conserto|reparo)\b/.test(clause) && request.test(clause)) return 'maintenance';
  }
}

// Retain only the service category in conversational state, not an apartment
// identifier, the customer's order, family mention, invoice or personal data.
export const guestServiceContext = (kind: GuestService) => contextMessages[kind];

// The existing native HUMANO branch must perform the actual assignment.
// This acknowledgment never claims fulfillment, issuance or completed routing.
export const guestServiceAnswer = 'Vou chamar a recepção para ajudar com essa solicitação.';
import { guestFacilityServiceRequest } from './guestFacilities.js';
