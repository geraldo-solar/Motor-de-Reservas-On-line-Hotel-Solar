import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';

// Real WhatsApp conversations of 19-21/10/2026 (audit), replayed through
// prepare -> route -> get-prices | resolve-package. Synthetic catalogue with
// the same per-night shape as the motor (3.166,67 x 3 nights), no network.
const start=Date.parse('2026-09-29T11:35:00-03:00');
let now=start;
const realNow=Date.now,realFetch=globalThis.fetch;
Date.now=()=>now;
Reflect.set(globalThis,'fetch',async()=>{throw Error('External network is forbidden in this test');});
after(()=>{Date.now=realNow;Reflect.set(globalThis,'fetch',realFetch);});
const rooms=[['casal','Suíte Casal',2,410,610,1866.67],['triplo','Suíte Triplo',3,490,710,2133.33],['loft','LOFT',4,910,1450,3166.67],
  ['sacada','Suíte Sacada Vista Mar',3,599,810,2366.67],['quadruplo','Suíte Quádruplo',4,599,810,2466.67],['varanda','Suíte Varanda Térreo',4,650,920,2566.67]]
  .map(([id,name,capacity,base_price,extra,night])=>({id,name,capacity,base_price,active:true,overrides:[
    {dateIso:'2026-12-30',price:extra},{dateIso:'2026-12-31',price:night},
    {dateIso:'2027-01-01',price:night,noCheckIn:true,noCheckOut:true},
    {dateIso:'2027-01-02',price:night,noCheckIn:true,noCheckOut:true},
    {dateIso:'2027-01-03',price:extra}]}));
const RV27_ID='0267abd7-ba19-4492-8894-aea827edea33';
const pkg={id:RV27_ID,name:'Réveillon Solar 2027: A Virada em Salinas',active:true,start_iso_date:'2026-12-31',end_iso_date:'2027-01-03',
  description:'A virada de 2027 à beira-mar. Três noites com passeio de catamarã, festa da virada, ceia e open bar. Criança até 6 anos não paga. Parcele em até 6x no cartão.',
  includes:['Quinta 31/12 Check-in · Festa da Virada: ceia, open bar, DJ e banda','Sábado 02/01 Passeio de barco'],benefits:[],
  room_prices:[],max_installments:6,full_period_discount_pct:0,no_checkin_dates:[],no_checkout_dates:[]};
const fixture={room_types:rooms,packages:[pkg,
  {...pkg,id:'natal',name:'Natal em Salinas',start_iso_date:'2026-12-24',end_iso_date:'2026-12-27',max_installments:3,description:'Natal à beira-mar.'},
  {...pkg,id:'natal-reveillon',name:'Natal + Réveillon: 10 Noites em Salinas',start_iso_date:'2026-12-24',end_iso_date:'2027-01-03',max_installments:10,full_period_discount_pct:20,description:'Passe as duas festas em Salinas.'},
  {...pkg,id:'criancas',name:'Dia das Crianças',start_iso_date:'2026-10-09',end_iso_date:'2026-10-12',max_installments:3,description:'Feriado.'}],extras:[]};
const b=await build({stdin:{contents:`export {control} from './api/conversation-control.ts';export {default as prices} from './api/get-prices.ts';export {default as resolver} from './api/resolve-package.ts';
  export {updateFamilyParty} from './utils/familyParty.ts';export {packagePrices} from './utils/packageReply.ts';export * from './utils/newYearSales.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'campaign-catalogue-fixture',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const data=${JSON.stringify(fixture)};export function createClient(){return {from(table){if(!(table in data))throw Error('Forbidden table '+table);return {select(){return {eq(){return Promise.resolve({data:data[table],error:null})}}}}}}}`}));}}]});
const {control,prices,resolver,updateFamilyParty,packagePrices,newYearSalesReply,unknownPartnerInquiry}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));

async function request(handler,body){let output;await handler({method:'POST',body,query:{}},{status(code){assert.equal(code,200);return this;},json(v){output=v;return v;},setHeader(){}});return output;}
// The model answer is deliberately wrong: deterministic branches must replace it.
const WRONG_AI='Não aceitamos pets, incluindo RDC. Parcelamos em até 3 vezes. A festa é no Reserva Solar, sem lugar marcado.';
function conversation(seed){
  let state=seed,quote;
  return async function say(message){
    now+=60000;
    const p=control({operation:'prepare',user_message:message,state,quote_state:quote},now);
    const r=control({operation:'route',user_message:message,state:p.state,proposed:p.quote_request,quote_state:quote,ai_response:WRONG_AI},now);
    let result;
    if(r.quote_request.startsWith('QUOTE|')){result=await request(prices,{quote_request:r.quote_request,state:r.state});if(result.quote_state)quote=result.quote_state;}
    else if(!['COLETAR','HUMANO'].includes(r.quote_request))result=await request(resolver,{user_message:message,state:r.state});
    state=result?.state||r.state;
    return {r,result,state:JSON.parse(state),text:r.quote_request==='COLETAR'?r.confirmation_text:result?.conversation_text??r.answer};
  };
}
const CAMPAIGN_SEED=JSON.stringify({version:2,history:[],facts:{extras:[]},greeted:false,campaign:'RV27'});
test('datas por extenso: "Dezembro 31 a 3 de janeiro" cota o Réveillon (Katia)',async()=>{
  now=Date.parse('2026-10-20T09:30:00-03:00');
  const say=conversation();
  await say('Bom dia');
  await say('4 pessoas ,3 adultos 1 criança 6anos');
  assert.match((await say('31 a 3')).text,/De qual mês/);
  const quote=await say('Dezembro 31 a 3 de janeiro');
  assert.equal(quote.r.quote_request,'QUOTE|2026-12-31|2027-01-03|4|NONE');
  assert.match(quote.text,/Réveillon Solar 2027/);assert.doesNotMatch(quote.text,/Natal/);
});

test('datas por extenso: "dia 30 de dezembro noite sair dia 2tarde" com 10 pessoas vai para a recepção (Ame Vida)',async()=>{
  now=Date.parse('2026-10-20T09:30:00-03:00');
  const say=conversation();
  await say('Reserva reveilow');
  await say('10');
  const t=await say('Entra dia 30 de dezembro noite sair dia 2tarde');
  assert.deepEqual([t.state.facts.check_in,t.state.facts.check_out,t.state.facts.guests],['2026-12-30','2027-01-03',10]);
  assert.match(t.text,/Para 10 hóspedes, precisamos dividir/);assert.doesNotMatch(t.text,/Natal/);
});

test('Natal + Réveillon só quando o cliente pede o Natal',async()=>{
  now=Date.parse('2026-10-20T09:30:00-03:00');
  for(const message of ['reveillon dezembro e janeiro','Quero passar a virada'])
    assert.match((await request(resolver,{user_message:message})).package_name,/^Réveillon Solar 2027/,message);
  assert.match((await request(resolver,{user_message:'Natal e réveillon'})).package_name,/^Natal \+ Réveillon/);
});

test('idade respondida horas depois de "Quais são as idades" não chama a recepção (Suziane)',async()=>{
  now=Date.parse('2026-10-20T15:05:00-03:00');
  const say=conversation();
  assert.match((await say('Dois adultos e uma criança')).text,/Quais são as idades/);
  now+=2*3600000;
  const t=await say('a criança tem 5 anos');
  assert.notEqual(t.result?.match_type,'repeated_question_handoff');assert.doesNotMatch(t.text,/Para não te fazer repetir/);
  assert.deepEqual([t.state.facts.guests,t.state.family_party.ages_months],[3,[60]]);
});

test('datas depois de "Para quantas pessoas?" são anotadas, sem recepção (Ana Katia)',async()=>{
  now=Date.parse('2026-10-20T08:55:00-03:00');
  const say=conversation();
  await say('Bom dia');
  assert.match((await say('Queria saber se vcs tem disponibilidade')).text,/Para quantas pessoas/);
  const t=await say('Dia 23/10 para 24/10 ?');
  assert.equal(t.result.match_type,'general_information');
  assert.match(t.text,/^Anotei as datas: 23\/10 a 24\/10\. Para quantas pessoas/);
  assert.equal((await say('2 adultos')).r.quote_request,'QUOTE|2026-10-23|2026-10-24|2|NONE');
});

test('"Somente eu e minha filha" são 2 pessoas e pede a idade (Lilian)',()=>{
  for(const message of ['Somente eu e minha filha.','Só eu e meu filho']){
    const r=updateFamilyParty(message,undefined,now);
    assert.deepEqual([r.guests,r.party.adults,r.party.children,r.children_pending],[2,1,1,true],message);
  }
});

test('preço da festa sem falar de hospedagem: festa avulsa e pacote, e pergunta (Lisiany)',async()=>{
  now=Date.parse('2026-10-21T17:51:00-03:00');
  for(const message of ['E na noite da virada, qto tá a festa','Quanto custa a festa da virada?','qual o valor da festa do réveillon?']){
    const say=conversation();
    const t=await say(message);
    assert.equal(t.r.quote_request,'NOQUOTE',message);
    assert.match(t.text,/pulseira de R\$ 800 por pessoa/,message);
    assert.match(t.text,/a festa já está incluída no pacote do Réveillon/,message);
    assert.match(t.text,/Você quer só a festa ou a festa com hospedagem\?/,message);
    assert.doesNotMatch(t.text,/a partir de R\$ 5\.600|Vou chamar nossa equipe/,message);
    // "Só a festa" afterwards: the team sends the payment.
    const only=await say('Só a festa');
    assert.equal(only.r.quote_request,'HUMANO',message);
    assert.match(only.text,/R\$ 800 por pessoa/);
  }
  // A group or lodging word keeps the package flow; "só a festa" stays as it was.
  for(const message of ['Quanto fica o pacote com a festa da virada para 2 pessoas?','Quanto é a festa de aniversário?','A festa está inclusa no pacote?'])
    assert.notEqual(newYearSalesReply(message,undefined,now)?.kind,'party_price',message);
  assert.equal(newYearSalesReply('Quanto é só a festa da virada?',undefined,now)?.kind,'party_only');
  // "2 adultos" next is about the package offered with the party price.
  const say=conversation();
  await say('E na noite da virada, qto tá a festa');
  assert.match((await say('2 adultos')).text,/Réveillon Solar 2027[\s\S]*Indicada para vocês: Suíte Casal\* — \*R\$ 5\.600,00/);
});
