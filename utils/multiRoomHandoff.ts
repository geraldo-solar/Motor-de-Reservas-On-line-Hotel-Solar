import {familyAccommodation} from './familyAccommodation.js';
import {readPackageContext} from './packageContext.js';
import {readPackageDateRequest} from './packageDateRequest.js';

export type MultiRoomHandoff={at:number;key:string;status:'offered'|'accepted'|'declined'};
const norm=(s:string)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/,/g,' ').replace(/\s+/g,' ').trim();
export const multiRoomReply=(message:string):'accepted'|'declined'|undefined=>
  /^(?:sim|sim,? por favor|pode|pode sim|pode chamar|pode encaminhar|pode prosseguir|quero sim|por favor)[.!]*$/.test(norm(message))?'accepted':
  /^(?:nao|nao obrigado|nao obrigada|agora nao|nao precisa(?: (?:chamar|encaminhar)(?: a (?:recepcao|equipe))?)?|prefiro nao)[.!]*$/.test(norm(message))?'declined':undefined;

/** Asking how to fit a family is information, not an order for two rooms or
 * consent to hand off. Keep it separate from the yes/no handoff question. */
export function multiRoomGuidanceRequest(message:string):boolean {
  const s=norm(message);
  if(!s||s.length>600||/\b(?:fotos?|fotografias?|imagens?|videos?|galeria|telefone|ligar|cardapio|restaurante|reserva solar|solar 73|passeios?|barco|piscinas?|hidromassagem|eventos?|pagamento|comprovante|cancelar|reembolso)\b/.test(s))return false;
  if(/\b(?:precos?|valores?|orcamento|cotacao|quanto (?:custa|fica|sai)|quero reservar|preciso reservar|pode reservar|pode cotar)\b/.test(s))return false;
  const combination=/\b(?:casal|duplo)\b/.test(s)&&/\btriplo\b/.test(s);
  const distribution=/\b(?:distribuir|distribuicao|dividir|divisao|organizar)\b/.test(s);
  const suggestion=/\b(?:indica|indicam|indicaria|indicariam|recomenda|recomendam|recomendaria|recomendariam|sugere|sugerem|sugestao)\b/.test(s);
  const group=/\b(?:apartamentos?|aptos?|quartos?|acomodacoes|acomodacao|familia|grupo|todos|nos|comportar|acomodar|como)\b/.test(s);
  // A general package query may contain "hospedagem" or "família". It is
  // not a distribution question just because a five-person party is known.
  if(/\b(?:pacotes?|feriados?|reveillon|natal|carnaval|pascoa)\b/.test(s)&&!combination&&!distribution&&!/\b(?:apartamentos?|aptos?|quartos?|comportar|acomodar)\b/.test(s))return false;
  return combination&&(s.includes('?')||/\b(?:pode ser|poderia ser|da para|que tal|e se|comporta|comportam|cabe|cabem)\b/.test(s))
    || distribution&&(s.includes('?')||/\b(?:como|indica|indicaria|recomenda|recomendaria|sugere|pode|gostaria|quero saber)\b/.test(s))
    || suggestion&&group;
}

export function multiRoomGuidanceText(state:any,message:string,now=Date.now()):string|undefined {
  if(!multiRoomGuidanceRequest(message)||state?.facts?.guests!==5)return;
  const family=familyAccommodation(state,5,now);
  const adultsOnly=state.family_party?.adults===5&&state.family_party?.children===0;
  if(family.pending||state.facts.children_pending||state.family_clarification||!family.key&&!adultsOnly)return;
  const s=norm(message),combination=/\b(?:casal|duplo)\b/.test(s)&&/\btriplo\b/.test(s);
  if(family.eligible&&!combination)return;
  const explanation=combination
    ? 'Sim, em termos de capacidade, um apartamento da categoria Casal (2 pessoas) e um Triplo (3 pessoas) comportam os 5 hóspedes.'
    : 'Para vocês cinco, uma possibilidade é combinar dois apartamentos: um da categoria Casal para 2 pessoas e um Triplo para 3 pessoas.';
  return explanation+(family.eligible
    ? ' Dividir é opcional: pelas idades informadas, vocês também podem avaliar um apartamento compatível para 4 pessoas mais 1 criança de até 6 anos.'
    : ' Como não há criança de até 6 anos, não podemos usar a ocupação adicional para reunir os cinco em um apartamento.')
    +' A distribuição das pessoas depende da preferência da família. A recepção precisa confirmar a configuração das camas, a disponibilidade e os valores dos dois apartamentos; esta orientação não confirma reserva nem inicia uma consulta com a equipe.';
}

/** Facts must already be explicit and complete; this never learns from AI text. */
export function multiRoomKey(state:any,now=Date.now()):string|undefined {
  const f=state?.facts||{};
  const family=familyAccommodation(state,f.guests||0,now);
  if (!Number.isInteger(f.guests) || f.guests<5 || f.guests>60 || family.pending
    || f.children_pending || state.family_clarification || state.stay_date_pending
    || f.guests===5 && family.eligible>0) return;
  // Five unspecified people may include an eligible child. Do not decide
  // to split until that composition is known (or five adults were explicit).
  if(f.guests===5 && !family.key && !(state.family_party?.adults===5
    && !state.family_party?.children))return;
  const date=(value:unknown)=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value+'T12:00:00Z'))
    && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
  const focus=readPackageContext(state.package_context,now);
  const completeDates=date(f.check_in)&&date(f.check_out);
  // Reception may advise on a package before the customer chooses its dates.
  // This arms only a handoff; it must never create a quote or copy catalog dates.
  if(!completeDates&&!focus)return;
  if(completeDates){
    const nights=(Date.parse(f.check_out+'T12:00:00Z')-Date.parse(f.check_in+'T12:00:00Z'))/86400000;
    if(nights<1||nights>30)return;
  }
  const request=readPackageDateRequest(state.package_date_request,focus,now);
  return JSON.stringify([f.check_in||null,f.check_out||null,f.guests,family.key||null,focus?.id||null,request?.text||null]);
}
export function readMultiRoomHandoff(value:any,state:any,now=Date.now()):MultiRoomHandoff|undefined {
  if (!value || !Number.isFinite(value.at)||value.at<=0||value.at>now||now-value.at>30*60000
    || !['offered','accepted','declined'].includes(value.status)||value.key!==multiRoomKey(state,now)) return;
  return {at:value.at,key:value.key,status:value.status};
}
export function multiRoomOfferText(state:any):string {
  const guests=state.facts.guests;
  const reason=guests===5
    ? 'Vocês precisarão de dois apartamentos: são 5 hóspedes e não há criança de até 6 anos para a ocupação adicional.'
    : `Para ${guests} hóspedes, precisamos dividir o grupo entre apartamentos.`;
  return reason+' A recepção precisa conferir a distribuição, os valores e a disponibilidade do conjunto.'
    +(state.package_date_request?' Seu pedido de datas diferentes do pacote também precisa dessa avaliação.':'')
    +' Posso chamar a equipe para continuar nesta conversa?';
}
export const multiRoomAcceptedText=(state:any)=>`Vou chamar a recepção para conferir a distribuição dos ${state.facts.guests} hóspedes entre apartamentos e preparar o orçamento do conjunto.`
  +(state.package_date_request?' A equipe também avaliará o período diferente que você pediu; essa exceção ainda não está aprovada.':'')
  +' A equipe confirmará os valores e a disponibilidade nesta conversa.';
export const multiRoomDeclinedText='Tudo bem, não vou solicitar o encaminhamento agora. Se quiser retomar o orçamento dos apartamentos, é só me dizer.';
