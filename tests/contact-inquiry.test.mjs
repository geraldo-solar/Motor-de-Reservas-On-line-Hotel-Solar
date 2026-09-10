import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

const queries=[];
globalThis.__contactQueries=queries;
const packages=[
  {id:'finados',name:'Feriado de Finados: 4 Dias em Salinas Pacote com 15% de desconto',active:true,start_iso_date:'2026-10-30',end_iso_date:'2026-11-02'},
  {id:'reveillon',name:'Réveillon Solar 2027: A Virada em Salinas',active:true,start_iso_date:'2026-12-31',end_iso_date:'2027-01-03'},
];
const bundled=await build({stdin:{contents:"export {control,handleConversation} from './api/conversation-control.ts'; export {default as resolve} from './api/resolve-package.ts';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'contact-fixture',setup(b){
    b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'catalog',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:`
      const data={packages:${JSON.stringify(packages)},room_types:[],extras:[]};
      export function createClient(){return {from(table){globalThis.__contactQueries.push(table);const q={select(){return q},eq(){return q},then(fn){return Promise.resolve({data:data[table]||[],error:null}).then(fn)}};return q}}}
    `}));
  }}]});
const {control,handleConversation,resolve}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const initial={version:2,history:[],facts:{guests:2,check_in:'2026-10-20',check_out:'2026-10-22',extras:[]},greeted:true};
async function resolved(message,state,operation){let result;await resolve({method:'POST',query:operation?{operation}:{},body:{user_message:message,state}}, {status(code){assert.equal(code,200);return this},json(v){result=v}});return result}
function turn(message,state=initial){const p=control({operation:'prepare',user_message:message,state});return control({operation:'route',user_message:message,state:p.state,proposed:'QUOTE|2026-10-20|2026-10-22|2|NONE',ai_response:'Infelizmente não posso fornecer o número.'})}

test('pedido real de ligação responde contato oficial, não Finados ou cotação',async()=>{
  for(const message of ['Como faço pra ligar pra falar com vcs','Qual o telefone do hotel?','Qual seu telefone?','Qual o número de vcs?','Me passa o número de vocês','Posso ligar para falar com a recepção?','Qual o telefone para informações do Réveillon?']){
    const routed=turn(message);
    assert.equal(routed.quote_request,'NOQUOTE',message);
    assert.equal(routed.can_collect,'NAO');
    assert.match(routed.answer,/\(91\) 98100-0800/);
    assert.doesNotMatch(routed.answer,/infelizmente|não posso|encaminh|Finados/i);
    queries.length=0;
    const result=await resolved(message,routed.state);
    assert.equal(result.quote_request,'ROOM_LIST');
    assert.equal(result.match_type,'hotel_contact');
    assert.equal(result.conversation_text,routed.answer);
    assert.deepEqual(queries,[]);
    assert.deepEqual(JSON.parse(result.state).facts,initial.facts);
    assert.equal(JSON.parse(result.state).package_context,undefined);
    assert.equal((await resolved(result.conversation_text,result.state,'offers')).quote_request,'ROOM_DONE');
  }
});

test('resolver direto não depende da resposta equivocada do modelo nem de estado antigo',async()=>{
  for(const state of [undefined,initial,{...initial,topic:'package_info',topic_at:Date.now(),package_context:{id:'finados',name:packages[0].name,start_date:'2026-10-30',end_date:'2026-11-02',updated_at:Date.now()}}]){
    const result=await resolved('Como faço pra ligar pra falar com vcs',state);
    assert.equal(result.match_type,'hotel_contact');
    assert.match(result.conversation_text,/98100-0800/);
    assert.equal(JSON.parse(result.state).package_context,undefined);
  }
});

test('áudio transcrito conserva pedido de telefone',async()=>{
  const source='https://media.example.test/contact.ogg';
  const p=await handleConversation({operation:'prepare',user_message:source,state:initial},'',async()=> 'Como faço pra ligar pra falar com vcs');
  const r=control({operation:'route',user_message:source,state:p.state,ai_response:'Não posso fornecer o número.'});
  const result=await resolved(source,r.state);
  assert.equal(result.match_type,'hotel_contact');
  assert.match(result.conversation_text,/98100-0800/);
});

test('palavras comuns não identificam pacote; nomes e datas continuam identificando',async()=>{
  for(const message of ['Gostaria de conversar com vocês','Tudo certo com vcs?','E sem desconto?']){
    const result=await resolved(message);
    assert.equal(result.matched,false,message);
    assert.doesNotMatch(result.quote_request,/PACKAGE/);
  }
  for(const [message,id] of [['do Finados','finados'],['do reveillon','reveillon'],['pacote 30 de outubro','finados']]){
    assert.equal((await resolved(message)).quote_request,`PACKAGE_ID|${id}`);
  }
});

test('ligar equipamento, número de apartamento e pedido humano não viram telefone do hotel',()=>{
  for(const message of ['Como faço para ligar o frigobar?','Qual o número do apartamento?','Meu telefone mudou','Me ligue por favor','Quero falar com um atendente','Me envie fotos do telefone do quarto']){
    assert.doesNotMatch(turn(message).answer,/98100-0800/,message);
  }
  assert.equal(turn('Quero falar com um atendente').quote_request,'HUMANO');
  assert.equal(turn('Não quero informar meu telefone').quote_request,'HUMANO');
});

test('pedido de contato não guarda dados pessoais acrescentados pelo cliente',()=>{
  const message='Qual o telefone do hotel? Meu e-mail é cliente@example.test';
  const p=control({operation:'prepare',user_message:message,state:initial});
  assert.doesNotMatch(p.state+p.context,/cliente@example/);
  assert.match(turn(message).answer,/98100-0800/);
});
