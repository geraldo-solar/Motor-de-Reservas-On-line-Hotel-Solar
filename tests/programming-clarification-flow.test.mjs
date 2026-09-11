import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const now = Date.parse('2026-09-11T16:00:00-03:00');
const realNow = Date.now;
const realFetch = globalThis.fetch;
Date.now = () => now;
process.env.SUPABASE_URL = 'https://test.invalid';
process.env.SUPABASE_ANON_KEY = 'synthetic-only';
// Avoid assigning an inferred () => Promise<never> declaration to the global
// fetch symbol when the deployment compiler includes allowJs test files.
Reflect.set(globalThis, 'fetch', async () => { throw new Error('Offline regression must not send a request'); });
const pkg = {id:'criancas',name:'Dia das Crianças',start_iso_date:'2026-10-09',end_iso_date:'2026-10-12',active:true,includes:['Café da manhã']};
const bundled = await build({stdin:{contents:`export { control, handleConversation } from './api/conversation-control.ts'; export { default as resolver } from './api/resolve-package.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'catalog-fixture',setup(b){
    b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'test'}));
    b.onLoad({filter:/.*/,namespace:'test'},()=>({loader:'js',contents:`export function createClient(){return {from(table){return {select(){return this},eq(){return Promise.resolve({data:table==='packages'?[${JSON.stringify(pkg)}]:[],error:null})}}}}}` }));
  }}]});
const {control,handleConversation,resolver}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const facts={guests:2,check_in:'2026-10-09',check_out:'2026-10-12',extras:[]};
const initial={version:2,history:[],facts,greeted:true,topic:'package_info',topic_at:now,
  package_context:{id:pkg.id,name:pkg.name,start_date:pkg.start_iso_date,end_date:pkg.end_iso_date,updated_at:now}};
const unsafe='A programação é do pacote de outubro, já está confirmada.';
async function turn(message,state=initial,audio=false){
  const user_message=audio?'https://test.invalid/programming.ogg':message;
  const p=await handleConversation({operation:'prepare',state,user_message},'',async()=>message,now);
  const r=control({operation:'route',state:p.state,user_message,ai_response:unsafe,proposed:'QUOTE|2026-10-09|2026-10-12|2|NONE'},now);
  let result,status;
  await resolver({method:'POST',body:{user_message,state:r.state},query:{}},
    {status(code){status=code;return this},json(value){result=value;return value}});
  assert.equal(status,200);
  return {p,r,result,state:JSON.parse(result.state)};
}

test('pergunta ambígua chega intacta à resposta final, tanto texto como áudio',async()=>{
  for(const audio of [false,true]){
    const {p,r,result,state}=await turn('Qual a programação de sábado?',initial,audio);
    assert.match(JSON.parse(p.context).esclarecimento_programacao,/sábado do pacote.*próximo sábado/);
    assert.equal(result.match_type,'programming_clarification');
    assert.match(result.conversation_text,/sábado do pacote.*próximo sábado/);
    assert.equal(r.can_collect,'NAO');
    assert.deepEqual(state.facts,facts);
    assert.ok(state.programming_pending);
    assert.equal(state.package_context.id,pkg.id);
    assert.doesNotMatch(result.conversation_text,/já está confirmada|12\/09|10\/10/);
  }
});

test('escolhas seguinte, data e pacote completam a pergunta sem alterar a hospedagem',async()=>{
  const first=await turn('Qual a programação de sábado?');
  for(const reply of ['o próximo','próximo sábado','12/09','dia 12/09/2026']){
    const next=await turn(reply,first.result.state);
    assert.equal(next.result.match_type,'public_programming',reply);
    assert.match(next.result.conversation_text,/12\/09\/2026/);
    assert.equal(next.state.package_context,undefined);
    assert.equal(next.state.programming_pending,undefined);
    assert.deepEqual(next.state.facts,facts);
    assert.doesNotMatch(next.result.conversation_text,/outubro|10\/10|já está confirmada/);
  }
  const same=await turn('do pacote',first.result.state);
  assert.equal(same.result.match_type,'package_followup');
  assert.equal(same.state.package_context.id,pkg.id);
  assert.equal(same.state.programming_pending,undefined);
  assert.deepEqual(same.state.facts,facts);
});

test('sim, número e data inválida repetem a pergunta sem escolher uma das alternativas',async()=>{
  const first=await turn('Qual a programação de sábado?');
  for(const reply of ['sim','não','2','31/02']){
    const next=await turn(reply,first.result.state);
    assert.equal(next.result.match_type,'programming_clarification',reply);
    assert.match(next.result.conversation_text,/sábado do pacote.*próximo sábado/);
    assert.deepEqual(next.state.facts,facts);
  }
});

test('novo assunto remove a pendência; estados expirados não resolvem a escolha antiga',async()=>{
  const first=await turn('Qual a programação de sábado?');
  for(const message of ['Qual o cardápio do Reserva Solar?','Já fiz o pagamento','Preciso de limpeza no meu quarto','Humano']){
    const p=control({operation:'prepare',state:first.result.state,user_message:message},now);
    const state=JSON.parse(p.state);
    assert.equal(state.programming_pending,undefined,message);
    assert.equal(state.package_context,undefined,message);
    assert.deepEqual(state.facts,facts);
  }
  const expired=control({operation:'prepare',state:first.result.state,user_message:'o próximo'},now+31*60000);
  assert.equal(JSON.parse(expired.state).programming_pending,undefined);
  assert.equal(JSON.parse(expired.state).package_context,undefined);
  assert.equal(JSON.parse(expired.state).resolved_message,'o próximo');
});

test('pergunta com dados pessoais guarda somente o dia da semana, inclusive no novo marcador',()=>{
  const message='Qual a programação de sábado? Meu CPF 12345678900 email teste@example.com';
  const p=control({operation:'prepare',state:initial,user_message:message},now);
  assert.doesNotMatch(p.state+p.context,/12345678900|teste@example.com/);
  assert.match(JSON.parse(p.state).programming_pending.question,/programação de sabado/);
});

test.after(()=>{Date.now=realNow;Reflect.set(globalThis,'fetch',realFetch);});
