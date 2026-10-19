import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';

// 19/10/2026: the Instagram turn runs the WhatsApp chain in one call and
// returns Instagram-sized messages for a ManyChat Dynamic block.
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
  export {updateFamilyParty} from './utils/familyParty.ts';export {packagePrices} from './utils/packageReply.ts';export * from './utils/newYearSales.ts';export {sitePhotoUrl} from './utils/hotelInfo.ts';export * from './utils/instagramTurn.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'campaign-catalogue-fixture',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const data=${JSON.stringify(fixture)};export function createClient(){return {from(table){if(!(table in data))throw Error('Forbidden table '+table);return {select(){return {eq(){return Promise.resolve({data:data[table],error:null})}}}}}}}`}));}}]});
const {control,resolver,instagramText,splitInstagramText,instagramContent,INSTAGRAM_FOOTER}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));


const WRONG_AI='Não aceitamos pets, incluindo RDC. Parcelamos em até 3 vezes.';
async function call(operation,body,query={}){let output;await resolver({method:'POST',body,query:{operation,...query},headers:{}},{status(code){assert.equal(code,200);return this;},json(v){output=v;return v;},setHeader(){}});return output;}
function instagram(seed){
  let state=seed,quote,shown='';
  return async function say(message,ai=WRONG_AI){
    now+=60000;
    const p=control({operation:'prepare',user_message:message,state,quote_state:quote},now);
    const out=await call('instagram',{user_message:message,state:p.state,quote_state:quote,ai_response:ai,ig_botao_exibido:shown,subscriber_id:'1'});
    state=out.state||state;quote=out.quote_state||quote;shown=out.ig_botao_exibido;
    const payload=JSON.parse(out.ig_payload);
    return {...out,messages:payload.m,texts:payload.m.filter(m=>m.t==='text').map(m=>m.v),images:payload.m.filter(m=>m.t==='image').map(m=>m.v)};
  };
}
const SEED=JSON.stringify({version:2,history:[],facts:{extras:[]},greeted:false,campaign:'RV27'});

test('Instagram text: no WhatsApp buttons or bold markers, parts of at most 1000 characters',()=>{
  assert.equal(instagramText('Sou a assistente virtual do Hotel Solar. ☀️ Se preferir atendimento humano, toque em “Falar com a recepção”, escreva “recepção” ou ligue para (91) 98100-0800.'),
    'Sou a assistente virtual do Hotel Solar. ☀️ Se preferir atendimento humano, escreva “recepção” ou ligue para (91) 98100-0800.');
  assert.equal(instagramText('*Sexta e sábado:*\n• Suíte Casal: R$ 610'),'Sexta e sábado:\n• Suíte Casal: R$ 610');
  const long=Array.from({length:30},(_,i)=>`Parágrafo ${i+1}: `+'texto '.repeat(10).trim()).join('\n\n');
  const parts=splitInstagramText(long);
  assert.ok(parts.length>=2);
  for(const part of parts)assert.ok(part.length<=1000,String(part.length));
  assert.equal(parts.join('\n\n'),long);
  assert.deepEqual(splitInstagramText('curto'),['curto']);
});

test('Réveillon card on Instagram, then the quoted category photo with the button at the end',async()=>{
  now=Date.parse('2026-10-17T11:00:00-03:00');
  const say=instagram(SEED);
  const card=await say('Quais os valores do réveillon para 2 adultos?');
  assert.equal(card.ig_acao,'RESPOSTA');
  assert.match(card.texts.join('\n'),/Indicada para vocês: Suíte Casal/);
  for(const t of card.texts){assert.ok(t.length<=1000);assert.doesNotMatch(t,/\*[^*\n]+\*/);}
  assert.equal(card.messages.at(-1).t,'footer');
  assert.equal(card.ig_botao_exibido,'SIM');
  const photo=await say('tem foto?');
  assert.equal(photo.images.length,1);
  assert.match(photo.images[0],/package-image\?code=ROOM_ID%7Ccasal/);
  assert.equal(photo.messages.at(-1).t,'footer');
});

test('room gallery on Instagram: 3 photos, each after its caption',async()=>{
  now=Date.parse('2026-10-17T11:00:00-03:00');
  const out=await instagram()('Me manda fotos dos quartos');
  assert.equal(out.images.length,3);
  const kinds=out.messages.map(m=>m.t);
  assert.deepEqual(kinds.slice(0,2),['text','image']);
  assert.ok(out.messages.length<=10);
});

test('site photos and a stay quote with prices',async()=>{
  now=Date.parse('2026-10-17T11:00:00-03:00');
  const site=await instagram()('Tem fotos do restaurante?');
  assert.ok(site.images.length>=1&&site.images.length<=3);
  const say=instagram();
  const quote=await say('Quero orçamento para 2 adultos de 10/11 a 12/11');
  assert.equal(quote.ig_acao,'RESPOSTA');
  assert.match(quote.texts.join('\n'),/R\$/);
  assert.ok(quote.quote_state&&JSON.parse(quote.quote_state).options.length>0);
});

test('asking for the reception hands off; an empty answer is never rendered',async()=>{
  now=Date.parse('2026-10-17T11:00:00-03:00');
  const out=await instagram()('Quero falar com a recepção, por favor');
  assert.equal(out.ig_acao,'HUMANO');
  assert.ok(!out.messages.some(m=>m.t==='footer'));
});

test('Dynamic block renders Instagram content with the handoff button flow',()=>{
  const payload=JSON.stringify({v:1,m:[{t:'text',v:'Olá'},{t:'image',v:'https://reservas.hotelsolar.tur.br/api/package-image?code=SITE_ID%7CS73_SALAO'},{t:'image',v:'https://evil.test/x.jpg'},{t:'footer'}]});
  const out=instagramContent(payload,'content20261019120000_123456');
  assert.equal(out.version,'v2');assert.equal(out.content.type,'instagram');
  assert.deepEqual(out.content.messages.map(m=>m.type),['text','image','text']);
  assert.equal(out.content.messages[2].text,INSTAGRAM_FOOTER);
  assert.equal(out.content.messages[2].buttons[0].target,'content20261019120000_123456');
  const plain=instagramContent(payload);
  assert.doesNotMatch(plain.content.messages[2].text,/toque/);
  assert.equal(plain.content.messages[2].buttons,undefined);
  assert.deepEqual(instagramContent('lixo').content.messages,[]);
});
