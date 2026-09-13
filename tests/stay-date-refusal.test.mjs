import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';

const now=Date.parse('2026-09-13T16:00:00-03:00');
const realNow=Date.now;Date.now=()=>now;after(()=>{Date.now=realNow;});
const bundle=await build({stdin:{contents:`export {control,handleConversation} from './api/conversation-control.ts';export {default as resolver} from './api/resolve-package.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'no-provider',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'blocked',namespace:'blocked'}));b.onLoad({filter:/.*/,namespace:'blocked'},()=>({contents:'export function createClient(){throw Error("Unexpected provider access")}'}));}}]});
const {control,handleConversation,resolver}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const facts={guests:3,extras:[],check_in:'2026-09-20',check_out:'2026-09-22'};
const initial=()=>({version:2,history:[],facts,greeted:true,assistant_disclosure:{version:1,show:false,rendered:true},daily_greeting:{day:'2026-09-13',first:false}});
function turn(message,state=initial(),time=now){
  const p=control({operation:'prepare',user_message:message,state},time);
  const r=control({operation:'route',user_message:message,state:p.state,proposed:'QUOTE|2026-09-20|2026-09-22|3|NONE',ai_response:'Cotação antiga sintética.'},time);
  return {p,r,state:JSON.parse(r.state)};
}
function noDates(result){
  assert.equal(result.state.facts.check_in,undefined);
  assert.equal(result.state.facts.check_out,undefined);
  assert.equal(result.r.quote_request,'NOQUOTE');assert.equal(result.r.can_collect,'NAO');
  assert.equal(result.r.confirmation_text,'');
  assert.match(result.r.answer,/datas|entrada|saída/);
}
test('períodos explicitamente recusados não viram fatos nem cotação',()=>{
  for(const message of ['Quero outro período, mas não de 20/09 a 22/09','Não posso ir de 23 a 25/09',
    'Não posso ir de 20 a 22/09','Essas datas não servem, não posso de 20/09 a 22/09',
    'Essas datas não servem','Não posso ir nessas datas','Não consigo nesse período','Não quero hospedagem de 20/09 a 22/09',
    'Não vou viajar amanhã','De 20/09 a 22/09 não dá']){
    const result=turn(message);noDates(result);
    assert.equal(result.state.stay_date_pending.reason,'rejected_dates',message);
    assert.equal(JSON.parse(result.p.context).cotacao_valida_para_estes_dados,null,message);
    assert.equal(result.state.facts.guests,3);
    assert.match(result.r.answer,/período recusado/);
  }
});
test('período novo afirmativo resolve a recusa sem reutilizar datas antigas',()=>{
  const first=turn('Quero outro período, mas não de 20/09 a 22/09');
  const next=turn('Quero de 23/09 a 25/09',first.r.state);
  assert.equal(next.r.quote_request,'QUOTE|2026-09-23|2026-09-25|3|NONE');
  assert.equal(next.state.stay_date_pending,undefined);
  assert.equal(next.state.facts.guests,3);
});
test('sim, seleção de quarto, modelo e expiração não restauram datas recusadas',()=>{
  const first=turn('Não posso ir de 23 a 25/09');
  for(const message of ['Sim','Quero o loft','Ainda vou decidir'])noDates(turn(message,first.r.state));
  noDates(turn('Quero o loft',first.r.state,now+31*60000));
  noDates(turn('Sim',{...first.state,facts}));
  const remembered=control({operation:'remember_response',state:first.r.state,response_text:'Sua estadia de 20 a 22/09 está confirmada.'},now);
  noDates(turn('Sim',remembered.state));
});
test('negação de mudança e negação de outro assunto não rejeitam período',()=>{
  for(const message of ['Não quero mudar de 20/09 a 22/09','Não mude a saída para 25/09',
    'Quero hospedagem de 20/09 a 22/09 e não quero kit lua de mel',
    'Não quero kit lua de mel, quero hospedagem de 20/09 a 22/09',
    'Não quero ficar no térreo de 20/09 a 22/09',
    'Quero ficar de 20/09 a 22/09, não vou sair do hotel',
    'Quero hospedagem de 20/09 a 22/09, meu cartão não funciona']){
    const result=turn(message);assert.deepEqual(result.state.facts,facts,message);
    assert.equal(result.state.stay_date_pending,undefined,message);
  }
});
test('áudio e resolver preservam pergunta de datas sem tocar catálogo',async()=>{
  const message='Quero outro período, mas não de 20/09 a 22/09',audio='https://fixture.invalid/refusal.ogg';
  const p=await handleConversation({operation:'prepare',user_message:audio,state:initial()},'',async()=>message,now);
  const r=control({operation:'route',user_message:audio,state:p.state,proposed:'QUOTE|2026-09-20|2026-09-22|3|NONE'},now);
  noDates({r,state:JSON.parse(r.state)});
  let resolved;
  const res={status(code){assert.equal(code,200);return this;},json(value){resolved=value;}};
  await resolver({method:'POST',body:{user_message:audio,state:r.state}},res);
  assert.equal(resolved.quote_request,'ROOM_LIST');assert.equal(resolved.match_type,'stay_date_clarification');
  assert.equal(resolved.conversation_text,r.answer);assert.equal(resolved.availability_checked,false);
  await resolver({method:'POST',body:{user_message:resolved.conversation_text,state:resolved.state},query:{operation:'offers'}},res);
  assert.equal(resolved.quote_request,'ROOM_DONE');assert.equal(resolved.availability_checked,false);
});
