import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
process.env.MANYCHAT_API_KEY='unit-test-private-event-only';
const b=await build({stdin:{contents:"export {control,handleConversation} from './api/conversation-control.ts'; export {advanceEvent,readEvent,signEvent,EVENT_TEST_CONTACT} from './utils/eventInquiry.ts'; export {default as resolver} from './api/resolve-package.ts';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'no-event-side-effects',setup(builder){
    builder.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:'export function createClient(){return {from(){throw Error("Unexpected catalog access")}}}'}));
  }}]});
const {control,handleConversation,advanceEvent,readEvent,signEvent,EVENT_TEST_CONTACT,resolver}=await import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString('base64')}`);
const initial={version:2,history:[],facts:{guests:2,extras:[]},greeted:true};
const opening='que eu gostaria de um orçamento para um aniversário. Quero fazer meu aniversário aí.';
function turn(message,state=initial){const p=control({operation:'prepare',user_message:message,state,subscriber_id:EVENT_TEST_CONTACT});const r=control({operation:'route',user_message:message,state:p.state,proposed:'QUOTE|2026-09-11|2026-09-13|25|NONE',ai_response:'O restaurante funciona por ordem de chegada.'});return {...r,parsed:JSON.parse(r.state)};}
async function resolve(message,state){let result;await resolver({method:'POST',body:{user_message:message,state},query:{}},{status(code){assert.equal(code,200);return this},json(v){result=v}});return result;}
function venueState(){let e=advanceEvent(null,opening,EVENT_TEST_CONTACT);e=advanceEvent(e,'12/09/2026',EVENT_TEST_CONTACT);e=advanceEvent(e,'25 pessoas com criança',EVENT_TEST_CONTACT);return {...initial,event:e};}

test('sequência real aceita vinte pessoas, correção para 25 e local sem virar FAQ',async()=>{
  const first=turn(opening);assert.match(first.answer,/data desejada/);
  const second=turn('É pra esse final de semana agora são pra vinte pessoas.',first.state);
  assert.match(second.parsed.event.fields.participantes,/vinte pessoas/);
  assert.match(second.answer,/horário e local/);
  const corrected=turn('25 pessoas com criança',second.state);
  assert.equal(corrected.parsed.event.fields.participantes,'25 pessoas com criança');
  assert.equal(corrected.parsed.event.fields.horario_local,undefined);
  const venue=turn('No reserva solar',corrected.state);
  assert.equal(venue.parsed.event.fields.horario_local,'No reserva solar');
  assert.equal(venue.parsed.guest_inquiry,undefined);
  assert.match(venue.answer,/alimentação.*bebidas/);
  assert.equal(venue.quote_request,'NOQUOTE');assert.equal(venue.can_collect,'NAO');
  assert.deepEqual(venue.parsed.facts,initial.facts);
  const result=await resolve('No reserva solar',venue.state);
  assert.equal(result.conversation_text,venue.answer);
  assert.equal(JSON.parse(result.state).event.status,'collecting');
  assert.doesNotMatch(result.conversation_text,/ordem de chegada|10h|cardápio|encaminhei/);
});

test('resposta de local e alimentação mantém evento assinado e hospedagem separada',async()=>{
  for(const venue of ['No Reserva Solar','Hotel Solar','Ainda a definir','18h às 22h, Reserva Solar']){
    const selected=turn(venue,venueState());
    assert.equal(selected.parsed.event.fields.horario_local,venue==='Ainda a definir'?'A definir':venue);
    const meal=turn('Jantar no restaurante, bebidas e decoração',selected.state);
    assert.equal(meal.parsed.event.fields.servicos,'Jantar no restaurante, bebidas e decoração');
    assert.match(meal.answer,/grupo.*hospedagem/);
    const lodging=turn('Sem hospedagem',meal.state);
    assert.match(lodging.answer,/orçamento.*detalhe/);
    const consent=turn('Sem outras observações',lodging.state);
    assert.equal(consent.parsed.event.status,'consent');
    assert.equal(consent.parsed.event.consent_at,undefined);
    assert.match(consent.answer,/Posso compartilhar/);
    assert.deepEqual(consent.parsed.facts,initial.facts);
    assert.ok(readEvent(consent.parsed.event));
    assert.equal(turn('não',consent.state).parsed.event.status,'cancelled');
  }
});

test('áudio com data e quantidade por extenso passa até a escolha de local',async()=>{
  const source='https://media.example.test/event.ogg';
  const first=turn(opening);
  const prepared=await handleConversation({operation:'prepare',user_message:source,state:first.state,subscriber_id:EVENT_TEST_CONTACT},'',async()=> 'É pra esse final de semana agora são pra vinte pessoas.');
  const routed=control({operation:'route',user_message:source,state:prepared.state});
  assert.match(JSON.parse(routed.state).event.fields.participantes,/vinte pessoas/);
  assert.match(routed.answer,/horário e local/);
});

test('perguntas novas não são gravadas como escolha de local ou serviço',()=>{
  for(const message of ['Qual o horário do Reserva Solar?','Reserva Solar funciona amanhã','Me mande fotos do Reserva Solar','Vocês aceitam pets?','Quero falar com um atendente','Qual o telefone do hotel?']){
    const result=turn(message,venueState());
    assert.notEqual(result.parsed.event?.fields.horario_local,message);
    assert.doesNotMatch(result.answer,/Como você imagina a alimentação/);
  }
  assert.equal(turn('No Reserva Solar',initial).parsed.event,undefined);
  const invalid=venueState();invalid.event.signature='invalid';
  assert.equal(turn('No Reserva Solar',invalid).parsed.event,undefined);
});

test('quantidades por extenso são preservadas inteiras, sem inferir data absoluta',()=>{
  for(const count of ['vinte e cinco pessoas','duzentas e vinte pessoas','cem convidados','mil participantes']){
    const first=turn(opening);
    const next=turn('É para esse final de semana, para '+count,first.state);
    assert.equal(next.parsed.event.fields.participantes,count);
    assert.match(next.parsed.event.fields.data,/esse final de semana/);
    assert.equal(next.parsed.facts.check_in,undefined);
    assert.equal(next.parsed.facts.check_out,undefined);
    assert.match(next.answer,/horário e local/);
  }
});
