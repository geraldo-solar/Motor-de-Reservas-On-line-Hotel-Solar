import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';
const now=Date.parse('2026-09-15T18:00:00Z'),realNow=Date.now;Date.now=()=>now;after(()=>Date.now=realNow);
const rooms=[['casal','Suíte Casal',2,410,610,1866.67],['triplo','Suíte Triplo',3,490,710,2133.33],['loft','LOFT',4,910,1450,3166.67],
  ['sacada','Suíte Sacada Vista Mar',3,599,810,2366.67],['quadruplo','Suíte Quádruplo',4,599,810,2466.67],['varanda','Suíte Varanda Térreo',4,650,920,2566.67]]
  .map(([id,name,capacity,base_price,extra,night])=>({id,name,capacity,base_price,active:true,overrides:[
    {dateIso:'2026-12-30',price:extra},{dateIso:'2026-12-31',price:night},
    {dateIso:'2027-01-01',price:night,noCheckIn:true,noCheckOut:true},
    {dateIso:'2027-01-02',price:night,noCheckIn:true,noCheckOut:true},
    {dateIso:'2027-01-03',price:extra}]}));
const pkg={id:'reveillon',name:'Réveillon Solar 2027',active:true,start_iso_date:'2026-12-31',end_iso_date:'2027-01-03',full_period_discount_pct:0,room_prices:[],includes:['Café da manhã'],no_checkin_dates:[],no_checkout_dates:[]};
const fixture={room_types:rooms,packages:[pkg,{...pkg,id:'old',name:'Independência Solar',start_iso_date:'2026-09-04',end_iso_date:'2026-09-07'},
  {...pkg,id:'outubro',name:'Dia das Crianças',start_iso_date:'2026-10-09',end_iso_date:'2026-10-12'}],extras:[]};
const b=await build({stdin:{contents:`export {control,handleConversation} from './api/conversation-control.ts';export {default as prices} from './api/get-prices.ts';export {default as resolver} from './api/resolve-package.ts';export * from './utils/packageStayQuery.ts';export * from './utils/motorStayPricing.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'public-catalogue-fixture',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const data=${JSON.stringify(fixture)};export function createClient(){return {from(table){if(!(table in data))throw Error('Forbidden table '+table);return {select(){return {eq(){return Promise.resolve({data:data[table],error:null})}}}}}}}`}));}}]});
const {control,handleConversation,prices,resolver,packageStayDates,readPackageStayQuery,motorStayPrice,motorStayRestriction,requiresFullPackagePeriod}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const focus={id:pkg.id,name:pkg.name,start_date:pkg.start_iso_date,end_date:pkg.end_iso_date,updated_at:now};
const initial=()=>({version:2,history:[],facts:{extras:[]},greeted:true,topic:'package_info',topic_at:now,package_context:focus});
async function request(handler,body,query={}){let output;await handler({method:'POST',body,query},{status(code){assert.equal(code,200);return this;},json(v){output=v;return v;}});return output;}
async function turn(message,state=initial(),spoken){
  const input=spoken?'https://media.example.com/synthetic-package-date.ogg':message;
  const p=spoken?await handleConversation({operation:'prepare',user_message:input,state},'Bearer fixture',async()=>spoken,now):control({operation:'prepare',user_message:message,state},now);
  const r=control({operation:'route',user_message:input,state:p.state,proposed:'COLETAR',ai_response:'Pode sim. Reserva confirmada. Early check-in R$250.'},now);
  const result=r.quote_request.startsWith('QUOTE|')?await request(prices,{quote_request:r.quote_request,state:r.state}):await request(resolver,{user_message:input,state:r.state});
  return {r,result,state:JSON.parse(result.state||r.state),text:result.conversation_text};
}
test('datas por extenso herdam mês e ano somente do pacote recente',()=>{
  for(const message of ['Se eu quiser chegar dia trinta e sair dia dois, é possível?','Quero chegar 30 e sair 2','Quero hospedagem de 30/12 a 02/01','Entrada 30 dezembro e saída 2 janeiro']){
    const d=packageStayDates(message,focus,now);assert.equal(d?.check_in,'2026-12-30',message);assert.equal(d?.check_out,'2027-01-02',message);
  }
  for(const message of ['Não quero chegar 30 e sair 2','Crianças de 3 a 5 anos','Quero hospedagem de 31/02 a 03/03','No Natal de 24/12 a 27/12','Quero chegar dia 30 pela manhã e sair dia 4'])assert.equal(packageStayDates(message,focus,now),undefined,message);
  assert.equal(packageStayDates('Chegar dia trinta e sair dia dois?',undefined,now),undefined);
  assert.equal(packageStayDates('Chegar dia trinta e sair dia dois?',focus,now+31*60000),undefined);
});
test('teste literal: consulta por áudio explica checkout bloqueado e preço seguinte mantém datas',async()=>{
  const first=await turn('',initial(),'Se eu quiser chegar dia trinta e sair dia dois, é possível?');
  assert.equal(first.r.quote_request,'NOQUOTE');assert.match(first.text,/saída em 02\/01\/2027 está bloqueada/);
  assert.doesNotMatch(first.text,/R\$250|é possível, sim|Reserva confirmada/);
  assert.deepEqual(first.state.facts,{extras:[]});assert.equal(first.state.package_stay_query.check_in,'2026-12-30');
  const second=await turn('',first.state,'E quanto fica no apartamento para três pessoas?');
  assert.equal(second.r.quote_request,'QUOTE|2026-12-30|2027-01-02|3|NONE');
  assert.equal(second.result.quote_state,'');assert.equal(second.result.policy_restriction,'package_full_period_only');
  assert.doesNotMatch(second.text,/Quais são as datas/);
});
test('pacote completo com extras: 30/12–04/01 Triplo R$7.820 e sem disponibilidade confirmada',async()=>{
  const first=await turn('Posso chegar dia trinta e sair dia quatro?');
  assert.equal(first.state.package_stay_query.check_out,'2027-01-04');assert.match(first.text,/Posso simular 30\/12\/2026 a 04\/01\/2027/);
  const second=await turn('E quanto fica no apartamento para três pessoas?',first.state);
  assert.equal(second.r.quote_request,'QUOTE|2026-12-30|2027-01-04|3|NONE');
  const quote=JSON.parse(second.result.quote_state);
  assert.equal(quote.options.find(o=>o.name==='Suíte Triplo').total,7820);
  assert.equal(quote.options.find(o=>o.name==='LOFT').total,12400);
  assert.equal(quote.options.find(o=>o.name==='Suíte Casal'),undefined);
  assert.equal(second.result.availability_checked,false);assert.equal(second.result.requires_human_confirmation,true);
  const selected=control({operation:'prepare',user_message:'Quero a Suíte Triplo',state:second.state,quote_state:second.result.quote_state},now);
  const routed=control({operation:'route',user_message:'Quero a Suíte Triplo',state:selected.state,quote_state:second.result.quote_state},now);
  assert.equal(routed.quote_request,'COLETAR');assert.equal(routed.can_collect,'NAO');
  assert.match(routed.confirmation_text,/7\.820/);
  assert.equal(control({operation:'confirm',state:routed.state,quote_state:second.result.quote_state},now).can_collect,'SIM');
  assert.ok(second.text.length<=2000,second.text.length);
});
test('valores do motor: noites exatas, adicionais de um lado, weekend e desconto só no período exato',async()=>{
  for(const [checkIn,checkOut,total] of [['2026-12-31','2027-01-03',6400],['2026-12-30','2027-01-03',7110],['2026-12-31','2027-01-04',7110],['2026-12-30','2027-01-04',7820]]){
    const r=await request(prices,{checkIn,checkOut,guests:3});assert.equal(JSON.parse(r.quote_state).options.find(o=>o.name==='Suíte Triplo').total,total);
  }
  assert.equal(motorStayPrice(rooms[1],'2026-09-18','2026-09-20'),1420);
  const discounted={...pkg,full_period_discount_pct:20,room_prices:[{roomId:'triplo',price:6000}]};
  assert.equal(motorStayPrice(rooms[1],'2026-12-31','2027-01-03',discounted),4800);
  assert.equal(motorStayPrice(rooms[1],'2026-12-30','2027-01-04',discounted),7820);
});
test('idades pendentes não permitem cotar, sim genérico não vira aceite nem troca datas',async()=>{
  const first=await turn('Posso chegar dia trinta e sair dia quatro?');
  const next=await turn('Somos um casal e uma criança',first.state);
  assert.equal(next.r.quote_request,'NOQUOTE');assert.match(next.text,/idade/i);assert.equal(next.state.package_stay_query.check_out,'2027-01-04');
  const yes=await turn('Sim',first.state);assert.equal(yes.r.can_collect,'NAO');assert.notEqual(yes.r.quote_request,'COLETAR');
  const age=await turn('Ela tem 5 anos',next.state);
  assert.match(age.r.quote_request,/^QUOTE\|2026-12-30\|2027-01-04\|3\|NONE$/);
  assert.equal(JSON.parse(age.result.quote_state).options.find(o=>o.name==='Suíte Casal').total,6820);
  assert.ok(age.text.length<=2000,age.text.length);
});
test('consulta expira, não migra para outro pacote e não recicla confirmação antiga',async()=>{
  const first=await turn('Posso chegar dia trinta e sair dia quatro?');
  assert.equal(readPackageStayQuery(first.state.package_stay_query,{...focus,id:'natal'},now),undefined);
  assert.equal(readPackageStayQuery(first.state.package_stay_query,focus,now+31*60000),undefined);
  const noQuote=control({operation:'confirm',state:first.state,quote_state:{version:1,id:'old',created_at:now,check_in:'2026-12-31',check_out:'2027-01-03',guests:2,extras:[],options:[{name:'Suíte Casal',capacity:2,total:5600}]}},now);
  assert.equal(noQuote.can_collect,'NAO');
});
test('cliente altera somente a saída, e a próxima simulação aproveita pessoas e entrada',async()=>{
  const first=await turn('Posso chegar dia trinta e sair dia dois?');
  const blocked=await turn('Quanto fica para três pessoas?',first.state);
  const changed=await turn('Então quero sair dia três',blocked.state);
  assert.equal(changed.r.quote_request,'QUOTE|2026-12-30|2027-01-03|3|NONE');
  assert.equal(JSON.parse(changed.result.quote_state).options.find(o=>o.name==='Suíte Triplo').total,7110);
});
test('lista de fim de ano não inclui feriado passado nem outubro',async()=>{
  const r=await turn('Gostaria de saber se vocês têm pacote para o final do ano.',{version:2,history:[],facts:{extras:[]},greeted:true});
  assert.match(r.text,/Réveillon/);assert.doesNotMatch(r.text,/Independência|Dia das Crianças|04\/09|09\/10/);
});
test('restrições cadastradas prevalecem, cortesia não ultrapassa capacidade e estoque não é prometido',()=>{
  assert.equal(motorStayRestriction(rooms[1],'2026-12-30','2027-01-02'),'check_out');
  assert.equal(motorStayRestriction(rooms[1],'2027-01-01','2027-01-04'),'check_in');
  assert.equal(motorStayRestriction({...rooms[1],overrides:[{dateIso:'2026-12-30',isClosed:true}]},'2026-12-30','2027-01-04'),'closed');
  assert.equal(requiresFullPackagePeriod(pkg),true);
  assert.equal(requiresFullPackagePeriod({...pkg,no_checkin_dates:['__FULL_PERIOD_FREE__']}),false);
});
test('grupos de cinco adultos continuam para oferta humana, sem cotação de um único quarto',async()=>{
  const first=await turn('Posso chegar dia trinta e sair dia quatro?');
  const group=await turn('Somos cinco adultos',first.state);
  assert.equal(group.r.quote_request,'NOQUOTE');assert.equal(group.state.multi_room.status,'offered');assert.match(group.text,/apartamentos/);
  const yes=await turn('Sim',group.state);assert.equal(yes.r.quote_request,'HUMANO');assert.equal(yes.r.can_collect,'NAO');
});
