import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';
const now=Date.parse('2026-09-16T08:39:00-03:00'),realNow=Date.now,realFetch=globalThis.fetch;
Date.now=()=>now;globalThis.fetch=async()=>{throw Error('External network forbidden');};
after(()=>{Date.now=realNow;globalThis.fetch=realFetch;});
const fixture={packages:[],extras:[],room_types:[{id:'couple',name:'Suíte Casal',active:true,capacity:2,base_price:410,overrides:[]}]};
const bundle=await build({stdin:{contents:`export {control,handleConversation} from './api/conversation-control.ts';export {default as resolver} from './api/resolve-package.ts';export {default as prices} from './api/get-prices.ts';export {todayStayDatePending,relativeCheckoutReply} from './utils/stayDuration.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},plugins:[{name:'read-only-fixture',setup(b){
    b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const data=${JSON.stringify(fixture)};export function createClient(){return {from(table){if(!(table in data))throw Error('Unexpected table');const q={select(){return q},eq(){return q},then(r){return Promise.resolve({data:data[table],error:null}).then(r)}};return q}}}` }));
  }}]});
const {control,handleConversation,resolver,prices,todayStayDatePending,relativeCheckoutReply}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const fresh=()=>({version:2,history:[],facts:{extras:[]},greeted:true,daily_greeting:{day:'2026-09-16',first:false},assistant_disclosure:{version:1,show:false,rendered:true}});
const old=()=>({...fresh(),history:['Somos três pessoas','Quero o Loft','Como faço para chegar aí?'],facts:{guests:3,children_pending:false,extras:['LUA']},
  family_party:{total:3,ages_months:[],updated_at:now-86400000},subject:'Loft',topic:'room_info',topic_at:now-86400000,
  turns:[{role:'user',text:'Somos três pessoas'},{role:'assistant',text:'Loft para três pessoas, total R$999.'}],
  extra_photo_requests:['LUA'],guest_inquiry:{kind:'dining',at:now-60000}});
const unsafeQuote={version:1,id:'old-quote',created_at:now,check_in:'2026-09-18',check_out:'2026-09-20',guests:3,extras:[],options:[{name:'LOFT',capacity:4,total:999}]};
async function request(handler,body,query={transport:'manychat-v1'}){let status,result;await handler({method:'POST',body,query,headers:{}},{status(s){status=s;return this},json(v){result=v;return v},setHeader(){}});assert.equal(status,200);return result;}
async function turn(message,state=fresh(),audio=false,time=now){
  const raw=audio?'https://media.example.test/today-inquiry.ogg':message;
  const p=audio?await handleConversation({operation:'prepare',state,user_message:raw},'',async()=>message,time):control({operation:'prepare',state,user_message:raw},time);
  const r=control({operation:'route',state:p.state,user_message:raw,quote_state:unsafeQuote,proposed:'COLETAR',ai_response:'Disponibilidade confirmada para três pessoas no Loft. Informe seu CPF.'},time);
  return {p,r,state:JSON.parse(r.state),raw};
}
test('teste literal: hj, Para hj e Hoje conservam entrada e pedem só a saída, em texto e áudio',async()=>{
  for(const initial of [fresh(),old()])for(const audio of [false,true]){
    let state=initial;
    for(const message of ['Se eu quiser me hospedar hj, tem vaga?','Para hj','Hoje']){
      const t=await turn(message,state,audio);state=t.state;
      assert.equal(state.facts.check_in,'2026-09-16');assert.equal(state.facts.check_out,undefined);assert.equal(state.facts.guests,undefined);
      assert.equal(state.stay_date_pending.reason,'relative_checkout');assert.equal(t.r.quote_request,'NOQUOTE');assert.equal(t.r.can_collect,'NAO');
      assert.match(t.r.answer,/Entrada hoje, 16\/09\/2026.*Qual será a data de saída/s);
      assert.doesNotMatch(t.r.answer,/outra conversa|datas de entrada|três|Loft|confirmada|CPF/);
      const resolved=await request(resolver,{user_message:t.raw,state:t.r.state});
      assert.equal(resolved.match_type,'stay_date_clarification');assert.equal(resolved.quote_request,'ROOM_LIST');
      assert.equal(resolved.conversation_text,t.r.answer);assert.equal(resolved.has_conversation_text,'SIM');
      assert.equal(JSON.parse(resolved.manychat_payload).texts.conversation_text,t.r.answer);state=JSON.parse(resolved.state);
      const offers=await request(resolver,{user_message:resolved.conversation_text,state:resolved.state},{operation:'offers'});
      assert.equal(offers.quote_request,'ROOM_DONE');
    }
  }
});
test('saída e ocupação novas avançam até tarifa correta, sem cotação da viagem anterior',async()=>{
  const start=await turn('Se eu quiser me hospedar hj, tem vaga?',old());
  assert.doesNotMatch(start.p.context,/Loft|Somos três|R\$999/);assert.deepEqual(start.state.facts.extras,[]);
  for(const exit of ['17/09','Saída 17/09/2026','Amanhã','Saio amanhã']){
    const dated=await turn(exit,start.state);assert.equal(dated.state.facts.check_out,'2026-09-17');assert.equal(dated.state.stay_date_pending,undefined);
    assert.match(dated.r.answer,/quantas pessoas/);assert.equal(dated.r.quote_request,'NOQUOTE');
    const group=await turn('Somos 2 adultos',dated.state);assert.equal(group.r.quote_request,'QUOTE|2026-09-16|2026-09-17|2|NONE');
    const priced=await request(prices,{quote_request:group.r.quote_request,state:group.r.state});
    const quote=JSON.parse(priced.quote_state);assert.equal(quote.guests,2);assert.equal(quote.options.find(o=>o.name==='Suíte Casal').total,410);
    assert.equal(priced.availability_checked,false);assert.equal(group.r.can_collect,'NAO');
  }
});
test('ocupação pode chegar antes da saída e não é apagada pelas respostas curtas',async()=>{
  const a=await turn('Tem quarto para hoje?',old()),b=await turn('Somos 2 adultos',a.state),c=await turn('Hoje',b.state),d=await turn('Amanhã',c.state);
  assert.equal(c.state.facts.guests,2);assert.equal(d.r.quote_request,'QUOTE|2026-09-16|2026-09-17|2|NONE');
});
test('migra o loop já existente e invalida confirmação antiga sem reativar coleta',async()=>{
  const initial={...old(),guest_inquiry:undefined,awaiting:'dates',stay_date_pending:{at:now-10000,reason:'relative_dates'},pending:{quote_id:'old-quote',option:'LOFT'}};
  const next=await turn('Hoje',initial);assert.equal(next.state.facts.check_in,'2026-09-16');assert.equal(next.state.facts.guests,undefined);
  assert.equal(next.state.pending,undefined);assert.equal(control({operation:'confirm',state:next.state,quote_state:unsafeQuote},now).can_collect,'NAO');
  const yes=await turn('Sim',next.state);assert.equal(yes.state.facts.check_out,undefined);assert.equal(yes.r.can_collect,'NAO');
});
test('família recente e candidata de saída permanecem; familiares expirados são reconfirmados',async()=>{
  const state={...fresh(),facts:{guests:3,extras:[],check_in:'2026-09-16',check_out:'2026-09-18'},family_party:{adults:2,children:1,total:3,ages_months:[60],updated_at:now-10000}};
  const t=await turn('Qual a diária para hj?',state);assert.equal(t.state.facts.guests,3);assert.deepEqual(t.state.family_party.ages_months,[60]);assert.match(t.r.answer,/Mantém a saída em 18\/09/);
  const stale=await turn('Qual a diária para hj?',{...state,family_party:{...state.family_party,updated_at:now-31*60000}});
  assert.equal(stale.state.facts.guests,undefined);assert.equal(stale.state.family_party,undefined);assert.doesNotMatch(stale.r.answer,/Mantém a saída/);
});
test('agendamento de café, humano, pagamento e reserva existente não viram entrada hoje',async()=>{
  const breakfast=await turn('Posso tomar café da manhã aí sem estar hospedado?',old());
  const date=await turn('Hoje',breakfast.state);assert.equal(date.state.facts.check_in,undefined);assert.equal(date.state.guest_inquiry.kind,'dining');
  for(const message of ['Quero falar com a recepção para me hospedar hoje','Já fiz o pagamento da minha reserva para hoje','Já tenho uma reserva para hoje, quero confirmar']){
    const t=await turn(message,old());assert.equal(t.r.quote_request,'HUMANO',message);assert.equal(t.r.can_collect,'NAO');
  }
  for(const message of ['O Reserva abre hoje?','Qual o valor do Day Use hoje?','Não quero hospedagem para hoje','Se eu quiser hospedagem para hoje?'])
    assert.equal(todayStayDatePending(message,undefined,now),undefined,message);
});
test('saída relativa exige a pergunta atual e expira; negativa, hipótese ou assunto alheio não confirmam datas',()=>{
  const pending={at:now,reason:'relative_checkout',check_in:'2026-09-16'};
  assert.equal(relativeCheckoutReply(pending,'amanhã',false,now),undefined);
  assert.equal(relativeCheckoutReply(pending,'amanhã',true,now+31*60000),undefined);
  for(const message of ['Não amanhã','Se eu sair amanhã?','O restaurante abre amanhã?','Sim','Hoje','Amanhã ou depois de amanhã'])assert.equal(relativeCheckoutReply(pending,message,true,now),undefined);
  assert.deepEqual(relativeCheckoutReply(pending,'Depois de amanhã',true,now),{check_in:'2026-09-16',check_out:'2026-09-18'});
});
test('virada de dia não mantém hoje do dia anterior; pergunta genérica não expõe aviso técnico',async()=>{
  const pending={at:Date.parse('2026-09-16T23:55:00-03:00'),reason:'relative_checkout',check_in:'2026-09-16'};
  assert.equal(relativeCheckoutReply(pending,'amanhã',true,pending.at+10*60000),undefined);
  const t=await turn('Quero hospedagem para amanhã');assert.doesNotMatch(t.r.answer,/outra conversa/);assert.match(t.r.answer,/datas de entrada e saída/);
});
