import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const queries = [];
globalThis.__stayDurationResolverQuery = table => queries.push(table);
const fixture = `
  const data = { extras: [{name:'Kit Lua de Mel',price:350,active:true,image_url:'https://fixture.invalid/kit.jpg'}], room_types:[], packages:[] };
  export function createClient() { return {from(table) {
    globalThis.__stayDurationResolverQuery(table);
    const query={select(){return query;},eq(){return query;},then(resolve){return Promise.resolve({data:data[table]||[],error:null}).then(resolve);}};
    return query;
  }}; }
`;
async function load(file) {
  const bundled = await build({entryPoints:[file],bundle:true,write:false,platform:'node',format:'esm',
    define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
    plugins:[{name:'stay-duration-fixture',setup(builder) {
      builder.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
      builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'js'}));
    }}],
  });
  return import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
}
const {control,handleConversation}=await load('api/conversation-control.ts');
const handler=(await load('api/resolve-package.ts')).default;
const now=Date.now();
const initial={version:2,history:[],facts:{guests:2,extras:[]},greeted:true};
const message='Eu queria orçamento de hospedagem para 2 dias, lua de mel, dia 11/10/2027 e dia 12/10/2027';
function turn(input=message,state=initial) {
  const prepared=control({operation:'prepare',user_message:input,state},now);
  const routed=control({operation:'route',user_message:input,state:prepared.state,
    proposed:'QUOTE|2027-10-11|2027-10-12|2|NONE',ai_response:'Vou enviar fotos do kit.'},now);
  return {prepared,routed};
}
async function resolve(input,state,operation) {
  let result;
  await handler({method:'POST',body:{user_message:input,state},...(operation?{query:{operation}}:{})},{
    status(code){assert.equal(code,200);return this;},json(value){result=value;},
  });
  return result;
}

test('caso lua de mel mantém esclarecimento das datas no resolver, antes de extras ou catálogo',async()=>{
  queries.length=0;
  const {routed}=turn();
  assert.equal(routed.quote_request,'NOQUOTE');
  const result=await resolve(message,routed.state);
  assert.equal(result.quote_request,'ROOM_LIST');
  assert.equal(result.match_type,'stay_date_clarification');
  assert.equal(result.conversation_text,routed.answer);
  assert.match(result.conversation_text,/saída.*12\/10\/2027.*13\/10\/2027/);
  assert.doesNotMatch(result.conversation_text,/kit|R\$|fotos/i);
  assert.equal(JSON.parse(result.state).facts.check_out,undefined);
  assert.equal(result.availability_checked,false);
  assert.deepEqual(queries,[]);
});

test('sem resposta atual usa a pendência validada, nunca o texto anterior de uma foto',async()=>{
  const {prepared}=turn();
  const state={...JSON.parse(prepared.state),turns:[
    {role:'user',text:'Fotos do Loft'},
    {role:'assistant',text:'Resposta antiga: foto do Loft.'},
  ]};
  queries.length=0;
  const result=await resolve(message,state);
  assert.equal(result.match_type,'stay_date_clarification');
  assert.match(result.conversation_text,/saída/);
  assert.doesNotMatch(result.conversation_text,/antiga|Loft|foto/i);
  assert.deepEqual(queries,[]);
});

test('pendência expirada ou futura não captura a mensagem atual como esclarecimento ativo',async()=>{
  const {routed}=turn();
  for(const at of [now-31*60000,now+60*60000,0]) {
    queries.length=0;
    const state=JSON.parse(routed.state);
    state.stay_date_pending.at=at;
    const result=await resolve(message,state);
    assert.notEqual(result.match_type,'stay_date_clarification');
    assert.equal(JSON.parse(result.state).stay_date_pending,undefined);
    assert.equal(JSON.parse(result.state).facts.check_out,undefined);
    assert.ok(queries.includes('extras'));
  }
});

test('áudio atual mantém o esclarecimento de duração, sem trocar por foto de lua de mel',async()=>{
  queries.length=0;
  const source='https://media.example.test/duration.ogg';
  const prepared=await handleConversation({operation:'prepare',user_message:source,state:initial},'',async()=>message,now);
  const routed=control({operation:'route',user_message:source,state:prepared.state,proposed:'NOQUOTE',ai_response:'Foto do kit.'},now);
  const result=await resolve(source,routed.state);
  assert.equal(result.match_type,'stay_date_clarification');
  assert.equal(result.conversation_text,routed.answer);
  assert.deepEqual(queries,[]);
});

test('ofertas associadas à resposta atual não substituem uma pendência de datas por extras',async()=>{
  queries.length=0;
  const {routed}=turn();
  const result=await resolve(routed.answer,routed.state,'offers');
  assert.equal(result.quote_request,'ROOM_DONE');
  assert.equal(result.conversation_text,'');
  assert.equal(result.match_type,'stay_date_clarification');
  assert.deepEqual(queries,[]);
});

test('novo pedido explícito de foto encerra pendência e conserva a rota de mídia',async()=>{
  const previous=turn();
  const input='Quero fotos do kit lua de mel';
  const current=turn(input,previous.routed.state);
  assert.equal(JSON.parse(current.routed.state).stay_date_pending,undefined);
  queries.length=0;
  const result=await resolve(input,current.routed.state);
  assert.match(result.quote_request,/^EXTRA_ID\|LUA/);
  assert.notEqual(result.match_type,'stay_date_clarification');
  assert.ok(queries.includes('extras'));
});

test('R06 com data hifenizada não reconhecida limpa viagem antiga e pede dia/mês sem conversão inventada',async()=>{
  const input='Quanto está a diária para entrar dia 26 e sair dia 27-09-2026? 4 adultos';
  for(const facts of [{extras:[]},{guests:2,check_in:'2026-10-20',check_out:'2026-10-25',extras:[]}]) {
    const {routed}=turn(input,{...initial,facts});
    const state=JSON.parse(routed.state);
    assert.equal(routed.quote_request,'NOQUOTE');
    assert.equal(state.facts.guests,4);
    assert.equal(state.facts.check_in,undefined);
    assert.equal(state.facts.check_out,undefined);
    assert.equal(state.stay_date_pending.reason,'unparsed_dates');
    assert.match(routed.answer,/dia\/mês/);
    queries.length=0;
    const result=await resolve(input,routed.state);
    assert.equal(result.match_type,'stay_date_clarification');
    assert.equal(result.conversation_text,routed.answer);
    assert.deepEqual(queries,[]);
  }
});

test('entrada e saída fornecidas após R06 substituem a pendência pelas datas declaradas',()=>{
  const first=turn('Quero orçamento para entrar dia 26 e sair dia 27-09-2026? 4 adultos');
  const next=turn('Entrada 26/09/2026 e saída 27/09/2026',first.routed.state);
  const state=JSON.parse(next.routed.state);
  assert.equal(state.stay_date_pending,undefined);
  assert.equal(next.routed.quote_request,'QUOTE|2026-09-26|2026-09-27|4|NONE');
});
