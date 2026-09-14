import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

// The real local controller, quotation and resolver are exercised together.
// Catalogue, transcription and token are synthetic. No model, database, image
// download, ManyChat write, reservation or actual human assignment is performed.
const START=Date.parse('2026-09-14T12:13:00-03:00');
let clock=START;
const originalNow=Date.now,originalFetch=globalThis.fetch;
Date.now=()=>clock;
let networkAttempts=0;
globalThis.fetch=async()=>{networkAttempts++;throw Error('External network forbidden in recent-test-flow');};
test.after(()=>{Date.now=originalNow;globalThis.fetch=originalFetch;assert.equal(networkAttempts,0);});
const TOKEN='Bearer fixture-only-recent-test-token';
const rooms=[
  ['casal','Suíte Casal',2,500],['triplo','Suíte Triplo',3,650],
  ['quadruplo','Suíte Quádruplo',4,800],['varanda','Suíte Varanda Térreo',4,850],
  ['sacada','Suíte Sacada Vista Mar',4,950],['loft','Loft',4,1100],
].map(([id,name,capacity,base_price])=>({id,name,capacity,base_price,active:true,
  overrides:[],images:[`https://fixture.invalid/${id}.jpg`]}));
const pkg={id:'reveillon-fixture',name:'Réveillon Solar 2027',active:true,
  start_iso_date:'2026-12-31',end_iso_date:'2027-01-03',full_period_required:true,
  description:'Pacote de Réveillon.',includes:['Café da manhã'],benefits:[],
  room_prices:rooms.map(room=>({roomId:room.id,price:room.base_price*3})),max_installments:3};
const fixture={room_types:rooms,packages:[pkg],extras:[
  {id:'lua',name:'Kit Lua de Mel/Celebração',price:350,active:true,
    description:'Preparação especial para celebrar a estadia, mediante consulta.',images:['https://fixture.invalid/lua.jpg']},
  {id:'mesa',name:'Mesa Posta',price:180,active:true,images:['https://fixture.invalid/mesa.jpg']},
]};
const bundled=await build({stdin:{contents:`export {control,handleConversation} from './api/conversation-control.ts';
  export {default as prices} from './api/get-prices.ts';export {default as resolver} from './api/resolve-package.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'recent-test-in-memory-only',setup(builder){
    builder.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const fixture=${JSON.stringify(fixture)};
      export function createClient(){return{from(table){
        if(!(table in fixture))throw Error('Unexpected fixture table '+table);
        let rows=fixture[table];const q={select(){return q;},eq(k,v){rows=rows.filter(r=>r[k]===v);return q;},
          then(resolve,reject){return Promise.resolve({data:rows,error:null}).then(resolve,reject);}};return q;
      }};}`}));
  }}]});
const {control,handleConversation,prices,resolver}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const FAMILY='No meu caso para o réveillon somos 5 pessoas.\n1 casal mais 3 filhos\n1 tem 8 anos\n1 tem 10 anos\n1 tem 16 anos\nDão todos em um apto?';
const EXCEPTION='Tem como abrir excessão para o dia 30 a 02?';

async function invoke(handler,body,query={}){
  let status,payload;
  await handler({method:'POST',body,query,headers:{authorization:TOKEN}},
    {status(value){status=value;return this;},json(value){payload=value;return value;}});
  assert.equal(status,200,JSON.stringify(payload));return payload;
}
function newConversation(){
  clock=START;
  return {state:{version:2,history:[],facts:{extras:[]},greeted:true,
      assistant_disclosure:{version:1,show:false,rendered:true}},quote_state:undefined,
    at(time){clock=Date.parse(time);},
    async say(message,{transcription,proposed='NOQUOTE',answer='Posso esclarecer as informações do hotel.'}={}){
      clock+=1000;
      const body={operation:'prepare',user_message:message,state:this.state,quote_state:this.quote_state};
      let transcribed=0;
      const prepared=transcription===undefined?control(body,clock):await handleConversation(body,TOKEN,async(input,authorization)=>{
        transcribed++;assert.equal(input,message);assert.equal(authorization,TOKEN);return transcription;
      },clock);
      if(transcription!==undefined)assert.equal(transcribed,1);
      const routed=control({operation:'route',user_message:message,state:prepared.state,
        quote_state:this.quote_state,proposed,ai_response:answer},clock);
      let response=routed;
      if(/^QUOTE\|/.test(routed.quote_request)){
        response=await invoke(prices,{quote_request:routed.quote_request,state:routed.state});
        this.quote_state=response.quote_state;
      }else if(routed.quote_request==='NOQUOTE'){
        response=await invoke(resolver,{user_message:message,state:routed.state});
      }
      this.state=response.state||routed.state;
      return {prepared,routed,response,state:JSON.parse(this.state),
        context:prepared.context?JSON.parse(prepared.context):undefined,
        text:response.conversation_text||response.answer||routed.answer||''};
    }};
}
async function quotedConversation(){
  const chat=newConversation();
  const initial=await chat.say('Quero hospedagem de 18/09 a 20/09 para 2 pessoas');
  assert.equal(initial.routed.quote_request,'QUOTE|2026-09-18|2026-09-20|2|NONE');
  assert.equal(JSON.parse(chat.quote_state).guests,2);
  return chat;
}
function assertFamily(state){
  assert.equal(state.facts.guests,5);assert.equal(state.facts.children_pending,false);
  assert.equal(state.family_party.adults,2);assert.equal(state.family_party.children,3);
  assert.deepEqual(state.family_party.ages_months,[96,120,192]);
  assert.equal(state.family_clarification,undefined);
}
function assertNoSelectedStay(state){
  assert.equal(state.facts.check_in,undefined);assert.equal(state.facts.check_out,undefined);
}
async function packageOfferConversation(){
  const chat=newConversation();
  await chat.say('Quero saber sobre o pacote Réveillon');
  await chat.say(EXCEPTION);
  const offer=await chat.say(FAMILY);
  return {chat,offer};
}

test('replay 14/09: áudio, correção, escolha, foto, troca de assunto, pacote, família e Sim',async()=>{
  const chat=newConversation();
  const audio=await chat.say('https://fixture.invalid/test-only-audio.ogg',{
    transcription:'Quero hospedagem de 18/09 a 20/09 para 3 pessoas'});
  assert.equal(audio.routed.quote_request,'QUOTE|2026-09-18|2026-09-20|3|NONE');
  assert.equal(audio.response.guests,3);assert.equal(audio.response.availability_checked,false);
  const corrected=await chat.say('É apto para 2 pessoas');
  assert.equal(corrected.routed.quote_request,'QUOTE|2026-09-18|2026-09-20|2|NONE');
  assert.equal(corrected.response.guests,2);
  const chosen=await chat.say('No loft');
  assert.equal(chosen.routed.quote_request,'COLETAR');assert.equal(chosen.routed.can_collect,'NAO');
  assert.match(chosen.routed.confirmation_text,/Loft/);
  assert.match(chosen.routed.confirmation_text,/18\/09\/2026 a 20\/09\/2026/);
  const photo=await chat.say('Vc tem fotos?');
  assert.match(photo.prepared.resolved_message||photo.state.resolved_message,/Fotos de Loft/i);
  assert.match(photo.response.quote_request,/^ROOM_ID\|loft(?:\||$)/);
  assert.equal(photo.routed.can_collect,'NAO');assert.equal(photo.state.pending,undefined);
  const kit=await chat.say('O que vem no kit lua de mel?');
  assert.equal(kit.routed.quote_request,'NOQUOTE');assert.equal(kit.routed.can_collect,'NAO');
  assert.doesNotMatch(kit.response.quote_request,/^ROOM_ID\|loft/);
  assert.deepEqual(kit.state.facts.extras,[]);
  const pet=await chat.say('Vocês aceitam pet?');
  assert.equal(pet.routed.quote_request,'NOQUOTE');assert.equal(pet.routed.can_collect,'NAO');
  assert.equal(pet.state.guest_inquiry?.kind,'lodging_faq');
  assert.notEqual(pet.state.subject,'Loft');
  chat.at('2026-09-14T12:38:00-03:00');
  const packageInfo=await chat.say('Quero saber sobre o pacote Réveillon');
  assert.equal(packageInfo.state.package_context?.id,pkg.id);
  assertNoSelectedStay(packageInfo.state);
  const exceptional=await chat.say(EXCEPTION);
  assert.equal(exceptional.state.package_date_request?.package_id,pkg.id);
  assert.equal(exceptional.state.package_date_request?.text,EXCEPTION);
  assertNoSelectedStay(exceptional.state);
  assert.doesNotMatch(exceptional.routed.quote_request,/^(?:QUOTE\||COLETAR)/);
  assert.equal(exceptional.routed.can_collect,'NAO');
  assert.match(exceptional.text,/recepção/);
  const family=await chat.say(FAMILY);
  assertFamily(family.state);assertNoSelectedStay(family.state);
  assert.equal(family.state.multi_room?.status,'offered');
  assert.doesNotMatch(family.response.quote_request,/^PACKAGE_ID\|/);
  assert.match(family.text,/dois apartamentos/);
  assert.doesNotMatch(family.text,/Quais são as idades/);
  const loft=await chat.say('Loft dá para todos nós?');
  assertFamily(loft.state);assert.match(loft.text,/dois apartamentos/);
  assert.doesNotMatch(loft.text,/Quais são as idades/);
  const ages=await chat.say('8, 10 e 16');
  assertFamily(ages.state);assertNoSelectedStay(ages.state);
  assert.equal(ages.state.package_context?.id,pkg.id);
  assert.equal(ages.state.package_date_request?.text,EXCEPTION);
  assert.equal(ages.state.multi_room?.status,'offered');
  const accepted=await chat.say('Sim');
  assert.equal(accepted.routed.quote_request,'HUMANO');assert.equal(accepted.routed.can_collect,'NAO');
  assert.equal(accepted.routed.confirmation_text,'');assert.equal(accepted.state.pending,undefined);
  assert.match(accepted.text,/recepção/);
  assert.doesNotMatch(accepted.text,/Posso chamar|Quer que eu|Quais são as idades/);
  assertFamily(accepted.state);assertNoSelectedStay(accepted.state);
});

test('escolher qual foto ver não autoriza seleção de quarto nem coleta',async()=>{
  const chat=await quotedConversation();
  const gallery=await chat.say('Quero fotos dos apartamentos');
  assert.match(gallery.response.quote_request,/^ROOM_ID\|/);
  const choice=await chat.say('No loft');
  assert.equal(choice.routed.quote_request,'NOQUOTE');assert.equal(choice.routed.can_collect,'NAO');
  assert.match(choice.response.quote_request,/^ROOM_ID\|loft(?:\||$)/);
  assert.equal(choice.routed.confirmation_text,'');assert.equal(choice.state.pending,undefined);
});

test('recusa da oferta humana não encaminha; Sim posterior não reaproveita autorização recusada',async()=>{
  const {chat,offer}=await packageOfferConversation();
  assert.equal(offer.state.multi_room?.status,'offered');
  const declined=await chat.say('Não, obrigado');
  assert.notEqual(declined.routed.quote_request,'HUMANO');assert.equal(declined.routed.can_collect,'NAO');
  assert.match(declined.text,/não vou|não.*encaminh|não.*solicitar/i);
  const later=await chat.say('Sim');
  assert.notEqual(later.routed.quote_request,'HUMANO');assert.equal(later.routed.can_collect,'NAO');
});

test('cotação expirada não permite confirmar No loft nem reaproveitar dados de coleta',async()=>{
  const chat=await quotedConversation();
  clock+=31*60000;
  const stale=await chat.say('No loft',{proposed:'COLETAR'});
  assert.notEqual(stale.routed.quote_request,'COLETAR');assert.equal(stale.routed.can_collect,'NAO');
  assert.equal(stale.routed.confirmation_text,'');assert.equal(stale.state.pending,undefined);
});

test('nova pergunta depois da oferta humana não deixa Sim solto chamar a recepção',async()=>{
  const {chat,offer}=await packageOfferConversation();
  assert.equal(offer.state.multi_room?.status,'offered');
  const changed=await chat.say('Qual o horário do café da manhã?');
  assert.notEqual(changed.routed.quote_request,'HUMANO');assert.equal(changed.state.multi_room,undefined);
  const acceptedOther=await chat.say('Sim');
  assert.notEqual(acceptedOther.routed.quote_request,'HUMANO');assert.equal(acceptedOther.routed.can_collect,'NAO');
});
