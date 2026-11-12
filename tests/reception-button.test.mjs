// 12/11/2026: em quatro conversas o cliente só escreveu "bom dia", recebeu
// "Como posso ajudar?" com o botão "Falar com a recepção" logo abaixo e tocou
// nele antes de perguntar qualquer coisa. A resposta a uma saudação ou a uma
// reação ("ok", "obrigado", figurinha) vai sem o botão; ele acompanha a
// primeira resposta a uma pergunta de verdade.
//
// WhatsApp: o fluxo do Manychat lê o marcador "reception_button":"hold" no
// estado (campo chatgpt_thread) para não enviar o rodapé com o botão.
// Instagram: o próprio turno decide o rodapé a partir do mesmo marcador.
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';

let now=Date.parse('2026-11-12T12:40:00-03:00');
const realNow=Date.now,realFetch=globalThis.fetch;Date.now=()=>now;
Reflect.set(globalThis,'fetch',async()=>{throw Error('External network is forbidden in this test');});
after(()=>{Date.now=realNow;Reflect.set(globalThis,'fetch',realFetch);});
const bundle=await build({stdin:{contents:`export {control} from './api/conversation-control.ts';export {default as resolver} from './api/resolve-package.ts';export {holdReceptionButton,greetingOnly} from './utils/conversationClosers.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'reception-fixture-only',setup(b){
    b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'test'}));
    b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`const data={extras:[],packages:[],room_types:[{id:'casal',name:'Suíte Casal',capacity:2,active:true,base_price:500,images:['https://fixture.invalid/casal.jpg']}]};
      export function createClient(){return {from(table){if(!(table in data))throw Error('Unexpected table '+table);return {select(){let rows=data[table];const q={eq(k,v){rows=rows.filter(x=>x[k]===v);return q;},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve);}};return q;}};}};}`}));
  }}]});
const {control,resolver,holdReceptionButton,greetingOnly}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

const fresh=JSON.stringify({version:2,history:[],facts:{extras:[]},greeted:false});
const sticker='https://manybot-files.manychat.io/156918594386969/wa/2026/11/12/original_b7c5a84019c9129ac7faa3ed6297baf1.webp';
// O texto exato que a condição do Manychat procura no campo chatgpt_thread.
const HOLD=/"reception_button":"hold"/;
async function call(body,operation){let output;await resolver({method:'POST',body,query:operation?{operation}:{},headers:{}},
  {status(code){assert.equal(code,200);return this;},json(v){output=v;return v;},setHeader(){}});return output;}
// Os três passos que o fluxo do WhatsApp executa em uma resposta comum.
async function whatsapp(message,state=fresh,ai='Resposta do modelo.'){
  const p=control({operation:'prepare',user_message:message,state,quote_state:null},now);
  const r=control({operation:'route',user_message:message,state:p.state,quote_state:null,ai_response:ai},now);
  const x=await call({user_message:message,state:r.state});
  return {states:[p.state,r.state,x.state??r.state],last:x.state??r.state,resolver:x};
}
function instagram(seed=fresh){
  let state=seed;
  return async(message,ai='Resposta do modelo.')=>{
    now+=60000;
    const p=control({operation:'prepare',user_message:message,state,quote_state:null},now);
    const out=await call({user_message:message,state:p.state,ai_response:ai,subscriber_id:'1'},'instagram');
    state=out.state||state;
    return {...out,messages:JSON.parse(out.ig_payload).m};
  };
}

test('saudações e reações são reconhecidas; perguntas não',()=>{
  for(const message of ['Oi','Oii','Olá','Bom dia','Bomm dia','Boa noite','Oi boa tarde','Olá, tudo bem?','Oi, bom dia! Tudo bem?','Opa','Bom dia pessoal','Bom diaaa ☀️'])
    assert.equal(greetingOnly(message),true,message);
  for(const message of ['Ok obrigado !','👍','Obrigada!','ok'])assert.equal(holdReceptionButton(message),true,message);
  for(const message of ['Bom dia, qual o valor da diária?','Oi, quero reservar','Quais os valores do Réveillon?','Tem estacionamento?','Oi tem vaga?','Recepção','Falar com a recepção','Sim','2 adultos','Tudo bem, e o café?'])
    assert.equal(holdReceptionButton(message),false,message);
});

test('WhatsApp: o marcador acompanha o estado em todos os passos da resposta a uma saudação ou reação',async()=>{
  for(const [message,ai] of [['Bom dia','Como posso ajudar?'],['Bomm dia','Como posso ajudar você hoje no Hotel Solar? 😊'],['Oi boa tarde','Como posso ajudar?'],['Ok obrigado !','Por nada!'],['👍','Combinado!'],[sticker,'Combinado!']]){
    const turn=await whatsapp(message,fresh,ai);
    for(const state of turn.states)assert.match(state,HOLD,message);
  }
});

test('WhatsApp: a resposta a uma pergunta não leva o marcador, nem a pergunta que vem depois da saudação',async()=>{
  for(const message of ['Tem estacionamento?','Bom dia, qual o valor da diária?','Quais os valores do Réveillon?','Quero falar com a recepção']){
    const turn=await whatsapp(message);
    for(const state of turn.states)assert.doesNotMatch(state,/reception_button/,message);
  }
  const hello=await whatsapp('Bom dia',fresh,'Como posso ajudar?');
  assert.match(hello.last,HOLD);
  const question=await whatsapp('Tem estacionamento?',hello.last,'Sim, o estacionamento é gratuito.');
  for(const state of question.states)assert.doesNotMatch(state,/reception_button/);
  // Uma reação no meio da conversa volta a segurar o botão só naquele turno.
  const thanks=await whatsapp('Obrigado!',question.last,'Por nada!');
  assert.match(thanks.last,HOLD);
  assert.doesNotMatch((await whatsapp('E o café da manhã?',thanks.last,'Das 7h às 10h.')).last,/reception_button/);
});

test('Instagram: o botão do dia espera a primeira resposta a uma pergunta',async()=>{
  const footer=out=>out.messages.some(m=>m.t==='footer');
  const say=instagram();
  const hello=await say('Boa noite','Como posso ajudar?');
  assert.equal(hello.ig_acao,'RESPOSTA');assert.equal(footer(hello),false);
  const question=await say('Tem estacionamento?','Sim, o estacionamento é gratuito.');
  assert.equal(question.messages.at(-1).t,'footer');
  assert.equal(JSON.parse(question.state).reception_footer_day,'2026-11-12');
  // Já mostrado hoje: as respostas seguintes vão sem o botão.
  assert.equal(footer(await say('E wi-fi?','Sim, gratuito.')),false);
  assert.equal(footer(await say('Obrigado!','Por nada!')),false);
  // Quando a primeira mensagem já é uma pergunta, o botão vem com a resposta.
  assert.equal((await instagram()('Tem estacionamento?','Sim, o estacionamento é gratuito.')).messages.at(-1).t,'footer');
  // No dia seguinte o botão volta, de novo só depois da saudação.
  now=Date.parse('2026-11-13T09:00:00-03:00');
  assert.equal(footer(await say('Bom dia','Como posso ajudar?')),false);
  assert.equal((await say('Qual o horário do check-in?','A partir das 14h.')).messages.at(-1).t,'footer');
});
