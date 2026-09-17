import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';
const now=Date.parse('2026-09-17T13:43:00-03:00'),realNow=Date.now,realFetch=globalThis.fetch;
Date.now=()=>now;globalThis.fetch=async()=>{throw Error('External network forbidden');};
after(()=>{Date.now=realNow;globalThis.fetch=realFetch;});
const fixture={packages:[],extras:[],room_types:[{id:'couple',name:'Suíte Casal',active:true,capacity:2,base_price:410,overrides:[]}]};
const bundle=await build({stdin:{contents:`export {control,handleConversation} from './api/conversation-control.ts';export {default as resolver} from './api/resolve-package.ts';export {default as prices} from './api/get-prices.ts';export {todayStayDatePending,readStayDatePending} from './utils/stayDuration.ts';export {guestInquiry,explicitLodgingRequest} from './utils/guestInquiry.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},plugins:[{name:'read-only-fixture',setup(b){
    b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const data=${JSON.stringify(fixture)};export function createClient(){return {from(table){if(!(table in data))throw Error('Unexpected table');const q={select(){return q},eq(){return q},then(r){return Promise.resolve({data:data[table],error:null}).then(r)}};return q}}}` }));
  }}]});
const {control,handleConversation,resolver,prices,todayStayDatePending,readStayDatePending,guestInquiry,explicitLodgingRequest}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const literal='Boa tarde, gostaria de saber se vocês têm disponibilidade para a para a vaga hoje, entrando hoje e saindo no sábado.';
const fresh=()=>({version:2,history:[],facts:{extras:[]},greeted:true,daily_greeting:{day:'2026-09-16',first:false},assistant_disclosure:{version:1,show:false,rendered:true}});
const old=()=>({...fresh(),history:['3','Me mande o cardápio do reserva pfv'],facts:{extras:['LUA'],guests:3,check_in:'2026-09-16',check_out:'2026-09-18'},
  topic:'room_info',subject:'LOFT',topic_at:now-86400000,pending:{quote_id:'old',option:'LOFT'},
  turns:[{role:'assistant',text:'LOFT para três pessoas, total R$999.'}]});
async function request(handler,body,query={transport:'manychat-v1'}){let status,result;await handler({method:'POST',body,query,headers:{}},{status(s){status=s;return this},json(v){result=v;return v},setHeader(){}});assert.equal(status,200);return result;}
async function turn(message,state=fresh(),audio=false){
  const raw=audio?'https://fixture.invalid/period.ogg':message;
  const p=await handleConversation({operation:'prepare',state,user_message:raw},'',async()=>message,now);
  const r=control({operation:'route',state:p.state,user_message:raw,proposed:'COLETAR',ai_response:'Disponibilidade confirmada para três pessoas no Loft. Informe seu CPF.'},now);
  assert.equal(r.can_collect,'NAO');
  const out=r.quote_request.startsWith('QUOTE|')?await request(prices,{quote_request:r.quote_request,state:r.state}):await request(resolver,{state:r.state,user_message:raw});
  assert.equal(out.availability_checked,false);assert.doesNotMatch(out.conversation_text,/Disponibilidade confirmada|Informe seu CPF|outra conversa/);
  if(!r.quote_request.startsWith('QUOTE|')){assert.equal(out.has_conversation_text,'SIM');assert.equal(JSON.parse(out.manychat_payload).texts.conversation_text,out.conversation_text);}
  return {p,r,out,state:JSON.parse(out.state||r.state),raw};
}
function candidate(t){
  assert.equal(t.state.facts.check_in,'2026-09-17',JSON.stringify({message:t.raw,answer:t.out.conversation_text,pending:t.state.stay_date_pending}));assert.equal(t.state.facts.check_out,undefined);
  assert.equal(t.state.stay_date_pending.reason,'relative_checkout');assert.equal(t.state.stay_date_pending.suggested_check_out,'2026-09-19');
  assert.equal(t.state.stay_date_pending.checkout_weekday,6);assert.equal(t.r.quote_request,'NOQUOTE');
  assert.match(t.out.conversation_text,/Entrada hoje, 17\/09\/2026.*sábado, 19\/09\/2026.*responda sim/s);
  assert.doesNotMatch(t.out.conversation_text,/Quais são as datas de entrada e saída|Qual será a data de saída/);
  assert.equal(t.state.pending,undefined);
}
test('teste real: pedido completo e Hoje a sábado confirmam período, em texto e transcrição simulada',async()=>{
  for(const start of [fresh(),old()])for(const audio of [false,true]){
    let t=await turn(literal,start,audio);candidate(t);assert.equal(t.state.facts.guests,undefined);assert.match(t.out.conversation_text,/^Boa tarde!/);
    t=await turn('Hoje a sábado',t.state,audio);candidate(t);assert.equal(t.state.facts.guests,undefined);assert.doesNotMatch(t.out.conversation_text,/Boa tarde!/);
    const yes=await turn('Sim',t.state,audio);assert.equal(yes.state.facts.check_out,'2026-09-19');assert.match(yes.out.conversation_text,/quantas pessoas/);
    const party=await turn('Somos 2 adultos',yes.state,audio);assert.equal(party.r.quote_request,'QUOTE|2026-09-17|2026-09-19|2|NONE');
    const quote=JSON.parse(party.out.quote_state);assert.equal(quote.guests,2);assert.equal(quote.options.find(x=>x.name==='Suíte Casal').total,1020); // Thursday 410 + Friday's existing 610 tariff.
    assert.equal(party.out.requires_human_confirmation,true);
  }
});
test('variações de período combinado recuperam inclusive a pendência genérica legada',async()=>{
  const state={...old(),awaiting:'dates',stay_date_pending:{at:now-10000,reason:'relative_dates'}};
  for(const message of ['Hoje a sábado','De hoje até sábado','hj até sábado','Hoje ao sábado','Chego hoje e saio no sábado',
    'Entrando hoje e saindo no sábado','Entrada hoje e saída sábado','Check-in hoje e check-out no sábado',
    'Quero quarto de hoje até sábado','Gostaria de saber se têm vaga de hoje a sábado','De hoje até sábado para 2 adultos']){
    const t=await turn(message,state);candidate(t);
    assert.equal(t.state.facts.guests,message.includes('2 adultos')?2:undefined,message);
    assert.deepEqual(t.state.facts.extras,[]);assert.doesNotMatch(t.p.context,/R\$999|Me mande o cardápio/);
  }
});
test('pergunta indireta sobre disponibilidade não é hipótese e preserva as proteções de negativa',()=>{
  for(const message of ['Gostaria de saber se vocês têm quarto para hoje','Pode me informar se tem vaga para hj?',
    'Quero consultar se há disponibilidade para hoje'])assert.equal(todayStayDatePending(message,undefined,now)?.check_in,'2026-09-17',message);
  for(const message of ['Se eu quiser hospedagem de hoje até sábado?','Não quero quarto de hoje a sábado','Gostaria de saber se tem quarto hoje, caso eu decida viajar',
    'Quero quarto hoje a sábado ou domingo','Quero quarto hoje a sábado às 18h','Quero quarto hoje a sábado passado'])
    assert.equal(todayStayDatePending(message,undefined,now,true)?.suggested_check_out,undefined,message);
});
test('declaração de check-in e check-out não confunde período com regras e horários',()=>{
  assert.equal(explicitLodgingRequest('Check-in hoje e check-out no sábado'),true);
  assert.equal(guestInquiry('Check-in hoje e check-out no sábado'),undefined);
  for(const message of ['Qual o horário do check-in hoje e check-out no sábado?',
    'Como funciona o check-in hoje e check-out no sábado?',
    'Quais documentos preciso para check-in hoje e check-out no sábado?',
    'Não quero check-in hoje e check-out no sábado',
    'Se eu quiser check-in hoje e check-out no sábado?',
    'Qual o horário de check-in hoje?']){
    assert.equal(explicitLodgingRequest(message),false,message);
    assert.equal(guestInquiry(message),'lodging_faq',message);
  }
});
test('período combinado não converte refeições, passeios ou massagens em hospedagem',async()=>{
  for(const message of ['O restaurante abre de hoje a sábado?','Tem café de hoje a sábado?','Massagem de hoje a sábado',
    'Passeio de hoje a sábado','Qual o horário da piscina hoje a sábado?','Day use de hoje a sábado'])
    assert.equal(todayStayDatePending(message,undefined,now,true),undefined,message);
  for(const message of ['Quero falar com a recepção para me hospedar hoje a sábado','Já paguei minha reserva de hoje a sábado',
    'Já tenho uma reserva, quero alterar de hoje a sábado']){
    const t=await turn(message,old());assert.equal(t.r.quote_request,'HUMANO',message);assert.equal(t.out.quote_request,'HUMANO',message);
  }
});
test('sim confirma somente a pergunta exibida; recusa e mudança de dia não reaproveitam candidata',async()=>{
  const t=await turn(literal,old());candidate(t);
  const p=control({operation:'prepare',user_message:literal,state:old()},now);
  assert.equal((await turn('Sim',JSON.parse(p.state))).state.facts.check_out,undefined);
  const no=await turn('Não',t.state);assert.equal(no.state.stay_date_pending.suggested_check_out,undefined);
  assert.equal((await turn('Sim',no.state)).state.facts.check_out,undefined);
  const sunday=await turn('Domingo',t.state);assert.equal(sunday.state.stay_date_pending.suggested_check_out,'2026-09-20');
  assert.equal((await turn('Sim',sunday.state)).state.facts.check_out,'2026-09-20');
  assert.equal(control({operation:'confirm',state:t.state},now).can_collect,'NAO');
});
test('composição atual permanece; a quantidade antiga é descartada antes de extrair novos hóspedes',async()=>{
  const start=await turn(literal,old());
  const family=await turn('Somos 2 adultos e uma criança de 5 anos',start.state);
  const period=await turn('Hoje a sábado',family.state);candidate(period);assert.equal(period.state.facts.guests,3);assert.deepEqual(period.state.family_party.ages_months,[60]);
  const sameMessage=await turn('Somos 2 adultos, queremos quarto de hoje até sábado',old());candidate(sameMessage);assert.equal(sameMessage.state.facts.guests,2);
  const stale=await turn(literal,{...old(),party_confirmed_at:now-86400000,family_party:{adults:2,children:1,total:3,ages_months:[60],updated_at:now-86400000}});
  candidate(stale);assert.equal(stale.state.facts.guests,undefined);assert.equal(stale.state.family_party,undefined);
});
test('calendário local e limites da candidata funcionam na virada de mês, ano e dia',()=>{
  for(const [clock,message,entry,exit] of [
    ['2026-09-18T01:30:00Z','Hoje a sábado','2026-09-17','2026-09-19'],
    ['2026-09-30T12:00:00-03:00','Hoje a sábado','2026-09-30','2026-10-03'],
    ['2026-12-31T12:00:00-03:00','Hoje a sábado','2026-12-31','2027-01-02'],
    ['2026-09-19T12:00:00-03:00','Hoje a sábado','2026-09-19','2026-09-26'],
    ['2026-09-17T12:00:00-03:00','Hoje a sábado da semana que vem','2026-09-17','2026-09-26']]){
    const at=Date.parse(clock),p=todayStayDatePending(message,undefined,at,true);assert.equal(p.check_in,entry);assert.equal(p.suggested_check_out,exit);assert.equal(p.check_out,undefined);
  }
  const at=Date.parse('2026-09-17T23:55:00-03:00'),pending=todayStayDatePending('Hoje a sábado',undefined,at,true);
  assert.equal(readStayDatePending(pending,at+10*60000),undefined);assert.equal(readStayDatePending(pending,at+31*60000),undefined);
});
test('ofertas após a confirmação pendente terminam sem enviar pacote ou adicionais antigos',async()=>{
  const t=await turn(literal,old());candidate(t);
  const offers=await request(resolver,{user_message:t.out.conversation_text,state:t.out.state},{operation:'offers',transport:'manychat-v1'});
  assert.equal(offers.quote_request,'ROOM_DONE');assert.equal(offers.conversation_text,'');assert.equal(offers.has_conversation_text,'NAO');
});
