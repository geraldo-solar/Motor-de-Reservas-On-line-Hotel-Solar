import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { eventInquiry } from './hotelInfo.js';

export const EVENT_TEST_CONTACT = '1713487706';
export const LUIZA_CONTACT = '1450802917';
export const LUIZA_PHONE = '5591991654050';
export const EVENT_FLOW = 'content20260904171649_136696';
export const LUIZA_LINK = 'https://wa.me/5591991654050';
export type EventState = { id:string; source:string; created:number; updated?:number; stage:number; status:'collecting'|'consent'|'ready'|'sent'|'cancelled'; fields:Record<string,string>; last:string; answer:string; consent_at?:number; signature?:string };
export function manychatToken() { return (process.env.MANYCHAT_API_KEY || process.env.VITE_MANYCHAT_API_KEY || '').replace(/^Bearer\s+/i,'').trim(); }
export function eventMac(value:string) { const key=manychatToken(); return key ? createHmac('sha256',key).update('solar-events-v1:'+value).digest('hex') : ''; }
export const ledgerToken = () => eventMac('ledger');
const normalized=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const clean=(s:string)=>s.replace(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g,'[documento omitido]').replace(/\b(?:\d[ -]?){13,19}\b/g,'[dado omitido]').replace(/[\r\n\t]+/g,' ').slice(0,500);
export function signEvent(event:EventState):EventState { const {signature,...value}=event; return {...value,signature:eventMac(JSON.stringify(value))}; }
export function readEvent(value:any,now=Date.now()):EventState|undefined {
  if(!value || value.source!==EVENT_TEST_CONTACT || !/^[a-f0-9-]{36}$/.test(value.id||'') || !value.fields || typeof value.last!=='string' || typeof value.answer!=='string' || !Number.isInteger(value.stage) || value.stage<0 || value.stage>7 || !['collecting','consent','ready','sent','cancelled'].includes(value.status) || !Number.isFinite(value.created) || now-value.created>48*3600000 || value.created>now+60000) return;
  const {signature,...unsigned}=value; const expected=eventMac(JSON.stringify(unsigned));
  if(!expected || typeof signature!=='string' || signature.length!==expected.length || !timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) return;
  return value;
}
const steps=[
  ['tipo','Que tipo de evento você está planejando, ou qual é o objetivo do grupo?'],
  ['data','Qual é a data desejada? Se houver flexibilidade, pode me contar também.'],
  ['participantes','Quantas pessoas devem participar? Se houver crianças, pode incluir essa informação.'],
  ['horario_local','Qual horário e local você imagina: Hotel Solar, Reserva Solar ou ainda a definir?'],
  ['servicos','Como você imagina a alimentação, as bebidas e a estrutura do evento? Pode incluir decoração, música ou equipamentos desejados.'],
  ['hospedagem','O grupo também precisará de hospedagem? Se sim, para quantas pessoas e em quais datas?'],
  ['observacoes','Há uma faixa de orçamento ou algum outro detalhe importante que gostaria de passar à Luiza? É opcional.'],
] as const;
const labels:Record<string,string>={tipo:'Evento/grupo',data:'Data e flexibilidade',participantes:'Participantes',horario_local:'Horário e local',servicos:'Alimentação, bebidas e estrutura desejada',hospedagem:'Hospedagem',observacoes:'Orçamento e observações'};
export function eventSummary(e:EventState) { return steps.map(([key])=>`${labels[key]}: ${e.fields[key]||'A definir'}`).join('; '); }
export function eventConsent(e:EventState) { return `Anotei seu pedido: ${eventSummary(e).slice(0,1150)}.\n\nPosso compartilhar seu nome de contato, WhatsApp e esses detalhes com a Luiza para ela continuar o orçamento? Responda “autorizo” ou “não”.`; }
function infer(e:EventState,raw:string) {
  const n=normalized(raw);
  if(!e.fields.tipo && eventInquiry(raw)) e.fields.tipo=clean(raw);
  if(!e.fields.participantes) { const m=raw.match(/\b(\d{1,4})\s*(pessoas|participantes|convidad[oa]s|adultos|hospedes|hóspedes)\b/i); if(m)e.fields.participantes=clean(m[0]); }
  if(!e.fields.data) { const m=raw.match(/\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b|\b\d{1,2}\s+de\s+(?:janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+\d{4})?/i); if(m)e.fields.data=m[0]; }
}
export function advanceEvent(existing:any,raw:string,source:string,now=Date.now()):EventState|undefined {
  let e=readEvent(existing,now); const n=normalized(raw);
  if(source!==EVENT_TEST_CONTACT) return;
  if(!e) {
    if(!eventInquiry(raw) || /\b(fotos?|imagens|galeria)\b/.test(n)) return;
    e={id:randomUUID(),source,created:now,stage:0,status:'collecting',fields:{},last:'',answer:''};
  } else {
    if(e.last===raw && now-(e.updated||e.created)<3000 && !['ready','sent'].includes(e.status)) return e;
    if(/\b(novo|outro) (evento|orcamento|pedido)\b/.test(n)) e={id:randomUUID(),source,created:now,stage:0,status:'collecting',fields:{},last:'',answer:''};
    else if(/^(esquece|deixa pra la|desisti|cancelar)[.! ]*$|\b(cancelar (o |meu )?(evento|pedido)|nao quero (mais|compartilhar|encaminhar))\b/.test(n) && e.status!=='sent') {e.status='cancelled';e.answer=`Tudo bem, não vou encaminhar seus dados. Se preferir falar diretamente com a Luiza:\n${LUIZA_LINK}`;e.last=raw;return signEvent(e);}
    else if(['cancelled','sent'].includes(e.status)) return undefined;
    else if(e.status==='ready') {e.last=raw;return signEvent(e);}
    else if(e.status==='consent') {
      if(/^(sim|autorizo|pode (sim|enviar|encaminhar|compartilhar)|sim[,! ]+pode (enviar|encaminhar|compartilhar)|confirmo)[.! ]*$/.test(n)) { e.status='ready';e.consent_at=now;e.answer='Vou encaminhar o pedido autorizado e conferir o envio.'; }
      else if(/^(nao|nao autorizo|prefiro nao)[.! ]*$/.test(n)) { e.status='cancelled';e.answer=`Sem problema! Não vou compartilhar seus dados. Você pode falar diretamente com a Luiza:\n${LUIZA_LINK}`; }
      else { e.fields.observacoes=clean([e.fields.observacoes,raw].filter(Boolean).join('; ')); e.answer=eventConsent(e); }
      e.last=raw;return signEvent(e);
    } else if(/\b(so (?:o )?contato|telefone da luiza|falar direto|encaminh[ae] agora|pode encaminhar|ja pode enviar)\b/.test(n)) {
      e.status='consent'; e.answer=`Você pode falar com a Luiza agora: ${LUIZA_LINK}\n\n${eventConsent(e)}`;e.last=raw;return signEvent(e);
    } else if(e.last) {
      // Store the customer's own answer to the question asked, never an AI guess.
      const key=steps[e.stage]?.[0];
      if(key) e.fields[key]=/^(nao sei|a definir|pular|nao tenho|ainda nao sei)[.! ]*$/.test(n)?'A definir':clean(raw);
    }
  }
  infer(e,raw);
  const index=steps.findIndex(([key])=>!e!.fields[key]);
  if(index<0) {e.status='consent';e.stage=7;e.answer=eventConsent(e);}
  else {e.stage=index;e.answer=(e.last?'':'Claro! Vou reunir os detalhes para a Luiza preparar seu atendimento. 😊\n\n')+steps[index][1]+(e.last?'':'\nSe preferir, podemos encaminhar com o que você já souber.');}
  e.last=raw;e.updated=now; return signEvent(e);
}
