import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
const now=Date.parse('2026-09-12T11:19:00-03:00');
const realNow=Date.now;Date.now=()=>now;
const b=await build({stdin:{contents:`export {control,handleConversation} from './api/conversation-control.ts';export {default as resolver} from './api/resolve-package.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://example.test"','process.env.VITE_SUPABASE_ANON_KEY':'"synthetic"'},
  plugins:[{name:'no-network',setup(build){build.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'blocked',namespace:'blocked'}));build.onLoad({filter:/.*/,namespace:'blocked'},()=>({contents:'export function createClient(){throw Error("Unexpected provider access")}'}));}}]});
const {control,handleConversation,resolver}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const initial={version:2,history:[],facts:{guests:5,extras:[],check_in:'2026-09-12',check_out:'2026-09-14',children_pending:true},greeted:true,
  family_party:{adults:2,children:3,total:5,ages_months:[],updated_at:now}};
const family='Somos 1\nCasal e 3 crianças\n1 de 16\n1 de 10\n1 de 8';
const unsafe='Posso simular as mesmas opções? Sua reserva já está confirmada. Informe o CPF.';
function turn(user_message,state=initial,time=now){
  const p=control({operation:'prepare',user_message,state},time);
  const r=control({operation:'route',user_message,state:p.state,proposed:'QUOTE|2026-09-12|2026-09-14|5|NONE',ai_response:unsafe},time);
  return {p,r,state:JSON.parse(r.state)};
}
async function resolve(user_message,state,operation){let status,result;await resolver({method:'POST',body:{user_message,state},query:operation?{operation}:{}},
  {status(value){status=value;return this},json(value){result=value;return value}});assert.equal(status,200);return result;}

test('sequência da manhã corrige assunto, registra família, confirma só saída e encaminha sem loop',async()=>{
  const restaurant=turn('O Reserva vai funcionar hj?');
  assert.match(restaurant.r.answer,/Restaurante Reserva Solar/);
  assert.deepEqual(restaurant.state.facts,initial.facts);
  const hours=await resolve('O Reserva vai funcionar hj?',restaurant.r.state);
  assert.match(hours.conversation_text,/10h.*18h/);
  const date=turn('Qual o valor da diária para hj?',restaurant.r.state);
  assert.equal(date.state.facts.check_in,'2026-09-12');assert.equal(date.state.facts.check_out,undefined);
  assert.match(date.r.answer,/Mantém a saída em 14\/09\/2026/);
  const group=turn(family,date.r.state);
  assert.equal(group.state.facts.guests,5);assert.equal(group.state.family_party.adults,2);
  assert.deepEqual(group.state.family_party.ages_months,[192,120,96]);
  assert.equal(group.state.facts.children_pending,false);
  assert.doesNotMatch(group.r.answer,/quantas pessoas|idades das crianças/);
  const total=turn('Nós 5',group.r.state);
  assert.equal(total.state.facts.guests,5);
  const confirmed=turn('Sim',total.r.state);
  assert.equal(confirmed.state.facts.check_out,'2026-09-14');
  assert.equal(confirmed.state.multi_room.status,'offered');
  assert.match(confirmed.r.answer,/dois apartamentos.*Posso chamar/s);
  assert.notEqual(confirmed.r.quote_request,'HUMANO');
  const offered=await resolve('Sim',confirmed.r.state);
  assert.notEqual(offered.quote_request,'HUMANO');
  assert.match(offered.conversation_text,/Posso chamar/);
  const accepted=turn('Sim',offered.state);
  assert.equal(accepted.r.quote_request,'HUMANO');assert.equal(accepted.r.can_collect,'NAO');
  const final=await resolve('Sim',accepted.r.state);
  assert.equal(final.quote_request,'HUMANO');assert.match(final.conversation_text,/Vou chamar a recepção/);
  assert.doesNotMatch(final.conversation_text,/Posso simular|confirmada|CPF/);
});

test('oferta de dois apartamentos é determinística e não depende do texto do modelo',async()=>{
  const offered=turn(family);
  assert.equal(offered.state.multi_room.status,'offered');
  const final=await resolve(family,offered.r.state);
  assert.match(final.conversation_text,/dois apartamentos/);
  const extras=await resolve(final.conversation_text,final.state,'offers');
  assert.equal(extras.quote_request,'ROOM_DONE');
  const remembered=control({operation:'remember_response',state:final.state,response_text:'Para quantas pessoas?'});
  assert.equal(JSON.parse(remembered.state).awaiting,undefined);
});

test('um sim sem oferta, fora da validade ou após mudança de assunto não chama o humano',()=>{
  const offered=turn(family);
  for(const state of [initial,{...offered.state,multi_room:undefined}]){
    const p=control({operation:'prepare',user_message:'Sim',state},now);
    const r=control({operation:'route',user_message:'Sim',state:p.state,proposed:'NOQUOTE',ai_response:'Como posso ajudar?'},now);
    assert.notEqual(r.quote_request,'HUMANO');
  }
  const expired=turn('Sim',offered.r.state,now+31*60000);
  assert.notEqual(expired.r.quote_request,'HUMANO');
  const faq=turn('O Reserva abre hoje?',offered.r.state);
  assert.equal(faq.state.multi_room,undefined);
  assert.notEqual(turn('Sim',faq.r.state).r.quote_request,'HUMANO');
});

test('recusa não encaminha e alteração de família invalida a proposta',()=>{
  const offered=turn(family);
  const declined=turn('Não',offered.r.state);
  assert.equal(declined.r.quote_request,'NOQUOTE');assert.match(declined.r.answer,/não vou solicitar/);
  const changed=turn('Na verdade somos um casal e uma criança de 5 anos',offered.r.state);
  assert.equal(changed.state.multi_room,undefined);assert.equal(changed.state.facts.guests,3);
  assert.notEqual(changed.r.quote_request,'HUMANO');
});

test('saída candidata exige pergunta do controlador; recusa e data explícita não assumem checkout',()=>{
  const p=control({operation:'prepare',user_message:'Qual a diária para hj?',state:initial},now);
  const noQuestion=control({operation:'prepare',user_message:'Sim',state:p.state},now);
  assert.equal(JSON.parse(noQuestion.state).facts.check_out,undefined);
  const shown=turn('Qual a diária para hj?');
  const declined=turn('Não',shown.r.state);
  assert.equal(declined.state.facts.check_out,undefined);
  assert.equal(declined.state.stay_date_pending.suggested_check_out,undefined);
  const changed=turn('13/09',shown.r.state);
  assert.equal(changed.state.facts.check_out,'2026-09-13');
  assert.equal(changed.state.stay_date_pending,undefined);
});

test('áudio sintético mantém composição e saída, sem transcrição externa',async()=>{
  const url='https://media.example.test/family.ogg';
  const p=await handleConversation({operation:'prepare',user_message:url,state:initial},'',async()=>family,now);
  const r=control({operation:'route',user_message:url,state:p.state,proposed:'NOQUOTE',ai_response:unsafe},now);
  const state=JSON.parse(r.state);
  assert.equal(state.facts.guests,5);assert.deepEqual(state.family_party.ages_months,[192,120,96]);
  assert.equal(state.multi_room.status,'offered');
});
test.after(()=>{Date.now=realNow;});
