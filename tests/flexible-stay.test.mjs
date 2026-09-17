import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';
const now=Date.parse('2026-09-17T18:00:00-03:00'),realNow=Date.now,realFetch=globalThis.fetch;
Date.now=()=>now;globalThis.fetch=async()=>{throw Error('External network forbidden');};
after(()=>{Date.now=realNow;globalThis.fetch=realFetch;delete globalThis.flexibleFixtureFailure;});
const rooms=[{id:'quad',name:'Suíte Quádruplo',active:true,capacity:4,base_price:599,overrides:[{dateIso:'2026-09-22',price:100},{dateIso:'2026-09-23',price:110}]},
  {id:'loft',name:'LOFT',active:true,capacity:4,base_price:910,overrides:[]},
  {id:'casal',name:'Suíte Casal',active:true,capacity:2,base_price:410,overrides:[]}];
const fixture={packages:[],extras:[],room_types:rooms};
const bundle=await build({stdin:{contents:`export {control,handleConversation} from './api/conversation-control.ts';export {default as resolver} from './api/resolve-package.ts';export {default as prices} from './api/get-prices.ts';export * from './utils/flexibleStay.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},plugins:[{name:'read-only-fixture',setup(b){
    b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const data=${JSON.stringify(fixture)};export function createClient(){return {from(table){if(!(table in data))throw Error('Unexpected table '+table);const q={select(){return q},eq(){return q},then(r){return Promise.resolve(globalThis.flexibleFixtureFailure?{data:null,error:{message:'fixture'}}:{data:data[table],error:null}).then(r)}};return q}}}` }));
  }}]});
const {control,handleConversation,resolver,prices,readFlexibleStay,readFlexibleResults,updateFlexibleStay,compareFlexibleStays,flexibleStayAnswer,flexibleStaySelection}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const literal='Qual é a data desse mês que tem o valor da diária mais em conta? Serão duas diárias.';
const old=()=>({version:2,history:['4'],facts:{check_in:'2026-09-17',check_out:'2026-09-19',guests:4,extras:[]},greeted:true,party_confirmed_at:now,
  daily_greeting:{day:'2026-09-17',first:false},assistant_disclosure:{version:1,show:false,rendered:true},
  pending:{quote_id:'old',option:'LOFT'},turns:[{role:'assistant',text:'LOFT por R$2.360 para 17 a 19/09/2026.'}]});
const stuck=()=>({...old(),facts:{guests:4,extras:[]},stay_date_pending:{at:now,reason:'alternative_dates'},awaiting:'dates',duration_request:{at:now,count:2,unit:'nights'}});
const wrong='A diária mais barata é R$705 em 17 a 19/09/2026. Disponibilidade confirmada. Envie seu CPF.';
async function request(handler,body,query={transport:'manychat-v1'}){let status,result;await handler({method:'POST',body,query,headers:{}},{status(s){status=s;return this},json(v){result=v;return v},setHeader(){}});assert.equal(status,200);return result;}
async function turn(message,state=old(),audio=false){
  const raw=audio?'https://fixture.invalid/flexible.ogg':message;
  const p=await handleConversation({operation:'prepare',state,user_message:raw},'',async()=>message,now);
  const r=control({operation:'route',state:p.state,user_message:raw,proposed:'QUOTE|2026-09-17|2026-09-19|4|NONE',ai_response:wrong},now);
  assert.equal(r.can_collect,'NAO');
  const quoting=r.quote_request.startsWith('QUOTE|');
  const out=quoting?await request(prices,{quote_request:r.quote_request,state:r.state}):await request(resolver,{state:r.state,user_message:raw});
  assert.equal(out.availability_checked,false);
  assert.doesNotMatch(out.conversation_text,/Disponibilidade confirmada|Envie seu CPF|R\$705/);
  if(!quoting){assert.equal(out.has_conversation_text,'SIM');assert.equal(JSON.parse(out.manychat_payload).texts.conversation_text,out.conversation_text);}
  return {p,r,out,state:JSON.parse(out.state||r.state),raw};
}
test('reteste literal sai do loop e compara duas diárias no mês para quatro (texto/áudio e estado legado)',async()=>{
  for(const initial of [old(),stuck()])for(const audio of [false,true]){
    const t=await turn(literal,initial,audio),s=t.state.flexible_stay;
    assert.equal(s.month,'2026-09');assert.equal(s.nights,2);assert.equal(t.state.facts.guests,4);
    assert.equal(t.state.facts.check_in,undefined);assert.equal(t.state.facts.check_out,undefined);assert.equal(t.state.pending,undefined);
    assert.equal(t.state.stay_date_pending,undefined);assert.equal(t.r.quote_request,'NOQUOTE');assert.equal(t.out.quote_state,'');
    assert.equal(s.results.compared,12);assert.deepEqual(s.results.options.map(o=>[o.check_in,o.total]),[['2026-09-22',210],['2026-09-21',699],['2026-09-23',709]]);
    assert.match(t.out.conversation_text,/Comparei 12 períodos para 4 hóspedes e 2 diárias/);assert.match(t.out.conversation_text,/22\/09\/2026 a 24\/09\/2026/);
    assert.match(t.out.conversation_text,/210,00.*105,00/);assert.match(t.out.conversation_text,/sem confirmação de disponibilidade/);
    assert.doesNotMatch(t.out.conversation_text,/Quais datas de entrada e saída/);assert.ok(t.out.conversation_text.length<1900);
  }
});
test('pergunta só mês e duração que faltam; não exige datas exatas nem muda hóspedes',async()=>{
  let t=await turn('Tem outra data que essas diárias ficam mais baratas?');assert.match(t.out.conversation_text,/qual mês/i);
  t=await turn('Este mês',t.state);assert.match(t.out.conversation_text,/Quantas diárias/);assert.equal(t.state.facts.guests,4);
  t=await turn('2',t.state);assert.equal(t.state.facts.guests,4);assert.equal(t.state.flexible_stay.nights,2);assert.ok(t.state.flexible_stay.results.options.length);
  const first=await turn(literal,{version:2,history:[],facts:{extras:[]},greeted:true});assert.match(first.out.conversation_text,/quantas pessoas/i);assert.equal(first.state.facts.guests,undefined);
  const party=await turn('4',first.state);assert.equal(party.state.facts.guests,4);assert.equal(party.state.flexible_stay.nights,2);
});
test('sequência real de três pedidos chega à comparação sem repetir pergunta de datas',async()=>{
  let t=await turn('Sim, ficou muito alto para o meu orçamento. Tem outra data que essas diárias ficam mais baratas?');assert.match(t.out.conversation_text,/qual mês/i);
  t=await turn('Eu queria o valor com a data, eu gostaria de uma data que tenha o valor das diárias mais em conta.',t.state);assert.match(t.out.conversation_text,/qual mês/i);
  t=await turn(literal,t.state);assert.equal(t.state.flexible_stay.results.options[0].total,210);
});
test('escolha de opção só define período e recalcula; sim isolado e modelo não escolhem',async()=>{
  const t=await turn(literal);
  const yes=await turn('Sim',t.state);assert.equal(yes.r.quote_request,'NOQUOTE');assert.equal(yes.state.facts.check_in,undefined);
  const remembered=JSON.parse(control({operation:'remember_response',state:t.state,response_text:wrong,room_name:'LOFT'},now).state);
  assert.equal(remembered.facts.check_in,undefined);assert.doesNotMatch(remembered.turns.at(-1).text,/confirmada|CPF/);
  for(const choice of ['A primeira','primeira','Quero a primeira opção','opção 1','1']){
    const selected=await turn(choice,t.state);assert.equal(selected.r.quote_request,'QUOTE|2026-09-22|2026-09-24|4|NONE',choice);
    assert.equal(selected.state.flexible_stay,undefined);assert.equal(JSON.parse(selected.out.quote_state).options.find(o=>o.name==='Suíte Quádruplo').total,210);
  }
  const supplied=await turn('21/09 a 23/09',t.state);assert.equal(supplied.r.quote_request,'QUOTE|2026-09-21|2026-09-23|4|NONE');
});
test('idade desconhecida é esclarecida antes de comparar e cortesia respeita capacidade',async()=>{
  let t=await turn('Qual a data mais barata desse mês para duas diárias, 2 adultos e uma criança?');assert.match(t.out.conversation_text,/idades/);
  assert.equal(t.state.flexible_stay.results,undefined);
  t=await turn('5 anos',t.state);assert.equal(t.state.facts.guests,3);assert.deepEqual(t.state.family_party.ages_months,[60]);assert.ok(t.state.flexible_stay.results.options.length);
  const search={at:now,month:'2026-09',nights:2};
  const adult={...old(),facts:{guests:3,extras:[]}};
  assert.equal(compareFlexibleStays(search,adult,[rooms[2]],[],now).options.length,0);
  const child={...adult,family_party:{adults:2,children:1,total:3,ages_months:[60],updated_at:now}};
  assert.equal(compareFlexibleStays(search,child,[rooms[2]],[],now).options[0].room,'Suíte Casal');
});
test('comparação aplica tarifa por noite, override, bloqueios e pacote obrigatório',()=>{
  const search={at:now,month:'2026-09',nights:2};
  const normal=compareFlexibleStays(search,old(),[rooms[0]],[],now);assert.equal(normal.options[0].total,210);
  const restricted=[{...rooms[0],overrides:[{dateIso:'2026-09-22',price:100,isClosed:true},{dateIso:'2026-09-23',price:110,noCheckIn:true},{dateIso:'2026-09-24',noCheckOut:true}]}];
  const result=compareFlexibleStays(search,old(),restricted,[],now);assert.ok(result.options.every(o=>o.check_in!=='2026-09-23'&&o.check_out!=='2026-09-24'&&!(o.check_in<='2026-09-22'&&o.check_out>'2026-09-22')));
  const pkg={id:'holiday',active:true,name:'Feriado',start_iso_date:'2026-09-21',end_iso_date:'2026-09-24',full_period_required:true};
  assert.ok(compareFlexibleStays(search,old(),rooms,[pkg],now).options.every(o=>o.check_in>='2026-09-24'||o.check_out<='2026-09-21'));
  const exact={...pkg,end_iso_date:'2026-09-23',room_prices:[{roomId:'quad',price:100}],full_period_discount_pct:10};
  assert.equal(compareFlexibleStays(search,old(),rooms,[exact],now).options[0].total,90);
  const blocked={...exact,no_checkin_dates:['2026-09-21']};assert.ok(compareFlexibleStays(search,old(),rooms,[blocked],now).options.every(o=>o.check_in!=='2026-09-21'));
});
test('filtros de meio de semana e categoria não prometem qualquer quarto pelo menor valor',async()=>{
  const t=await turn('Qual a data mais barata desse mês para duas diárias no Loft, no meio de semana?');
  assert.equal(t.state.flexible_stay.room,'loft');assert.equal(t.state.flexible_stay.weekdays_only,true);
  for(const o of t.state.flexible_stay.results.options){assert.equal(o.room,'LOFT');for(let n=0;n<2;n++){const d=new Date(o.check_in+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);assert.ok(d.getUTCDay()>=1&&d.getUTCDay()<=4);}}
  assert.match(t.out.conversation_text,/noites de segunda a quinta/);
});
test('janela usa Belém, não consulta passado nem atravessa mês silenciosamente',()=>{
  const at=Date.parse('2026-09-30T23:30:00-03:00');
  const s=updateFlexibleStay(literal,undefined,undefined,true,false,at);assert.equal(s.month,'2026-09');
  assert.equal(compareFlexibleStays(s,old(),rooms,[],at).options.length,0);
  const next=updateFlexibleStay('Próximo mês',s,undefined,true,false,at);assert.equal(next.month,'2026-10');
  const december=Date.parse('2026-12-31T14:00:00-03:00');assert.equal(updateFlexibleStay('Próximo mês',s,undefined,true,false,december).month,'2027-01');
  for(const text of ['Qual a data mais barata de julho para duas diárias?','Qual a data mais barata de setembro de 2025 para duas diárias?',
    'Qual a data mais barata de setembro ou outubro para duas diárias?'])assert.equal(updateFlexibleStay(text,undefined,undefined,true,false,now).issue,'window',text);
  const uncertain=updateFlexibleStay('Qual a data mais barata deste mês para 2 dias?',undefined,undefined,true,false,now);assert.equal(uncertain.nights,undefined);assert.equal(uncertain.issue,'duration');
});
test('resultados expiram e alterações de mês, duração ou composição invalidam seleção antiga',async()=>{
  const t=await turn(literal),s=t.state.flexible_stay;
  assert.equal(readFlexibleStay(s,now+31*60000),undefined);assert.equal(readFlexibleResults(s.results,s,t.state,now+31*60000),undefined);
  assert.equal(flexibleStaySelection('primeira',s,{...t.state,facts:{guests:2,extras:[]}},now),undefined);
  assert.equal(flexibleStaySelection('sim',s,t.state,now),undefined);
  assert.equal(flexibleStaySelection('primeira',{...s,results:{...s.results,options:[{...s.results.options[0],check_in:'2026-09-01'}]}},t.state,now),undefined);
  const october=await turn('Outubro',t.state);assert.equal(october.state.flexible_stay.month,'2026-10');assert.ok(october.state.flexible_stay.results.options.every(o=>o.check_in.startsWith('2026-10')));
  const stale=await request(prices,{state:{...old(),flexible_stay:{...s,at:now-31*60000}},quote_request:'QUOTE|2026-09-17|2026-09-19|4|NONE'});assert.equal(stale.quote_request,'NOQUOTE');
});
test('falha do catálogo não vira resultado vazio nem reutiliza resposta antiga; permite tentar de novo',async()=>{
  globalThis.flexibleFixtureFailure=true;
  try{const t=await turn(literal);assert.equal(t.out.match_type,'flexible_stay_unavailable');assert.match(t.out.conversation_text,/Não consegui comparar/);assert.equal(t.state.flexible_stay.results,undefined);}
  finally{globalThis.flexibleFixtureFailure=false;}
  const t=await turn(literal);globalThis.flexibleFixtureFailure=true;
  let failed;try{failed=await turn('Tente novamente',t.state);assert.equal(failed.state.flexible_stay.results,undefined);}finally{globalThis.flexibleFixtureFailure=false;}
  const recovered=await turn('Tente novamente',failed.state);assert.ok(recovered.state.flexible_stay.results.options.length);
});
test('serviços, FAQ, negativas e humano não são busca mensal; ofertas permanecem silenciosas',async()=>{
  for(const message of ['Tem quarto mais barato nessas mesmas datas?','Não quero outra data mais barata','Se eu quiser uma data mais barata?',
    'A diária geralmente é mais barata no meio de semana?','Qual a data mais barata do passeio?','Qual a data mais barata do café?'])assert.equal(updateFlexibleStay(message,undefined,undefined,true,false,now),undefined,message);
  const t=await turn(literal);
  const offers=await request(resolver,{user_message:t.out.conversation_text,state:t.out.state},{operation:'offers',transport:'manychat-v1'});assert.equal(offers.quote_request,'ROOM_DONE');assert.equal(offers.has_conversation_text,'NAO');
  for(const message of ['Quero falar com a recepção','Já tenho uma reserva e quero mudar a data','Já paguei minha reserva']){
    const human=await turn(message,t.state);assert.equal(human.out.quote_request,'HUMANO');assert.equal(human.state.flexible_stay,undefined);
  }
});
test('duração ambígua e restrição mais estreita são esclarecidas; correção curta destrava',async()=>{
  let t=await turn('Qual a data mais barata deste mês para duas ou três diárias?');assert.equal(t.state.flexible_stay.nights,undefined);assert.match(t.out.conversation_text,/Quantas diárias/);
  t=await turn('2',t.state);assert.equal(t.state.flexible_stay.nights,2);assert.equal(t.state.facts.guests,4);assert.ok(t.state.flexible_stay.results.options.length);
  t=await turn('Qual a data mais barata na próxima semana para duas diárias?',old());assert.equal(t.state.flexible_stay.issue,'constraints');assert.equal(t.state.flexible_stay.results,undefined);
  t=await turn('Neste mês',t.state);assert.ok(t.state.flexible_stay.results.options.length);
});
test('estado recém-criado aceita quatro hóspedes e não transforma extras em preço de hospedagem',async()=>{
  const fresh={version:2,history:[],facts:{extras:[]},greeted:true};
  const t=await turn('Qual a data mais barata desse mês para duas diárias e quatro pessoas?',fresh);assert.equal(t.state.facts.guests,4);assert.ok(t.state.flexible_stay.results.options.length);
  const extra=await turn(literal,{...old(),facts:{...old().facts,extras:['LUA']}});assert.deepEqual(extra.state.facts.extras,['LUA']);assert.match(extra.out.conversation_text,/somente de hospedagem; extras à parte/);
  const selected=await turn('primeira',extra.state);assert.equal(selected.r.quote_request,'QUOTE|2026-09-22|2026-09-24|4|LUA');
  assert.equal(JSON.parse(selected.out.quote_state).options.find(o=>o.name==='Suíte Quádruplo').total,560);
});
