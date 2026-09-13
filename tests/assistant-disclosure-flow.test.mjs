import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

// Real local controller/resolver, neutral fixture model output and an in-memory
// catalogue only. No database, media download, WhatsApp or provider is called.
const now=Date.parse('2026-09-13T09:00:00-03:00'),realNow=Date.now;Date.now=()=>now;
const bundle=await build({stdin:{contents:`export {control} from './api/conversation-control.ts';export {default as resolver} from './api/resolve-package.ts';export * from './utils/assistantDisclosure.ts';export {photoClarificationQuestion} from './utils/photoIntent.ts';export {queries} from '@supabase/supabase-js';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'disclosure-fixture-only',setup(b){
    b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'test'}));
    b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`export const queries=[];
      const data={extras:[],packages:[],room_types:[{id:'casal',name:'Suíte Casal',capacity:2,active:true,base_price:500,images:['https://fixture.invalid/casal.jpg']}]};
      export function createClient(){return {from(table){queries.push(table);if(!(table in data))throw Error('Unexpected table '+table);return {select(){let rows=data[table];const q={eq(k,v){rows=rows.filter(x=>x[k]===v);return q;},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve);}};return q;}};}};}`}));
  }}]});
const {control,resolver,ASSISTANT_DISCLOSURE,ASSISTANT_DISCLOSURE_COMPACT,stripAssistantDisclosure,photoClarificationQuestion,queries}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const facts={guests:2,check_in:'2026-10-20',check_out:'2026-10-22',extras:[]};
const legacy={version:2,history:[],facts,greeted:true};
const occurrences=text=>(text||'').split(ASSISTANT_DISCLOSURE).length-1+(text||'').split(ASSISTANT_DISCLOSURE_COMPACT).length-1;
const prepare=(message,state=legacy,time=now)=>control({operation:'prepare',user_message:message,state},time);
const route=(message,state,answer='Posso explicar essa informação do hotel.',time=now)=>control({operation:'route',user_message:message,state,proposed:'COLETAR',ai_response:answer},time);
async function resolve(message,state,operation) {
  let result;await resolver({method:'POST',body:{user_message:message,state},query:operation?{operation}:{}},
    {status(code){assert.equal(code,200);return this;},json(value){result=value;return value;}});return result;
}

test('contato ainda não apresentado recebe uma divulgação em prepare→route→resolver e guarda memória limpa',async()=>{
  const message='Tem estacionamento?',p=prepare(message),r=route(message,p.state),result=await resolve(message,r.state);
  assert.deepEqual(JSON.parse(p.state).assistant_disclosure,{version:1,show:true});
  assert.equal(r.quote_request,'NOQUOTE');assert.equal(r.can_collect,'NAO');
  assert.equal(occurrences(r.answer),1);assert.equal(occurrences(result.conversation_text),1);
  assert.equal(result.conversation_text,r.answer);assert.equal(result.quote_request,'ROOM_LIST');
  assert.deepEqual(JSON.parse(result.state).facts,facts);assert.equal(JSON.parse(result.state).assistant_disclosure.rendered,true);
  assert.equal(result.conversation_text.startsWith('Bom dia!\n\n'+ASSISTANT_DISCLOSURE),true);
  assert.equal(JSON.parse(result.state).turns.at(-1).text,stripAssistantDisclosure(result.conversation_text));
  assert.doesNotMatch(JSON.stringify(JSON.parse(result.state).turns),/98100-0800|assistente virtual/);
  const retry=await resolve(message,result.state);assert.equal(retry.conversation_text,result.conversation_text);
});

test('remember_response preserva a resposta sem telefone e novo prepare não reapresenta nem no próximo dia',()=>{
  const message='Tem estacionamento?',p=prepare(message),r=route(message,p.state);
  const saved=control({operation:'remember_response',state:r.state,response_text:r.answer},now);
  assert.equal(JSON.parse(saved.state).turns.at(-1).text,stripAssistantDisclosure(r.answer));
  assert.deepEqual(JSON.parse(saved.state).assistant_disclosure,{version:1,show:true,rendered:true});
  for(const time of [now+1000,now+86400000]) {
    const next=prepare(message,saved.state,time),answer=route(message,next.state,'Informação da continuação.',time);
    assert.equal(JSON.parse(next.state).assistant_disclosure.show,false);assert.equal(occurrences(answer.answer),0);
    assert.deepEqual(JSON.parse(answer.state).facts,facts);
    if(time>now+1000)assert.match(answer.answer,/^Bom dia!/);
  }
});

test('PHOTO_CLARIFY decorado continua reconhecido e resposta curta entrega apenas a foto escolhida',async()=>{
  const message='Pode reenviar as fotos?',p=prepare(message),r=route(message,p.state,'Já enviei as fotos.'),result=await resolve(message,r.state);
  assert.equal(photoClarificationQuestion(r.answer),true);assert.equal(photoClarificationQuestion(result.conversation_text),true);
  assert.equal(occurrences(result.conversation_text),1);assert.equal(JSON.parse(result.state).topic,'photo_clarification');
  assert.doesNotMatch(JSON.stringify(JSON.parse(result.state).turns),/98100-0800/);
  const nextMessage='do parque infantil',next=prepare(nextMessage,result.state),selected=route(nextMessage,next.state);
  const photo=await resolve(nextMessage,selected.state);
  assert.deepEqual(photo.photo_codes,['PARQUE']);assert.match(photo.quote_request,/^EXTRA_ID\|PARQUE\|/);
  assert.equal(occurrences(photo.conversation_text),0);assert.deepEqual(JSON.parse(photo.state).facts,facts);
  assert.equal(selected.can_collect,'NAO');assert.doesNotMatch(photo.conversation_text,/R\$|reserva confirmada|CPF/);
});

test('offers recebe resposta decorada mas mantém pendência de datas, sem nova apresentação ou cotação',async()=>{
  const message='Quero hospedagem por 2 dias, de 11/10/2027 a 12/10/2027';
  const p=prepare(message),r=route(message,p.state,'Vou mostrar o kit lua de mel.');
  assert.equal(r.quote_request,'NOQUOTE');assert.equal(occurrences(r.answer),1);
  assert.equal(JSON.parse(r.state).facts.check_out,undefined);
  queries.length=0;
  const offers=await resolve(r.answer,r.state,'offers');
  assert.equal(offers.quote_request,'ROOM_DONE');assert.equal(offers.conversation_text,'');
  assert.equal(offers.match_type,'stay_date_clarification');assert.deepEqual(queries,[]);
  assert.equal(JSON.parse(offers.state).assistant_disclosure.rendered,true);
});
test.after(()=>{Date.now=realNow;});
