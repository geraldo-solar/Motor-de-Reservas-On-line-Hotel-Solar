import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {build} from 'esbuild';

// Real HTTP handlers/controller with an in-memory catalogue. No provider,
// database, media download, ManyChat or WhatsApp request is allowed.
const now=Date.parse('2026-09-14T10:00:00-03:00');
const originalNow=Date.now,originalFetch=globalThis.fetch;
Date.now=()=>now;
Reflect.set(globalThis,'fetch',async()=>{throw Error('Network forbidden in transport test');});
after(()=>{Date.now=originalNow;Reflect.set(globalThis,'fetch',originalFetch);});
const bundle=await build({stdin:{contents:`
  export {default as conversation,control,handleConversation} from './api/conversation-control.ts';
  export {default as resolver} from './api/resolve-package.ts';
  export * from './utils/manychatText.ts';
  export {queries} from '@supabase/supabase-js';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'text-transport-fixture',setup(b){
    b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'test'}));
    b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`
      export const queries=[];
      export function createClient(){return {from(table){queries.push(table);
        if(!['extras','room_types','packages'].includes(table))throw Error('Unexpected table '+table);
        const q={select(){return q;},eq(){return q;},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);}};return q;
      }};}`}));
  }}]});
const {conversation,control,handleConversation,resolver,withManyChatTextEnvelope,extractManyChatText,
  MANYCHAT_TEXT_LIMIT,MANYCHAT_ENVELOPE_LIMIT,MANYCHAT_ENVELOPE_TTL_MS,queries}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const transport={transport:'manychat-v1'};
const extractor=(req,res)=>conversation({...req,query:{...req.query,operation:'extract-text'}},res);
const initial={version:2,history:[],facts:{extras:[]},greeted:true,assistant_disclosure:{version:1,show:false,rendered:true}};
async function request(handler,body,query={},method='POST') {
  let status,result;const headers={};
  await handler({method,body,query,headers:{}},{status(code){status=code;return this;},json(value){result=value;return value;},setHeader(k,v){headers[k]=v;}});
  return {status,result,headers};
}
function legacyFields(result){const {manychat_payload,has_confirmation_text,has_conversation_text,...legacy}=result;return legacy;}

test('opt-in envelope is nonempty, minimal and leaves original state/text/routes unchanged',()=>{
  const original={quote_request:'ROOM_LIST',conversation_text:'Fotos e informações.\nLinha com "aspas" e ☀️.',confirmation_text:'',
    quote_text:'Não reutilizar este outro campo.',state:'PRIVATE_FIXTURE_STATE',quote_state:'PRIVATE_FIXTURE_QUOTE',can_collect:'NAO'};
  const result=withManyChatTextEnvelope(original,now);
  assert.deepEqual(legacyFields(result),original);assert.equal(result.has_conversation_text,'SIM');assert.equal(result.has_confirmation_text,'NAO');
  const envelope=JSON.parse(result.manychat_payload);
  assert.deepEqual(envelope,{version:1,created_at:now,texts:{conversation_text:original.conversation_text}});
  assert.doesNotMatch(result.manychat_payload,/PRIVATE_FIXTURE|quote_text|can_collect|state/);
  for(const payload of [result.manychat_payload,envelope])
    assert.deepEqual(extractManyChatText(payload,'conversation_text',now),{can_send:'SIM',text:original.conversation_text});
  assert.equal(original.manychat_payload,undefined);
});

test('ROOM_DONE and errors are silent even if an accidental stale text is present',()=>{
  for(const source of [{quote_request:'ROOM_DONE'},{error:'Fixture failure'}]){
    const result=withManyChatTextEnvelope({...source,conversation_text:'STALE_FIXTURE',confirmation_text:'STALE_CONFIRMATION'},now);
    assert.equal(result.has_conversation_text,'NAO');assert.equal(result.has_confirmation_text,'NAO');
    assert.deepEqual(JSON.parse(result.manychat_payload).texts,{});
    assert.deepEqual(extractManyChatText(result.manychat_payload,'conversation_text',now),{can_send:'NAO'});
  }
});

test('extractor accepts only bounded, recent allowlisted nonempty text; never returns authorization',async()=>{
  const envelope={version:1,created_at:now,texts:{confirmation_text:'Resumo da escolha, ainda sem reserva confirmada.'}};
  for(const key of ['state','quote_state','can_collect','quote_text','__proto__','constructor','texts.confirmation_text',null])
    assert.deepEqual(extractManyChatText(envelope,key,now),{can_send:'NAO'});
  for(const payload of [null,[],{},'{bad', ' '.repeat(MANYCHAT_ENVELOPE_LIMIT+1),
    {...envelope,version:2},{...envelope,created_at:now+1},{...envelope,created_at:now-MANYCHAT_ENVELOPE_TTL_MS-1},
    {...envelope,state:'PRIVATE_FIXTURE_STATE'},{...envelope,can_collect:'SIM'},
    {...envelope,texts:{state:'PRIVATE_FIXTURE_STATE'}},{...envelope,texts:[]},
    ...['',' \n\t ','\u200B\u2060',{text:'Não converter objetos'},['Não converter listas'],'x'.repeat(MANYCHAT_TEXT_LIMIT+1)].map(text=>({...envelope,texts:{confirmation_text:text}}))])
    assert.deepEqual(extractManyChatText(payload,'confirmation_text',now),{can_send:'NAO'});
  const full='x'.repeat(MANYCHAT_TEXT_LIMIT),accepted=withManyChatTextEnvelope({conversation_text:full},now);
  assert.equal(accepted.has_conversation_text,'SIM');assert.equal(extractManyChatText(accepted.manychat_payload,'conversation_text',now).text,full);
  assert.equal(withManyChatTextEnvelope({conversation_text:full+'x'},now).has_conversation_text,'NAO');
  const good=await request(extractor,{payload:envelope,key:'confirmation_text',operation:'confirm',state:{pending:{quote_id:'not-authority'}}});
  assert.equal(good.status,200);assert.equal(good.headers['Cache-Control'],'no-store');
  assert.deepEqual(good.result,{can_send:'SIM',text:envelope.texts.confirmation_text});
  assert.equal(good.result.can_collect,undefined);assert.equal(good.result.state,undefined);
  assert.deepEqual((await request(extractor,{payload:envelope,key:'confirmation_text'}, {}, 'GET')).result,{can_send:'NAO'});
});

test('route HTTP defaults remain compatible; absent confirmation maps only flags/envelope for text and audio',async()=>{
  const spoken='Quero hospedagem de 20/09/2026 a 22/09/2026 para três adultos';
  for(const user_message of [spoken,'https://fixture.invalid/current-audio.ogg']){
    const prepared=await handleConversation({operation:'prepare',user_message,state:initial},'',async()=>spoken,now);
    const body={operation:'route',user_message,state:prepared.state,proposed:'QUOTE|2026-09-20|2026-09-22|3|NONE',ai_response:'Resposta fixture.'};
    const ordinary=await request(conversation,body),mapped=await request(conversation,body,transport);
    assert.equal(ordinary.status,200);assert.deepEqual(legacyFields(mapped.result),ordinary.result);
    assert.equal(ordinary.result.manychat_payload,undefined);assert.match(mapped.result.quote_request,/^QUOTE\|/);
    assert.equal(mapped.result.confirmation_text,'');assert.equal(mapped.result.has_confirmation_text,'NAO');
    // UI clears the old destination first, stores only nonempty mapping fields
    // and skips extraction/send when the flag is NAO. No old summary is reused.
    let destination='OLD_SUMMARY_FIXTURE',calls=0;destination='';
    assert.ok(mapped.result.manychat_payload.length);
    if(mapped.result.has_confirmation_text==='SIM'){
      calls++;const extracted=await request(extractor,{payload:JSON.parse(mapped.result.manychat_payload),key:'confirmation_text'});
      if(extracted.result.can_send==='SIM')destination=extracted.result.text;
    }
    assert.equal(calls,0);assert.equal(destination,'');
  }
});

test('COLETAR summary can be extracted without consuming pending; original confirmation still occurs once',async()=>{
  const quote={version:1,id:'quote-fixture',created_at:now,check_in:'2026-09-20',check_out:'2026-09-22',guests:2,extras:[],options:[{name:'Loft',capacity:4,total:1800}]};
  const start=control({operation:'prepare',state:initial,user_message:'Quero hospedagem de 20/09/2026 a 22/09/2026 para duas pessoas'},now);
  const chosen=control({operation:'prepare',state:start.state,user_message:'Quero o Loft',quote_state:quote},now);
  const routed=(await request(conversation,{operation:'route',state:chosen.state,user_message:'Quero o Loft',quote_state:quote},transport)).result;
  assert.equal(routed.quote_request,'COLETAR');assert.equal(routed.can_collect,'NAO');assert.equal(routed.has_confirmation_text,'SIM');
  const previousState=routed.state;
  const extracted=(await request(extractor,{payload:JSON.parse(routed.manychat_payload),key:'confirmation_text'})).result;
  assert.deepEqual(extracted,{can_send:'SIM',text:routed.confirmation_text});assert.match(extracted.text,/Loft/i);
  assert.equal(routed.state,previousState);assert.ok(JSON.parse(routed.state).pending);
  const confirmed=(await request(conversation,{operation:'confirm',state:routed.state,quote_state:quote})).result;
  assert.equal(confirmed.can_collect,'SIM');assert.equal(JSON.parse(confirmed.state).pending,undefined);
  const twice=(await request(conversation,{operation:'confirm',state:confirmed.state,quote_state:quote},transport)).result;
  assert.equal(twice.can_collect,'NAO');assert.equal(twice.has_confirmation_text,'NAO');
});

test('offers ROOM_DONE keeps empty legacy texts, maps a nonempty envelope and performs no catalogue query',async()=>{
  queries.length=0;
  const body={user_message:'Esta é a simulação solicitada, sem disponibilidade confirmada.',state:initial};
  const ordinary=await request(resolver,body,{operation:'offers'});
  const mapped=await request(resolver,body,{operation:'offers',...transport});
  assert.equal(mapped.status,200);assert.deepEqual(legacyFields(mapped.result),ordinary.result);
  assert.equal(mapped.result.quote_request,'ROOM_DONE');assert.equal(mapped.result.conversation_text,'');assert.equal(mapped.result.quote_text,'');
  assert.equal(mapped.result.has_conversation_text,'NAO');assert.deepEqual(JSON.parse(mapped.result.manychat_payload).texts,{});
  assert.deepEqual(queries,[]);
});

test('offers with media extracts exactly the first result without rerunning offers or consuming another page',async()=>{
  queries.length=0;
  const body={user_message:'Também posso mostrar as bicicletas, gratuitas para hóspedes.',state:initial};
  const mapped=(await request(resolver,body,{operation:'offers',...transport})).result;
  assert.match(mapped.quote_request,/^EXTRA_ID\|BIKE\|/);assert.equal(mapped.has_conversation_text,'SIM');assert.deepEqual(queries,['extras']);
  const savedState=mapped.state;
  const extracted=(await request(extractor,{payload:JSON.parse(mapped.manychat_payload),key:'conversation_text'})).result;
  assert.deepEqual(extracted,{can_send:'SIM',text:mapped.conversation_text});
  assert.deepEqual(queries,['extras']);assert.equal(mapped.state,savedState);
  assert.deepEqual(JSON.parse(savedState).extra_photo_requests,['BIKE']);
  assert.equal(extracted.quote_request,undefined);assert.equal(extracted.state,undefined);
});
