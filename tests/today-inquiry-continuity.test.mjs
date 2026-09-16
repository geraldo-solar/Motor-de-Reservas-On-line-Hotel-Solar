import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';
const now=Date.parse('2026-09-16T08:39:00-03:00'),realNow=Date.now,realFetch=globalThis.fetch;
Date.now=()=>now;globalThis.fetch=async()=>{throw Error('External network forbidden');};
after(()=>{Date.now=realNow;globalThis.fetch=realFetch;});
const fixture={packages:[],extras:[],room_types:[{id:'couple',name:'Suíte Casal',active:true,capacity:2,base_price:410,overrides:[]}]};
const bundle=await build({stdin:{contents:`export {control,handleConversation} from './api/conversation-control.ts';export {default as resolver} from './api/resolve-package.ts';export {default as prices} from './api/get-prices.ts';export {todayStayDatePending,relativeCheckoutReply,weekdayCheckoutPending,readStayDatePending,stayDateClarification} from './utils/stayDuration.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},plugins:[{name:'read-only-fixture',setup(b){
    b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const data=${JSON.stringify(fixture)};export function createClient(){return {from(table){if(!(table in data))throw Error('Unexpected table');const q={select(){return q},eq(){return q},then(r){return Promise.resolve({data:data[table],error:null}).then(r)}};return q}}}` }));
  }}]});
const {control,handleConversation,resolver,prices,todayStayDatePending,relativeCheckoutReply,weekdayCheckoutPending,readStayDatePending,stayDateClarification}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
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

test('teste real: Hoje → Na sexta → Sexta-feira → Sim → hóspedes avança até cotação, em texto e áudio',async()=>{
  for(const audio of [false,true]){
    const initial={...old(),guest_inquiry:undefined,awaiting:'dates',stay_date_pending:{at:now-10000,reason:'relative_dates'}};
    let t=await turn('Hoje',initial,audio);
    for(const message of ['Na sexta','Sexta-feira']){
      t=await turn(message,t.state,audio);
      assert.equal(t.state.facts.check_in,'2026-09-16');assert.equal(t.state.facts.check_out,undefined);
      assert.equal(t.state.facts.guests,undefined);assert.equal(t.state.stay_date_pending.suggested_check_out,'2026-09-18');
      assert.equal(t.state.stay_date_pending.checkout_weekday,5);assert.equal(t.r.can_collect,'NAO');
      assert.match(t.r.answer,/sexta-feira, 18\/09\/2026\?/);assert.doesNotMatch(t.r.answer,/Qual será a data de saída|Loft|CPF|confirmada/);
      const out=await request(resolver,{user_message:t.raw,state:t.r.state});
      assert.equal(out.conversation_text,t.r.answer);assert.equal(out.has_conversation_text,'SIM');
      assert.equal(JSON.parse(out.manychat_payload).texts.conversation_text,t.r.answer);
      t.state=JSON.parse(out.state);
      const offers=await request(resolver,{user_message:out.conversation_text,state:out.state},{operation:'offers'});
      assert.equal(offers.quote_request,'ROOM_DONE');
    }
    t=await turn('Sim',t.state,audio);assert.equal(t.state.facts.check_out,'2026-09-18');assert.equal(t.state.stay_date_pending,undefined);
    assert.match(t.r.answer,/quantas pessoas/);assert.equal(t.r.can_collect,'NAO');
    t=await turn('Somos 2 adultos',t.state,audio);assert.equal(t.r.quote_request,'QUOTE|2026-09-16|2026-09-18|2|NONE');
    const priced=await request(prices,{quote_request:t.r.quote_request,state:t.r.state});
    const quote=JSON.parse(priced.quote_state);assert.equal(quote.guests,2);assert.equal(quote.options.find(o=>o.name==='Suíte Casal').total,820);
    assert.equal(priced.availability_checked,false);assert.equal(priced.requires_human_confirmation,true);
  }
});
test('variantes de saída por dia da semana pedem confirmação antes de atribuir check-out',async()=>{
  const start=await turn('Tem quarto para hoje?');
  for(const message of ['Na sexta','Sexta-feira','Sexta feira','Saio na sexta','Até sexta','A saída será na sexta-feira','Nesta sexta','Na próxima sexta','Sexta que vem']){
    const t=await turn(message,start.state);assert.equal(t.state.stay_date_pending?.suggested_check_out,'2026-09-18',message);
    assert.equal(t.state.facts.check_out,undefined,message);assert.equal(t.r.quote_request,'NOQUOTE');
    assert.match(t.r.answer,/sexta-feira, 18\/09\/2026/);
  }
});
test('confirmação de datas exige a pergunta exata exibida, não libera coleta nem reserva',async()=>{
  const start=await turn('Tem quarto para hoje?'),candidate=await turn('Sexta-feira',start.state);
  for(const answer of ['Sim','Sim, por favor','Isso mesmo','Pode manter']){
    const t=await turn(answer,candidate.state);assert.equal(t.state.facts.check_out,'2026-09-18',answer);
    assert.equal(t.r.can_collect,'NAO');assert.equal(t.state.pending,undefined);assert.match(t.r.answer,/quantas pessoas/);
  }
  const unshown=control({operation:'prepare',user_message:'Sexta-feira',state:start.state},now);
  assert.equal((await turn('Sim',JSON.parse(unshown.state))).state.facts.check_out,undefined);
  const changed={...candidate.state,stay_date_pending:{...candidate.state.stay_date_pending,suggested_check_out:'2026-09-25'}};
  assert.equal((await turn('Sim',changed)).state.facts.check_out,undefined);
  assert.equal(control({operation:'confirm',state:candidate.state,quote_state:unsafeQuote},now).can_collect,'NAO');
});
test('recusa, outra sexta, outra semana e data explícita substituem a candidata sem reutilização silenciosa',async()=>{
  const start=await turn('Tem quarto para hoje?'),candidate=await turn('Na sexta',start.state);
  const no=await turn('Não',candidate.state);assert.equal(no.state.facts.check_in,'2026-09-16');
  assert.equal(no.state.stay_date_pending.suggested_check_out,undefined);assert.equal(no.state.stay_date_pending.checkout_weekday,undefined);
  assert.equal((await turn('Sim',no.state)).state.facts.check_out,undefined);
  for(const message of ['Na outra sexta','Sexta da semana que vem','Sexta-feira da próxima semana']){
    const t=await turn(message,candidate.state);assert.equal(t.state.stay_date_pending?.suggested_check_out,'2026-09-25',message);
    assert.equal(t.state.facts.check_out,undefined);assert.match(t.r.answer,/sexta-feira, 25\/09\/2026/);
    assert.equal((await turn('Sim',t.state)).state.facts.check_out,'2026-09-25');
  }
  const date=await turn('Saída 19/09',candidate.state);assert.equal(date.state.facts.check_out,'2026-09-19');assert.equal(date.state.stay_date_pending,undefined);
  const saturday=await turn('No sábado',candidate.state);assert.match(saturday.r.answer,/sábado, 19\/09\/2026/);
  assert.equal((await turn('No próximo sábado',candidate.state)).state.stay_date_pending.suggested_check_out,'2026-09-19');
  assert.equal((await turn('No outro sábado',saturday.state)).state.stay_date_pending.suggested_check_out,'2026-09-26');
});
test('calendário de Belém: sete dias, mesmo dia da semana e viradas de mês/ano continuam como candidatas',()=>{
  for(const [message,exit] of [['domingo','2026-09-20'],['segunda-feira','2026-09-21'],['terça','2026-09-22'],['quarta','2026-09-23'],['quinta','2026-09-17'],['sexta','2026-09-18'],['sábado','2026-09-19']]){
    const t=weekdayCheckoutPending({at:now,reason:'relative_checkout',check_in:'2026-09-16'},message,true,now);
    assert.equal(t.suggested_check_out,exit);assert.equal(t.check_out,undefined);assert.match(stayDateClarification(t),/responda sim/);
  }
  for(const [clock,entry,message,exit] of [
    ['2026-09-17T01:30:00Z','2026-09-16','quinta','2026-09-17'],
    ['2026-09-30T12:00:00-03:00','2026-09-30','sexta','2026-10-02'],
    ['2026-12-31T12:00:00-03:00','2026-12-31','sexta','2027-01-01'],
    ['2026-09-20T12:00:00-03:00','2026-09-20','segunda da semana que vem','2026-09-21']]){
    const at=Date.parse(clock);assert.equal(weekdayCheckoutPending({at,reason:'relative_checkout',check_in:entry},message,true,at).suggested_check_out,exit);
  }
});
test('dia da semana isolado exige contexto fresco; negativas, hipóteses, refeições e horário não viram saída',async()=>{
  const pending={at:now,reason:'relative_checkout',check_in:'2026-09-16'};
  for(const message of ['Não saio sexta','Se eu sair na sexta?','O restaurante abre sexta?','Sexta ou sábado','Sexta às 18h','Sim','Sexta passada'])
    assert.equal(weekdayCheckoutPending(pending,message,true,now),undefined,message);
  for(const shown of [false,'true',undefined])assert.equal(weekdayCheckoutPending(pending,'sexta',shown,now),undefined);
  assert.equal(weekdayCheckoutPending(pending,'sexta',true,now+31*60000),undefined);
  const midnight=Date.parse('2026-09-16T23:55:00-03:00');
  assert.equal(weekdayCheckoutPending({...pending,at:midnight},'sexta',true,midnight+10*60000),undefined);
  for(const checkout_weekday of [-1,7,'5',4,NaN])assert.equal(readStayDatePending({...pending,suggested_check_out:'2026-09-18',checkout_weekday},now),undefined);
  assert.equal((await turn('Sexta-feira')).state.facts.check_out,undefined);
  const cafe=await turn('Café da manhã para visitantes'),friday=await turn('Na sexta',cafe.state);
  assert.equal(friday.state.guest_inquiry.kind,'dining');assert.equal(friday.state.facts.check_out,undefined);
});
test('confirmação de saída preserva família atual e não substitui pedidos de humano ou suporte',async()=>{
  const start=await turn('Tem quarto para hoje?'),family=await turn('Somos 2 adultos e uma criança de 5 anos',start.state);
  const candidate=await turn('Na sexta',family.state),yes=await turn('Sim',candidate.state);
  assert.equal(yes.state.facts.guests,3);assert.deepEqual(yes.state.family_party.ages_months,[60]);
  assert.equal(yes.r.quote_request,'QUOTE|2026-09-16|2026-09-18|3|NONE');assert.equal(yes.r.can_collect,'NAO');
  for(const message of ['Quero falar com a recepção','Já fiz o pagamento da minha reserva','Já tenho uma reserva, quero confirmar']){
    const t=await turn(message,candidate.state);assert.equal(t.r.quote_request,'HUMANO',message);assert.equal(t.r.can_collect,'NAO');
  }
});
