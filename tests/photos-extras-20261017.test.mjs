import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';

// 17/10/2026: extras beside package prices, the quoted category's photo on a
// generic request and official photos of the hotel areas. Synthetic catalogue.
const start=Date.parse('2026-09-29T11:35:00-03:00');
let now=start;
const realNow=Date.now,realFetch=globalThis.fetch;
Date.now=()=>now;
Reflect.set(globalThis,'fetch',async()=>{throw Error('External network is forbidden in this test');});
after(()=>{Date.now=realNow;Reflect.set(globalThis,'fetch',realFetch);});
const rooms=[['casal','Suíte Casal',2,410,610,1866.67],['triplo','Suíte Triplo',3,490,710,2133.33],['loft','LOFT',4,910,1450,3166.67],
  ['sacada','Suíte Sacada Vista Mar',3,599,810,2366.67],['quadruplo','Suíte Quádruplo',4,599,810,2466.67],['varanda','Suíte Varanda Térreo',4,650,920,2566.67]]
  .map(([id,name,capacity,base_price,extra,night])=>({id,name,capacity,base_price,active:true,images:['https://img.test/'+id+'1.jpg'],overrides:[
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
  {...pkg,id:'criancas',name:'Dia das Crianças',start_iso_date:'2026-10-09',end_iso_date:'2026-10-12',max_installments:3,description:'Feriado.'}],extras:[{id:'mesa',name:'Mesa Posta',price:180,active:true},{id:'kit',name:'Kit Lua de Mel / Celebração',price:350,active:true},{id:'barco',name:'Passeio de Barco',price:0,active:true}]};
const b=await build({stdin:{contents:`export {control} from './api/conversation-control.ts';export {default as prices} from './api/get-prices.ts';export {default as resolver} from './api/resolve-package.ts';
  export {updateFamilyParty} from './utils/familyParty.ts';export {packagePrices} from './utils/packageReply.ts';export * from './utils/newYearSales.ts';export {sitePhotoUrl} from './utils/hotelInfo.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'campaign-catalogue-fixture',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const data=${JSON.stringify(fixture)};export function createClient(){return {from(table){if(!(table in data))throw Error('Forbidden table '+table);return {select(){return {eq(){return Promise.resolve({data:data[table],error:null})}}}}}}}`}));}}]});
const {sitePhotoUrl,control,prices,resolver,updateFamilyParty,packagePrices,newYearSalesReply,unknownPartnerInquiry}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));

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

const SEED=JSON.stringify({version:2,history:[],facts:{extras:[]},greeted:false,campaign:'RV27'});
async function next(reference){let output;await resolver({method:'POST',body:{user_message:reference},query:{operation:'next'}},{status(){return this;},json(v){output=v;return v;},setHeader(){}});return output;}

test('Réveillon price card offers the paid extras; the included boat is not offered again',async()=>{
  now=Date.parse('2026-10-17T11:00:00-03:00');
  const say=conversation(SEED);
  await say('Quais os valores do réveillon?');
  const card=await say('2 adultos');
  assert.match(card.text,/✨ Extras opcionais: Mesa Posta \(R\$ 180\), Kit Lua de Mel \/ Celebração \(R\$ 350\)\./);
  assert.doesNotMatch(card.text,/Extras opcionais:[^\n]*barco/);
  const photo=await say('tem foto?');
  assert.equal(photo.result.quote_request,'ROOM_ID|casal');
});

test('a generic room photo after a date quote is the highlighted category; plural is every category',async()=>{
  now=Date.parse('2026-10-17T11:00:00-03:00');
  const say=conversation();
  const quote=await say('Quanto fica a diária de 20/11 a 22/11 para 2 pessoas?');
  assert.match(quote.text,/⭐ \*Suíte Casal\*/);
  assert.equal((await say('me manda foto do quarto')).result.quote_request,'ROOM_ID|casal');
  assert.match((await say('tem fotos dos quartos?')).result.quote_request,/^ROOM_ID\|casal\|triplo,loft,sacada,quadruplo,varanda$/);
  const fresh=conversation();
  assert.equal((await fresh('Pode me mandar fotos dos quartos?')).result.match_type,'room_gallery');
});

test('hotel areas have official photos, continue as a sequence and accept short follow-ups',async()=>{
  now=Date.parse('2026-10-17T11:00:00-03:00');
  const say=conversation();
  const rest=await say('Tem fotos do restaurante?');
  assert.equal(rest.result.quote_request,'SITE_ID|S73_SALAO|S73_PISCINA,RESERVA_1,RESERVA_2');
  assert.equal(sitePhotoUrl(rest.result.quote_request),'/media/solar73-salao.jpg');
  const second=await next(rest.result.quote_request);
  assert.equal(second.quote_request,'SITE_ID|S73_PISCINA|RESERVA_1,RESERVA_2');
  assert.equal((await next('SITE_ID|RESERVA_2')).quote_request,'ROOM_DONE');
  assert.equal((await next('SITE_ID|RESERVA_1|RESERVA_2')).quote_request,'SITE_ID|RESERVA_2');
  assert.equal((await say('e do bar?')).result.quote_request,'SITE_ID|BAR|BAR_LOUNGE');
  assert.equal((await say('o restaurante abre que horas?')).result.match_type,'restaurant_hours');
  const ask=conversation();
  await ask('manda fotos');
  assert.match((await ask('restaurante')).result.quote_request,/^SITE_ID\|S73_SALAO/);
  const tour=conversation();
  assert.match((await tour('manda fotos do hotel')).result.quote_request,/^SITE_ID\|HOTEL_AEREA\|/);
  assert.equal((await tour('fotos da piscina do hotel')).result.quote_request,'EXTRA_ID|PISCINA||PAID');
  assert.equal((await tour('fotos do reserva solar')).result.quote_request,'SITE_ID|RESERVA_1|RESERVA_2,RESERVA_TRAPICHE,RESERVA_AEREA');
  assert.equal((await tour('foto do café da manhã')).result.quote_request,'SITE_ID|CAFE');
  assert.equal(sitePhotoUrl('SITE_ID|NOPE'),undefined);
});
