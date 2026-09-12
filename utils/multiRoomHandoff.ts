import {familyAccommodation} from './familyAccommodation.js';

export type MultiRoomHandoff={at:number;key:string;status:'offered'|'accepted'|'declined'};
const norm=(s:string)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export const multiRoomReply=(message:string):'accepted'|'declined'|undefined=>
  /^(?:sim|sim,? por favor|pode|pode sim|pode chamar|pode encaminhar|pode prosseguir|quero sim|por favor)[.!]*$/.test(norm(message))?'accepted':
  /^(?:nao|nao obrigado|nao obrigada|agora nao|nao precisa|prefiro nao)[.!]*$/.test(norm(message))?'declined':undefined;

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
  if (!date(f.check_in)||!date(f.check_out)) return;
  const nights=(Date.parse(f.check_out+'T12:00:00Z')-Date.parse(f.check_in+'T12:00:00Z'))/86400000;
  if(nights<1||nights>30)return;
  return JSON.stringify([f.check_in,f.check_out,f.guests,family.key||null]);
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
  return reason+' A recepção precisa conferir a distribuição, os valores e a disponibilidade do conjunto. Posso chamar a equipe para continuar nesta conversa?';
}
export const multiRoomAcceptedText=(state:any)=>`Vou chamar a recepção para conferir a distribuição dos ${state.facts.guests} hóspedes entre apartamentos e preparar o orçamento do conjunto. A equipe confirmará os valores e a disponibilidade nesta conversa.`;
export const multiRoomDeclinedText='Tudo bem, não vou solicitar o encaminhamento agora. Se quiser retomar o orçamento dos apartamentos, é só me dizer.';
