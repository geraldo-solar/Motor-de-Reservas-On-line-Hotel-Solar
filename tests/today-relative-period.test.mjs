import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';
const now=Date.parse('2026-09-17T17:19:00-03:00'),realNow=Date.now,realFetch=globalThis.fetch;
Date.now=()=>now;globalThis.fetch=async()=>{throw Error('External network forbidden');};
after(()=>{Date.now=realNow;globalThis.fetch=realFetch;});
const fixture={packages:[],extras:[],room_types:[{id:'couple',name:'Suíte Casal',active:true,capacity:2,base_price:410,overrides:[]}]};
const bundle=await build({stdin:{contents:`export {control,handleConversation} from './api/conversation-control.ts';export {default as resolver} from './api/resolve-package.ts';export {default as prices} from './api/get-prices.ts';export {todayStayDatePending,readStayDatePending} from './utils/stayDuration.ts';export {guestInquiry} from './utils/guestInquiry.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},plugins:[{name:'read-only-fixture',setup(b){
    b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const data=${JSON.stringify(fixture)};export function createClient(){return {from(table){if(!(table in data))throw Error('Unexpected table');const q={select(){return q},eq(){return q},then(r){return Promise.resolve({data:data[table],error:null}).then(r)}};return q}}}` }));
  }}]});
const {control,handleConversation,resolver,prices,todayStayDatePending,readStayDatePending,guestInquiry}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const literal='Boa tarde, gostaria que você verificasse pra mim se tem disponibilidade pra entrar hoje e sair depois de amanhã.';
const fresh=()=>({version:2,history:[],facts:{extras:[]},greeted:true,daily_greeting:{day:'2026-09-17',first:false},assistant_disclosure:{version:1,show:false,rendered:true}});
const old=()=>({...fresh(),history:['3','Hoje a sábado'],facts:{extras:['LUA'],guests:3},awaiting:'dates',
  stay_date_pending:{at:Date.parse('2026-09-17T13:43:00-03:00'),reason:'relative_dates'},pending:{quote_id:'old',option:'LOFT'},
  turns:[{role:'assistant',text:'LOFT para três pessoas, total R$999.'}]});
async function request(handler,body,query={transport:'manychat-v1'}){let status,result;await handler({method:'POST',body,query,headers:{}},{status(s){status=s;return this},json(v){result=v;return v},setHeader(){}});assert.equal(status,200);return result;}
async function turn(message,state=fresh(),audio=false){
  const raw=audio?'https://fixture.invalid/relative.ogg':message;
  const p=await handleConversation({operation:'prepare',state,user_message:raw},'',async()=>message,now);
  const r=control({operation:'route',state:p.state,user_message:raw,proposed:'COLETAR',ai_response:'Disponibilidade confirmada para três pessoas no Loft. Informe seu CPF.'},now);
  assert.equal(r.can_collect,'NAO');
  const quoting=r.quote_request.startsWith('QUOTE|');
  const out=quoting?await request(prices,{quote_request:r.quote_request,state:r.state}):await request(resolver,{state:r.state,user_message:raw});
  assert.equal(out.availability_checked,false);assert.doesNotMatch(out.conversation_text,/Disponibilidade confirmada|Informe seu CPF|outra conversa/);
  if(!quoting){assert.equal(out.has_conversation_text,'SIM');assert.equal(JSON.parse(out.manychat_payload).texts.conversation_text,out.conversation_text);}
  return {p,r,out,state:JSON.parse(out.state||r.state)};
}
function candidate(t,exit='2026-09-19'){
  assert.equal(t.state.facts.check_in,'2026-09-17',t.out.conversation_text);assert.equal(t.state.facts.check_out,undefined);
  assert.equal(t.state.stay_date_pending.reason,'relative_checkout');assert.equal(t.state.stay_date_pending.suggested_check_out,exit);
  assert.equal(t.r.quote_request,'NOQUOTE');assert.match(t.out.conversation_text,/Entrada hoje, 17\/09\/2026.*responda sim/s);
  assert.ok(t.out.conversation_text.includes(exit.split('-').reverse().join('/')));assert.equal(t.state.pending,undefined);
}
test('reteste real das17h19 avança até cotação com hóspedes atuais em texto e áudio simulado',async()=>{
  for(const initial of [fresh(),old()])for(const audio of [false,true]){
    const first=await turn(literal,initial,audio);candidate(first);assert.equal(first.state.facts.guests,undefined);assert.deepEqual(first.state.facts.extras,[]);
    assert.doesNotMatch(first.p.context,/LOFT para três|R\$999/);assert.doesNotMatch(first.out.conversation_text,/Boa tarde!/);
    const yes=await turn('Sim',first.state,audio);assert.equal(yes.state.facts.check_out,'2026-09-19');assert.match(yes.out.conversation_text,/quantas pessoas/);
    const party=await turn('Somos 2 adultos',yes.state,audio);assert.equal(party.r.quote_request,'QUOTE|2026-09-17|2026-09-19|2|NONE');
    const quote=JSON.parse(party.out.quote_state);assert.equal(quote.guests,2);assert.equal(quote.options.find(x=>x.name==='Suíte Casal').total,1020);
    assert.equal(party.out.requires_human_confirmation,true);
  }
});
test('períodos completos hoje–amanhã/depois de amanhã aceitam formas naturais sem herdar ocupação',async()=>{
  for(const ending of ['amanhã','depois de amanhã'])for(const message of [
    `Quero quarto para entrar hoje e sair ${ending}.`,`Quero entrar hoje e sair ${ending}`,
    `Hoje até ${ending}`,`De hj a ${ending}`,`Hoje para ${ending}`,
    `Entrando hoje e saindo ${ending}`,`Entrada hoje, saída ${ending}`,
    `Check-in hoje e check-out ${ending}`,`Chego hoje e saio ${ending}`,
    `Quero quarto para entrar hoje e sair ${ending}, por favor`,
    `Quero quarto para entrar hoje e sair ${ending}, tem vaga?`,
    `Hoje até ${ending} para 2 adultos`]){
    const t=await turn(message,old());candidate(t,ending==='amanhã'?'2026-09-18':'2026-09-19');
    assert.equal(t.state.facts.guests,message.includes('2 adultos')?2:undefined,message);
  }
});
test('pedidos indiretos flexionados preservam disponibilidade sem tratar se como hipótese',async()=>{
  for(const question of ['Gostaria que você verificasse pra mim se tem disponibilidade',
    'Poderia verificar para mim se vocês têm quarto','Pode ver por favor se há vaga',
    'Gostaria que consultasse se há disponibilidade','Me diga se tem quarto',
    'Queria saber se vocês têm vaga','Consegue conferir pra gente se tem quarto',
    'Vocês poderiam me informar se têm disponibilidade'])for(const period of ['entrar hoje e sair depois de amanhã','entrar hoje e sair no sábado']){
    const t=await turn(`${question} pra ${period}.`,old());candidate(t);assert.equal(t.state.facts.guests,undefined);
  }
});
test('negação, hipótese verdadeira, alternativas e horário não viram período confirmado',()=>{
  for(const message of ['Não quero quarto de hoje até depois de amanhã',
    'Se eu quiser hospedagem hoje até depois de amanhã?',
    'Gostaria que verificasse pra mim se eu decidir entrar hoje e sair depois de amanhã',
    'Pode verificar se tem quarto para hoje até depois de amanhã, caso eu decida viajar',
    'Pode verificar se tem quarto para hoje até amanhã ou depois de amanhã',
    'Quero quarto hoje até depois de amanhã às 18h',
    'Quero quarto hoje até depois de amanhã para 2 adultos, ou até domingo',
    'Quero quarto amanhã, mas hoje até depois de amanhã seria outra possibilidade',
    'Quero quarto hoje até depois de amanhã e sábado',
    'Quero quarto de hoje até hoje',
    'Quero quarto hoje até depois de amanhã, não sei ainda']){
    assert.equal(todayStayDatePending(message,undefined,now,true)?.suggested_check_out,undefined,message);
  }
});
test('FAQ, refeições e serviços ficam fora; humano, pagamentos e reservas existentes têm prioridade',async()=>{
  for(const message of ['O restaurante funciona de hoje até depois de amanhã?',
    'Tem café de hoje até amanhã?','Quero massagem hoje até depois de amanhã',
    'Passeio hoje até amanhã','Fotos do quarto para hoje até depois de amanhã',
    'Qual o horário do check-in hoje e check-out depois de amanhã?'])
    assert.equal(todayStayDatePending(message,undefined,now,true),undefined,message);
  assert.equal(guestInquiry('Qual o horário do check-in hoje e check-out depois de amanhã?'),'lodging_faq');
  for(const message of ['Quero falar com a recepção para entrar hoje e sair depois de amanhã',
    'Já paguei minha reserva para entrar hoje e sair depois de amanhã',
    'Já tenho uma reserva, quero alterar para entrar hoje e sair depois de amanhã']){
    const t=await turn(message,old());assert.equal(t.r.quote_request,'HUMANO');assert.equal(t.out.quote_request,'HUMANO');
  }
});
test('sim sem pergunta exibida, recusa e substituição não autorizam datas ou coleta antigas',async()=>{
  const p=control({operation:'prepare',state:old(),user_message:literal},now);
  assert.equal((await turn('Sim',JSON.parse(p.state))).state.facts.check_out,undefined);
  const t=await turn(literal,old());candidate(t);
  const no=await turn('Não',t.state);assert.equal(no.state.stay_date_pending.suggested_check_out,undefined);
  assert.equal((await turn('Sim',no.state)).state.facts.check_out,undefined);
  const changed=await turn('Hoje até amanhã',t.state);candidate(changed,'2026-09-18');
  assert.equal((await turn('Sim',changed.state)).state.facts.check_out,'2026-09-18');
  assert.equal(control({operation:'confirm',state:t.state},now).can_collect,'NAO');
});
test('família atual é preservada e idades são perguntadas; composição antiga expira',async()=>{
  const t=await turn(literal,old()),family=await turn('Somos 2 adultos e uma criança',t.state);
  const period=await turn('Hoje até depois de amanhã',family.state);candidate(period);assert.equal(period.state.facts.guests,3);
  const yes=await turn('Sim',period.state);assert.equal(yes.r.quote_request,'NOQUOTE');assert.match(yes.out.conversation_text,/idade/i);
  const age=await turn('5 anos',yes.state);assert.deepEqual(age.state.family_party.ages_months,[60]);
  const inline=await turn('Somos 2 adultos, queremos quarto de hoje até depois de amanhã',old());candidate(inline);assert.equal(inline.state.facts.guests,2);
  const stale=await turn(literal,{...old(),party_confirmed_at:now-86400000,family_party:{adults:2,children:1,total:3,ages_months:[60],updated_at:now-86400000}});
  candidate(stale);assert.equal(stale.state.facts.guests,undefined);assert.equal(stale.state.family_party,undefined);
});
test('calendário usa Belém, cruza mês/ano e expira à meia-noite ou depois de30min',()=>{
  for(const [clock,entry,exit] of [['2026-09-18T01:30:00Z','2026-09-17','2026-09-19'],
    ['2026-09-30T12:00:00-03:00','2026-09-30','2026-10-02'],['2026-12-31T12:00:00-03:00','2026-12-31','2027-01-02'],
    ['2028-02-28T12:00:00-03:00','2028-02-28','2028-03-01']]){
    const at=Date.parse(clock),p=todayStayDatePending(literal,undefined,at);assert.equal(p.check_in,entry);assert.equal(p.suggested_check_out,exit);
    assert.equal(p.check_out,undefined);assert.equal(readStayDatePending(p,at+31*60000),undefined);
  }
  const at=Date.parse('2026-09-17T23:55:00-03:00'),p=todayStayDatePending(literal,undefined,at);
  assert.equal(readStayDatePending(p,at+10*60000),undefined);
});
test('ofertas são silenciosas enquanto cliente confirma período',async()=>{
  const t=await turn(literal,old());candidate(t);
  const offers=await request(resolver,{user_message:t.out.conversation_text,state:t.out.state},{operation:'offers',transport:'manychat-v1'});
  assert.equal(offers.quote_request,'ROOM_DONE');assert.equal(offers.conversation_text,'');assert.equal(offers.has_conversation_text,'NAO');
});
