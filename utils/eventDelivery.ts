import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { eventMac, eventSummary, EVENT_FLOW, EVENT_TEST_CONTACT, ledgerToken, LUIZA_CONTACT, LUIZA_LINK, LUIZA_PHONE, manychatToken, readEvent, signEvent, type EventState } from './eventInquiry.js';

export async function eventLedger(id:string,action:string) {
  const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL;
  const key=process.env.VITE_SUPABASE_ANON_KEY||process.env.SUPABASE_ANON_KEY;
  if(!url||!key||!ledgerToken())throw Error('Event storage unavailable');
  const {data,error}=await createClient(url,key).rpc('solar_event_delivery_rpc',{p_token:ledgerToken(),p_id:id,p_action:action});
  if(error)throw Error('Event storage unavailable');
  return data as {status:string;acquired:boolean};
}
export async function acceptEventReceipt(body:any) {
  const [id,mac]=String(body?.receipt||'').split('.');const expected=eventMac('receipt:'+id);
  if(String(body?.subscriber_id)!==LUIZA_CONTACT || !/^[a-f0-9-]{36}$/.test(id||'') || !expected || mac?.length!==expected.length || !timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))return {code:403,status:'forbidden'};
  try {const r=await eventLedger(id,'accepted');return {code:r.status==='accepted'?200:409,status:r.status};}
  catch{return {code:503,status:'unavailable'};}
}
export async function manychat(endpoint:string,body?:any) {
  const token=manychatToken();if(!token)throw Error('Messaging unavailable');
  const r=await fetch('https://api.manychat.com'+endpoint,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
  const data=await r.json();
  if(!r.ok||data.status!=='success')throw Error('Messaging request failed');
  return data.data;
}
export const deliveryPending = `O encaminhamento está em processamento e ainda não tenho a confirmação do envio. Se preferir falar diretamente com a Luiza:\n${LUIZA_LINK}`;
export const deliveryFailed = `Ainda não consegui concluir o envio para a Luiza. Você pode falar diretamente com ela:\n${LUIZA_LINK}`;
export const deliverySuccess = `Pronto! Compartilhei seu contato e os detalhes que você me passou com a Luiza, responsável pelos orçamentos de eventos e grupos. 😊\n\nSe preferir falar com ela agora, sem aguardar o retorno:\nWhatsApp da Luiza: ${LUIZA_LINK}`;

export async function deliverEvent(e:EventState,source:string,dependencies={manychat,eventLedger},poll=true):Promise<{event:EventState;answer:string}> {
  const result=(answer:string,event=e)=>({event,answer});
  if(source!==EVENT_TEST_CONTACT || !readEvent(e) || e.status!=='ready' || !e.consent_at) return result(deliveryFailed);
  // Source contact and signed consent MUST already be persisted by the authenticated ManyChat flow.
  const customer=await dependencies.manychat('/fb/subscriber/getInfo?subscriber_id='+EVENT_TEST_CONTACT);
  let persisted:any;try{persisted=JSON.parse(customer.custom_fields?.find((f:any)=>f.name==='chatgpt_thread')?.value||'{}');}catch{}
  const saved=readEvent(persisted?.event);
  if(!saved || saved.id!==e.id || saved.status!=='ready' || saved.signature!==e.signature || String(customer.whatsapp_phone||'').replace(/\D/g,'')!=='5591982041312')return result(deliveryFailed);
  const current=await dependencies.eventLedger(e.id,'status');
  const accepted=()=>result(deliverySuccess,signEvent({...e,status:'sent',answer:deliverySuccess}));
  if(current.status==='accepted') return accepted();
  if(current.status==='error')return result(deliveryFailed);
  if(current.status==='processing')return result(deliveryPending);
  const recipient=await dependencies.manychat('/fb/subscriber/getInfo?subscriber_id='+LUIZA_CONTACT);
  if(String(recipient.whatsapp_phone||'').replace(/\D/g,'')!==LUIZA_PHONE || recipient.optin_whatsapp!==true)return result(deliveryFailed);
  const lock=await dependencies.eventLedger(e.id,'claim');
  if(!lock.acquired)return result(lock.status==='accepted'?deliverySuccess:deliveryPending);
  let sending=false;
  try {
    await dependencies.manychat('/fb/subscriber/setCustomFields',{subscriber_id:Number(LUIZA_CONTACT),fields:[
      {field_name:'solar_evento_cliente',field_value:String(customer.name||'Nome não informado').slice(0,120)},
      {field_name:'solar_evento_whatsapp',field_value:'https://wa.me/5591982041312'},
      {field_name:'solar_evento_resumo',field_value:eventSummary(e)+'; Referência: '+e.id},
      {field_name:'solar_evento_recibo',field_value:e.id+'.'+eventMac('receipt:'+e.id)},
    ]});
    sending=true;
    await dependencies.manychat('/fb/sending/sendFlow',{subscriber_id:Number(LUIZA_CONTACT),flow_ns:EVENT_FLOW});
    // sendFlow success means queued, NOT delivered. A post-message callback confirms execution.
    if(poll)for(let i=0;i<6;i++){await new Promise(r=>setTimeout(r,1000));if((await dependencies.eventLedger(e.id,'status')).status==='accepted')return accepted();}
    return result(deliveryPending);
  } catch {
    // An ambiguous send timeout must never produce an automatic duplicate.
    if(!sending)await dependencies.eventLedger(e.id,'error');
    return result(sending?deliveryPending:deliveryFailed);
  }
}
