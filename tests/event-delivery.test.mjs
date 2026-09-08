import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
process.env.MANYCHAT_API_KEY='unit-test-only-not-a-real-credential';
const load=async(path)=>{const b=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm',packages:'external'});return import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString('base64')}`);};
// Bundle dependencies so data URL imports do not need filesystem resolution.
const b=await build({entryPoints:['utils/eventDelivery.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {deliverEvent,deliverySuccess,deliveryPending}=await import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString('base64')}`);
const {advanceEvent,readEvent,signEvent,EVENT_TEST_CONTACT,LUIZA_CONTACT}=await load('utils/eventInquiry.ts');
const {control}=await load('api/conversation-control.ts');
const now=Date.now();
function prepared(){let e=advanceEvent(null,'Quero um aniversário para 50 pessoas em 20/10/2026',EVENT_TEST_CONTACT,now);for(const s of ['18h às 22h, Reserva Solar','Jantar, refrigerantes e decoração','Sem hospedagem','Até R$ 10 mil','autorizo'])e=advanceEvent(e,s,EVENT_TEST_CONTACT,now);return e;}
function mocks(e,status='missing',mode='queued') {
  const calls=[];let current=status;
  return {calls,get status(){return current;},deps:{
    eventLedger:async(id,action)=>{calls.push(['ledger',action]);if(action==='claim'){if(current!=='missing')return{status:current,acquired:false};current='processing';return{status:current,acquired:true};}if(action==='error')current='error';return{status:current,acquired:false};},
    manychat:async(path,body)=>{calls.push([path,body]);if(path.includes('getInfo'))return path.endsWith(EVENT_TEST_CONTACT)?{name:'Cliente Teste',whatsapp_phone:'+5591982041312',custom_fields:[{name:'chatgpt_thread',value:JSON.stringify({event:e})}]}:{whatsapp_phone:'+5591991654050',optin_whatsapp:true};if(path.includes('sendFlow')){if(mode==='timeout')throw Error('timeout');if(mode==='receipt')current='accepted';}return{};},
  }};
}
test('coleta aproveita data e participantes, preserva palavras do cliente e exige consentimento',()=>{
  let e=advanceEvent(null,'Quero um aniversário para 50 pessoas em 20/10/2026',EVENT_TEST_CONTACT,now);
  assert.equal(e.stage,3);assert.match(e.answer,/horário e local/);assert.equal(e.fields.participantes,'50 pessoas');
  assert.equal(advanceEvent(e,e.last,EVENT_TEST_CONTACT,now).stage,3);
  e=prepared();assert.equal(e.status,'ready');assert.ok(e.consent_at);assert.match(e.fields.servicos,/Jantar/);assert.match(e.fields.observacoes,/10 mil/);
  assert.equal(advanceEvent(null,'Evento empresarial','outro-contato',now),undefined);
  assert.equal(readEvent({...e,source:'outro-contato'}),undefined);
  assert.equal(readEvent({...e,fields:{...e.fields,servicos:'inventado'}}),undefined);
});
test('coleta nunca altera ocupação, nem autoriza dados de reserva; recusa não envia',()=>{
  let p=control({operation:'prepare',subscriber_id:EVENT_TEST_CONTACT,user_message:'Evento para 50 pessoas',state:{version:2,history:[],facts:{guests:2,extras:[]},greeted:true}});
  let r=control({operation:'route',state:p.state,user_message:'Evento para 50 pessoas',proposed:'COLETAR'});
  assert.equal(r.quote_request,'NOQUOTE');assert.equal(r.can_collect,'NAO');assert.equal(JSON.parse(r.state).facts.guests,2);assert.match(r.answer,/data desejada/);
  let e=prepared();e=signEvent({...e,status:'consent'});e=advanceEvent(e,'não',EVENT_TEST_CONTACT,now);assert.equal(e.status,'cancelled');assert.doesNotMatch(e.answer,/compartilhei/i);
});
test('envio só usa Luiza confirmada e não anuncia compartilhamento apenas por enfileirar',async()=>{
  const e=prepared(),m=mocks(e);const r=await deliverEvent(e,EVENT_TEST_CONTACT,m.deps,false);
  assert.equal(r.answer,deliveryPending);assert.equal(r.event.status,'ready');
  assert.equal(m.calls.filter(x=>x[0].includes('sendFlow')).length,1);
  const send=m.calls.find(x=>x[0].includes('sendFlow'))[1];assert.equal(String(send.subscriber_id),LUIZA_CONTACT);
  const fields=m.calls.find(x=>x[0].includes('setCustomFields'))[1].fields;
  assert.equal(fields.find(f=>f.field_name==='solar_evento_whatsapp').field_value,'https://wa.me/5591982041312');
  await deliverEvent(e,EVENT_TEST_CONTACT,m.deps,false);assert.equal(m.calls.filter(x=>x[0].includes('sendFlow')).length,1);
});
test('somente recibo aceito permite confirmação; timeout não repete e falha não mente',async()=>{
  const e=prepared(),confirmed=mocks(e,'accepted');const r=await deliverEvent(e,EVENT_TEST_CONTACT,confirmed.deps,false);
  assert.equal(r.answer,deliverySuccess);assert.equal(r.event.status,'sent');assert.equal((r.answer.match(/5591991654050/g)||[]).length,1);
  assert.equal(confirmed.calls.filter(x=>x[0].includes('sendFlow')).length,0);
  const timed=mocks(e,'missing','timeout');assert.equal((await deliverEvent(e,EVENT_TEST_CONTACT,timed.deps,false)).answer,deliveryPending);
  await deliverEvent(e,EVENT_TEST_CONTACT,timed.deps,false);assert.equal(timed.calls.filter(x=>x[0].includes('sendFlow')).length,1);
});
test('estado falsificado, consentimento não persistido e destinatária divergente impedem envio',async()=>{
  const e=prepared(),m=mocks(e);await deliverEvent({...e,consent_at:0},EVENT_TEST_CONTACT,m.deps,false);assert.equal(m.calls.length,0);
  const wrong=mocks({...e,signature:'bad'});await deliverEvent(e,EVENT_TEST_CONTACT,wrong.deps,false);assert.equal(wrong.calls.filter(x=>x[0].includes('sendFlow')).length,0);
  const noOpt=mocks(e);const original=noOpt.deps.manychat;noOpt.deps.manychat=async(p,b)=>p.endsWith(LUIZA_CONTACT)?{whatsapp_phone:'+5591991654050',optin_whatsapp:false}:original(p,b);
  await deliverEvent(e,EVENT_TEST_CONTACT,noOpt.deps,false);assert.equal(noOpt.calls.filter(x=>x[0].includes('sendFlow')).length,0);
});
