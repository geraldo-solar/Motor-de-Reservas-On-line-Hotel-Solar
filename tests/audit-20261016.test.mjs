import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';

// Real WhatsApp conversations of 16/10/2026 (audit), replayed through
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

test('Réveillon: "eu e 2 filhos adultos" cota 3 adultos sem pedir idades',async()=>{
  now=Date.parse('2026-10-16T15:00:00-03:00');
  for(const party of ['eu e 2 filhos adultos.','eu e minhas duas filhas maiores de idade','3 adultos']){
    const say=conversation(CAMPAIGN_SEED);
    await say('os valores, por favor');
    const quoted=await say(party);
    assert.equal(quoted.state.facts.guests,3,party);
    assert.match(quoted.text,/3 hóspedes/,party);assert.match(quoted.text,/Suíte Triplo\* — \*R\$ 6\.400,00\*/,party);
    assert.doesNotMatch(quoted.text,/idades|chamar nossa equipe/,party);
  }
  const single=conversation(CAMPAIGN_SEED);
  await single('os valores, por favor');
  assert.equal((await single('eu e minha filha adulta')).state.facts.guests,2);
  // Without "adultos", the ages are still asked before recommending.
  const ages=conversation(CAMPAIGN_SEED);
  await ages('os valores, por favor');
  assert.match((await ages('eu e 2 filhos')).text,/idades/);
  assert.match((await ages('25 e 27')).text,/3 hóspedes/);
  now=start;
});

test('grupo de 6 no Réveillon: o destaque é o total dos 2 apartamentos',async()=>{
  now=Date.parse('2026-10-16T15:00:00-03:00');
  const say=conversation(CAMPAIGN_SEED);
  await say('Quais os valores do réveillon?');
  const group=await say('São 6 adultos');
  assert.match(group.text,/2 × Suíte Triplo\* — \*R\$ 12\.800,00\*/);
  assert.match(group.text,/Valor total dos 2 apartamentos, para o pacote completo/);
  assert.doesNotMatch(group.text,/Valores por apartamento/);
  now=start;
});

test('baixa temporada: não inventa meses e pede as datas',async()=>{
  now=Date.parse('2026-10-16T15:00:00-03:00');
  for(const message of ['Qual a baixa temporada de vocês','Quando é a alta temporada?','quais meses são baixa temporada']){
    const answer=await conversation()(message);
    assert.equal(answer.r.quote_request,'NOQUOTE',message);
    assert.match(answer.text,/Não temos um calendário fixo de baixa e alta temporada/,message);
    assert.doesNotMatch(answer.text,/janeiro|julho|dezembro|Não aceitamos pets/,message);
  }
  now=start;
});

test('aviso de chegada depois do previsto vai para a recepção, sem taxa de early check-in',async()=>{
  now=Date.parse('2026-10-16T19:45:00-03:00');
  for(const message of ['Boa noite! Tudo bem? Tenho uma reserva em nome de Juliana Macêdo que iniciava hoje. Queria avisar que farei o checkin amanhã de manhã',
    'Temos reserva para hoje mas vamos chegar só amanhã','Minha reserva é pra hoje, mas vou atrasar']){
    const late=await conversation()(message);
    assert.equal(late.r.quote_request,'HUMANO',message);
    assert.match(late.text,/Obrigado por avisar! Vou chamar a recepção agora para registrar sua chegada na reserva/,message);
    assert.doesNotMatch(late.text,/R\$ ?250|14h/,message);
  }
  // A new booking for tomorrow is still a quote, not a late arrival.
  const fresh=await conversation()('Quero fazer uma reserva, vamos chegar amanhã e sair domingo, 2 pessoas');
  assert.match(fresh.r.quote_request,/^QUOTE\|2026-10-17\|/);
  now=start;
});

test('restaurante para não hóspedes: responde sim antes dos horários',async()=>{
  now=Date.parse('2026-10-16T13:00:00-03:00');
  for(const message of ['Restaurante do hotel aberto para não hóspedes?','Posso ir no Reserva Solar sem estar hospedado?','o restaurante abre pra quem é de fora?']){
    const answer=await conversation()(message);
    assert.match(answer.text,/Sim! Nossos restaurantes são abertos ao público, inclusive para quem não está hospedado\. /,message);
    assert.match(answer.text,/Solar 73.*11h às 23h/s,message);assert.match(answer.text,/10h às 18h/,message);
  }
  const plain=await conversation()('Qual o horário do restaurante?');
  assert.doesNotMatch(plain.text,/^Sim!/);
  now=start;
});
