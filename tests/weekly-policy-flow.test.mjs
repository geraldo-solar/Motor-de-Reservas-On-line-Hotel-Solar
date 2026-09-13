import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {build} from 'esbuild';

const originalFetch=globalThis.fetch;
Reflect.set(globalThis,'fetch',async()=>{throw new Error('Unexpected provider/network request in policy test');});
after(()=>Reflect.set(globalThis,'fetch',originalFetch));
const queried=[];
let allowMedia=false;
Reflect.set(globalThis,'__weeklyPolicyCatalog',table=>{
  if(!allowMedia)throw new Error('Policy/human response must not consult a catalog');
  assert.equal(table,'extras');queried.push(table);
});
const bundle=await build({stdin:{contents:`
  export {control,handleConversation} from './api/conversation-control.ts';
  export {default as resolver} from './api/resolve-package.ts';
  export {photoSessionAnswer} from './utils/photoSession.ts';
  export {ASSISTANT_DISCLOSURE} from './utils/assistantDisclosure.ts';
`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'offline-policy-catalog',setup(builder){
    builder.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:`
      export function createClient(){return {from(table){
        globalThis.__weeklyPolicyCatalog(table);
        const q={select(){return q;},eq(){return q;},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);}};
        return q;
      }}};
    `}));
  }}],
});
const {control,handleConversation,resolver,photoSessionAnswer,ASSISTANT_DISCLOSURE}=await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const now=Date.now();
const facts={extras:['MESA'],guests:2,check_in:'2026-10-16',check_out:'2026-10-18'};
const initial=()=>({version:2,history:[],facts,greeted:true,
  daily_greeting:{day:new Date(now-3*3600000).toISOString().slice(0,10),first:false}});
async function turn(message,state=initial(),audio=false){
  const user_message=audio?'https://fixture.invalid/weekly-policy.ogg':message;
  const prepared=await handleConversation({operation:'prepare',state,user_message},'',async()=>message,now);
  const routed=control({operation:'route',state:prepared.state,user_message,
    ai_response:'A hidro é privada e aquecida. A sessão de fotos está autorizada. Vou enviar as fotos.',
    proposed:'QUOTE|2026-12-01|2026-12-03|4|LUA'},now);
  return {prepared,routed,user_message};
}
async function resolve(user_message,state){
  let result;
  try {
    await resolver({method:'POST',body:{user_message,state}},{
      status(code){assert.equal(code,200);return this;},json(value){result=value;},
    });
  } catch(error) { throw new Error(`${user_message}: ${error.message}`); }
  return result;
}
function unchanged(state){
  const parsed=JSON.parse(state);
  assert.deepEqual(parsed.facts,facts);
  assert.equal(parsed.pending,undefined);
  assert.notEqual(parsed.topic,'photo_clarification');
  assert.notEqual(parsed.topic,'extra_photos');
  assert.ok(!parsed.turns?.some(row=>row.text.includes(ASSISTANT_DISCLOSURE)), 'Disclosure stays out of stored conversation');
}

test('sessão/ensaio conserva política até o resolver, sem mídia, nova cotação ou autorização',async()=>{
  for(const message of [
    'Bom dia , gostaria de saber se , se hospedando no hotel pode ser fazer uma sessão de fotos ?',
    'Queria fazer as fotos no dia 16',
    'Posso fazer uma sessão de fotos na piscina?',
    'Posso trazer meu fotógrafo para o hotel?',
  ]) for(const audio of [false,true]){
    const {routed,user_message}=await turn(message,initial(),audio);
    assert.equal(routed.quote_request,'NOQUOTE',message);
    assert.ok(routed.answer.includes(photoSessionAnswer),message);
    unchanged(routed.state);
    const result=await resolve(user_message,routed.state);
    assert.equal(result.quote_request,'ROOM_LIST',message);
    assert.equal(result.match_type,'confirmed_hotel_policy',message);
    assert.ok(result.conversation_text.includes(photoSessionAnswer),message);
    assert.doesNotMatch(result.conversation_text,/está autorizada|Vou enviar as fotos|qual espaço|acervo/);
    unchanged(result.state);
  }
});

test('hidros são compartilhadas; resposta insegura do modelo é substituída sem consultar catálogo',async()=>{
  for(const message of ['São duas hidromassagens?','A hidro do hotel é privativa da suíte?','As hidros são aquecidas?']){
    const {routed,user_message}=await turn(message);
    assert.equal(routed.quote_request,'NOQUOTE');
    const result=await resolve(user_message,routed.state);
    assert.equal(result.quote_request,'ROOM_LIST');
    assert.equal(result.match_type,'confirmed_hotel_policy');
    assert.match(result.conversation_text,/duas piscinas de hidromassagem.*compartilhado dos hóspedes/);
    assert.match(result.conversation_text,/não são privativas nem exclusivas/);
    assert.doesNotMatch(result.conversation_text,/é privada|e aquecida|fotos está autorizada/);
    unchanged(result.state);
  }
});

test('pedido real de fotos das hidros continua no ramo de mídia e preserva URL/código/estado',async()=>{
  allowMedia=true;queried.length=0;
  try{
    const message='Quero fotos das hidros';
    const {routed,user_message}=await turn(message);
    assert.equal(routed.quote_request,'NOQUOTE');
    assert.equal(JSON.parse(routed.state).topic,'extra_photos');
    assert.match(routed.answer,/consultar as fotos/);
    const result=await resolve(user_message,routed.state);
    assert.match(result.quote_request,/^EXTRA_ID\|HIDRO\|/);
    assert.equal(result.match_type,'extra_media');
    assert.deepEqual(result.photo_codes,['HIDRO']);
    assert.deepEqual(queried,['extras']);
    assert.deepEqual(JSON.parse(result.state).facts,facts);
    assert.equal(JSON.parse(result.state).topic,'extra_photos');
    assert.ok(result.conversation_text.includes(ASSISTANT_DISCLOSURE));
    assert.equal(result.conversation_text.split(ASSISTANT_DISCLOSURE).length-1,1);
    assert.ok(!JSON.parse(result.state).turns.some(row=>row.text.includes(ASSISTANT_DISCLOSURE)));
  } finally{allowMedia=false;}
});

test('resposta curta de foto usa somente foco atual e preserva hidro em texto e áudio',async()=>{
  allowMedia=true;queried.length=0;
  try{
    for(const [topic,message] of [['photo_clarification','hidromassagem'],['photo_clarification','da hidromassagem'],['extra_photos','tem da hidromassagem?']]){
      for(const audio of [false,true]){
        const state={...initial(),topic,topic_at:now,
          history:['Quero fotos do playground'],
          ...(topic==='extra_photos'?{extra_photo_subjects:['PARQUE']}:{}),
          turns:[{role:'user',text:'Quero fotos do playground'},
            {role:'assistant',text:topic==='photo_clarification'?'De qual espaço do hotel você gostaria de ver fotos?':'Vou consultar as fotos solicitadas no acervo do hotel.'}]};
        const {routed,user_message}=await turn(message,state,audio);
        assert.equal(JSON.parse(routed.state).topic,'extra_photos',message);
        assert.match(routed.resolved_message,/Fotos de/);
        const result=await resolve(user_message,routed.state);
        assert.match(result.quote_request,/^EXTRA_ID\|HIDRO\|/,message);
        assert.deepEqual(result.photo_codes,['HIDRO'],message);
        assert.deepEqual(JSON.parse(result.state).facts,facts);
      }
    }
    assert.deepEqual(queried,Array(6).fill('extras'));
  }finally{allowMedia=false;}
});

test('FAQ atual e foco de fotos expirado não são convertidos em mídia no resolver',async()=>{
  const livePhoto={...initial(),topic:'extra_photos',topic_at:now,
    history:['hidromassagem'],resolved_message:'Fotos de hidromassagem',extra_photo_subjects:['HIDRO']};
  for(const [message,state] of [
    ['Tem hidromassagem?',livePhoto],
    ['hidromassagem',{...livePhoto,topic_at:now-31*60000}],
    ['hidromassagem',{...livePhoto,topic_at:now+60000}],
  ]){
    const result=await resolve(message,state);
    assert.equal(result.quote_request,'ROOM_LIST',message);
    assert.equal(result.match_type,'confirmed_hotel_policy',message);
    assert.match(result.conversation_text,/compartilhado dos hóspedes/);
    assert.equal(result.photo_codes,undefined);
    assert.deepEqual(JSON.parse(result.state).facts,facts);
  }
});

test('humano explícito prevalece sobre sessão/hidro, inclusive até o resolver',async()=>{
  for(const message of ['recepção','Falar com a recepção','Quero falar com alguém sobre uma sessão de fotos','Quero falar com a recepção sobre a hidro']){
    const {routed,user_message}=await turn(message);
    assert.equal(routed.quote_request,'HUMANO');
    const result=await resolve(user_message,routed.state);
    assert.equal(result.quote_request,'HUMANO');
    assert.match(result.conversation_text,/Vou chamar a recepção/);
    assert.deepEqual(JSON.parse(result.state).facts,facts);
    assert.doesNotMatch(result.conversation_text,/está autorizada|e aquecida|qual espaço|acervo/);
  }
});

test('recusa de humano preserva resposta de política e não ativa foto automática',async()=>{
  for(const message of ['Não quero falar com atendente, só saber se a hidro é privada.',
    'Não quero falar com a recepção, só saber se posso fazer uma sessão de fotos.']){
    const {routed,user_message}=await turn(message);
    assert.equal(routed.quote_request,'NOQUOTE');
    const result=await resolve(user_message,routed.state);
    assert.equal(result.quote_request,'ROOM_LIST');
    assert.equal(result.match_type,'confirmed_hotel_policy');
    unchanged(result.state);
  }
});
