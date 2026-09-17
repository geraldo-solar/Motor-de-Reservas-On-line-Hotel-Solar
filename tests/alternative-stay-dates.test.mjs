import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';
const now=Date.parse('2026-09-17T18:00:00-03:00'),realNow=Date.now,realFetch=globalThis.fetch;
Date.now=()=>now;globalThis.fetch=async()=>{throw Error('External network forbidden');};
after(()=>{Date.now=realNow;globalThis.fetch=realFetch;});
const fixture={packages:[],extras:[],room_types:[
  {id:'quad',name:'Suíte Quádruplo',active:true,capacity:4,base_price:599,overrides:[{dateIso:'2026-09-22',price:580}]},
  {id:'varanda',name:'Suíte Varanda Térreo',active:true,capacity:4,base_price:650,overrides:[]},
  {id:'loft',name:'LOFT',active:true,capacity:4,base_price:910,overrides:[]}]};
const bundle=await build({stdin:{contents:`export {control,handleConversation} from './api/conversation-control.ts';export {default as resolver} from './api/resolve-package.ts';export {default as prices} from './api/get-prices.ts';export {alternativeStayDates} from './utils/alternativeStayDates.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},plugins:[{name:'read-only-fixture',setup(b){
    b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const data=${JSON.stringify(fixture)};export function createClient(){return {from(table){if(!(table in data))throw Error('Unexpected table '+table);const q={select(){return q},eq(){return q},then(r){return Promise.resolve({data:data[table],error:null}).then(r)}};return q}}}` }));
  }}]});
const {control,handleConversation,resolver,prices,alternativeStayDates}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const other='E outra data, existe uma outra data que sai mais em conta?';
const weekday='Então, veja para meio de semana quanto fica para quatro pessoas no meio de semana, a diária.';
const wrong='Para quatro pessoas em meio de semana, de 17 a 19/09/2026, as diárias ficam assim: Loft por R$1.180, Suíte Varanda Térreo por R$785 e Suíte Quádruplo por R$705, valores por diária.';
const oldQuote={version:1,id:'old',created_at:now,check_in:'2026-09-17',check_out:'2026-09-19',guests:4,extras:[],options:[{name:'LOFT',capacity:4,total:2360},{name:'Suíte Varanda Térreo',capacity:4,total:1570},{name:'Suíte Quádruplo',capacity:4,total:1409}]};
const old=()=>({version:2,history:['17/09 a 19/09','4'],facts:{check_in:'2026-09-17',check_out:'2026-09-19',guests:4,extras:[]},greeted:true,party_confirmed_at:now,
  daily_greeting:{day:'2026-09-17',first:false},assistant_disclosure:{version:1,show:false,rendered:true},
  pending:{quote_id:'old',option:'LOFT'},subject:'LOFT',topic:'room_info',topic_at:now,
  turns:[{role:'user',text:'4'},{role:'assistant',text:'LOFT R$2.360, Suíte Varanda Térreo R$1.570 e Suíte Quádruplo R$1.409 para 17 a 19/09/2026.'}]});
async function request(handler,body,query={transport:'manychat-v1'}){let status,result;await handler({method:'POST',body,query,headers:{}},{status(s){status=s;return this},json(v){result=v;return v},setHeader(){}});assert.equal(status,200);return result;}
async function turn(message,state=old(),audio=false){
  const raw=audio?'https://fixture.invalid/new-period.ogg':message;
  const p=await handleConversation({operation:'prepare',state,user_message:raw,quote_state:oldQuote},'',async()=>message,now);
  const r=control({operation:'route',state:p.state,user_message:raw,quote_state:oldQuote,proposed:'QUOTE|2026-09-17|2026-09-19|4|NONE',ai_response:wrong},now);
  assert.equal(r.can_collect,'NAO');
  const quoting=r.quote_request.startsWith('QUOTE|');
  const out=quoting?await request(prices,{quote_request:r.quote_request,state:r.state}):await request(resolver,{state:r.state,user_message:raw});
  assert.equal(out.availability_checked,false);
  if(!quoting){assert.equal(out.has_conversation_text,'SIM');assert.equal(JSON.parse(out.manychat_payload).texts.conversation_text,out.conversation_text);}
  return {p,r,out,state:JSON.parse(out.state||r.state),raw};
}
function awaiting(t){
  assert.equal(t.r.quote_request,'NOQUOTE',t.r.answer);assert.equal(t.state.facts.check_in,undefined);assert.equal(t.state.facts.check_out,undefined);
  assert.equal(t.state.facts.guests,4);assert.equal(t.state.stay_date_pending.reason,'alternative_dates');
  assert.equal(t.state.pending,undefined);assert.match(t.out.conversation_text,/datas de entrada e saída/);
  assert.doesNotMatch(t.out.conversation_text,/R\$|17\/09|19\/09|confirmad[ao]/);
}
test('reteste real: alternativa de data e diária de meio de semana não usam média anterior (texto e áudio)',async()=>{
  for(const audio of [false,true]){
    const t=await turn(other,old(),audio);awaiting(t);
    assert.doesNotMatch(t.p.context,/R\$2\.360|2026-09-19/);assert.equal(JSON.parse(t.p.context).cotacao_valida_para_estes_dados,null);
    const w=await turn(weekday,t.state,audio);awaiting(w);assert.equal(w.state.subject,undefined);
    const dates=await turn('21/09 a 23/09',w.state,audio);
    assert.equal(dates.r.quote_request,'QUOTE|2026-09-21|2026-09-23|4|NONE');
    const q=JSON.parse(dates.out.quote_state);assert.equal(q.guests,4);
    assert.equal(q.options.find(o=>o.name==='Suíte Quádruplo').total,1179); // 599 + override 580, not 705*2.
    assert.equal(q.options.find(o=>o.name==='LOFT').total,1820);assert.equal(q.options.find(o=>o.name==='Suíte Varanda Térreo').total,1300);
    assert.equal(dates.out.requires_human_confirmation,true);
  }
});
test('pedido direto e variações de nova data suspendem datas antigas',async()=>{
  for(const message of [weekday,'Tem outra data mais barata?','Você não tem outra data mais em conta?','Outra data?',
    'Quero outras datas','Prefiro outro período','Veja quanto fica durante a semana','Quanto fica a diária em dias úteis?',
    'Meio de semana'])awaiting(await turn(message));
  const fresh={version:2,history:[],facts:{extras:[]},greeted:true};
  const t=await turn(weekday,fresh);awaiting(t);
});
test('nova dupla de datas é usada de imediato e datas parciais não resgatam saída antiga',async()=>{
  const explicit=await turn('Quero outra data: 21/09 a 23/09');assert.equal(explicit.r.quote_request,'QUOTE|2026-09-21|2026-09-23|4|NONE');
  const t=await turn(other);const entry=await turn('Entrada 21/09',t.state);
  assert.equal(entry.state.facts.check_in,'2026-09-21');assert.equal(entry.state.facts.check_out,undefined);assert.equal(entry.r.quote_request,'NOQUOTE');
  const exit=await turn('Saída 23/09',entry.state);assert.equal(exit.r.quote_request,'QUOTE|2026-09-21|2026-09-23|4|NONE');
});
test('sim, categoria antiga, indecisão e confirmação não ressuscitam cotação',async()=>{
  const t=await turn(other);awaiting(t);
  for(const message of ['Sim','Quero o Loft','Ainda vou decidir','Pode prosseguir'])awaiting(await turn(message,t.state));
  const confirmation=control({operation:'confirm',state:t.state,quote_state:oldQuote},now);assert.equal(confirmation.can_collect,'NAO');
});
test('fronteira final rejeita resposta antiga injetada e remember_response não aceita catálogo',async()=>{
  const t=await turn(weekday);awaiting(t);
  const injected={...t.state,turns:[{role:'user',text:weekday},{role:'assistant',text:wrong}]};
  const out=await request(resolver,{user_message:weekday,state:injected});assert.match(out.conversation_text,/datas de entrada e saída/);assert.doesNotMatch(out.conversation_text,/R\$/);
  const saved=JSON.parse(control({operation:'remember_response',state:t.state,response_text:wrong,room_name:'LOFT',package_context:{id:'bad',name:'Bad',start_date:'2026-09-17',end_date:'2026-09-19'}},now).state);
  assert.equal(saved.subject,undefined);assert.equal(saved.package_context,undefined);assert.doesNotMatch(saved.turns.at(-1).text,/R\$/);
  const offers=await request(resolver,{user_message:out.conversation_text,state:out.state},{operation:'offers',transport:'manychat-v1'});
  assert.equal(offers.quote_request,'ROOM_DONE');assert.equal(offers.has_conversation_text,'NAO');
});
test('endpoint de preços bloqueia pendência com datas antigas forjadas, inclusive expirada',async()=>{
  for(const at of [now,now-31*60000]){
    const stale={...old(),stay_date_pending:{at,reason:'alternative_dates'}};
    const out=await request(prices,{state:stale,quote_request:'QUOTE|2026-09-17|2026-09-19|4|NONE'});
    assert.equal(out.quote_request,'NOQUOTE');assert.equal(out.quote_state,'');assert.doesNotMatch(out.conversation_text,/R\$/);
    const loaded=JSON.parse(control({operation:'remember_response',state:stale},now).state);
    assert.equal(loaded.facts.check_in,undefined);assert.equal(loaded.facts.check_out,undefined);
  }
});
test('família, idades e extras explícitos são preservados; ocupação só muda por declaração atual',async()=>{
  const family={...old(),facts:{...old().facts,extras:['LUA']},family_party:{adults:2,children:2,total:4,ages_months:[60,120],updated_at:now}};
  const t=await turn(other,family);awaiting(t);assert.deepEqual(t.state.family_party.ages_months,[60,120]);assert.deepEqual(t.state.facts.extras,['LUA']);
  const changed=await turn('Agora somos 3 adultos, veja outra data mais barata',old());assert.equal(changed.state.facts.guests,3);assert.equal(changed.r.quote_request,'NOQUOTE');
});
test('outra categoria nas mesmas datas não é mudança de período; FAQ/serviços/negações não disparam',()=>{
  for(const message of ['Tem quarto mais barato nessas mesmas datas?','Essa diária muda no meio de semana?',
    'Não quero outra data','Não quero mudar para meio de semana','Se eu quiser outra data, quanto fica?',
    'Quero café no meio de semana','Tem outra data para massagem?','Quero outra data para o restaurante Reserva Solar',
    'Fotos do quarto no meio de semana','O Réveillon pode ser no meio de semana?','O pacote tem outra data?',
    'Quero diária no meio de semana sem mudar as mesmas datas']){
    assert.equal(alternativeStayDates(message,true),false,message);
  }
  for(const message of ['Tem quarto mais barato nessas mesmas datas?','É, ficou muito alto para o meu orçamento. Você não tem uma outra opção? Tem alguma forma de sair mais barato essa hospedagem?']){
    const p=control({operation:'prepare',state:old(),quote_state:oldQuote,user_message:message},now),state=JSON.parse(p.state);
    assert.equal(state.facts.check_in,'2026-09-17',message);assert.equal(state.facts.check_out,'2026-09-19',message);assert.equal(state.stay_date_pending,undefined);
    assert.equal(JSON.parse(p.context).cotacao_valida_para_estes_dados.id,'old');
  }
});
test('pedidos operacionais e humano conservam prioridade e não viram cotação',async()=>{
  for(const message of ['Quero falar com a recepção para ver outra data mais barata',
    'Já paguei minha reserva, quero outra data','Já tenho uma reserva, quero alterar para meio de semana']){
    const t=await turn(message);assert.equal(t.r.quote_request,'HUMANO');assert.equal(t.out.quote_request,'HUMANO');assert.equal(t.state.stay_date_pending,undefined);
  }
});
