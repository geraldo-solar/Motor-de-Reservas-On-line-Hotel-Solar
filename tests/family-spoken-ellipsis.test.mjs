import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

// Local parsing and a synthetic transcription only: no provider or network.
const bundle=await build({stdin:{contents:`export {updateFamilyParty} from './utils/familyParty.ts';
  export {withAssignedFamilyAgeUnits,declaredFamilyAges} from './utils/familyAges.ts';
  export {control,handleConversation} from './api/conversation-control.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm'});
const {updateFamilyParty:update,withAssignedFamilyAgeUnits:assigned,declaredFamilyAges:ages,control,handleConversation}=
  await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const now=Date.parse('2026-09-14T16:00:00-03:00');
const pending={adults:2,children:3,total:5,ages_months:[],clarification:'child_ages',updated_at:now};
const message='Um tem dezesseis anos, o outro dez e a outra oito.';

test('fala natural elíptica informa todas as idades sem mudar o grupo e é idempotente',()=>{
  for(const text of [message,'Um tem 16 anos, o outro tem 10 e a outra tem 8.',
    'Uma de dezesseis anos, outra dez e outra oito.',
    'Um tem 16, o outro 10 e a outra 8 anos.',
    'Um tem 16 anos; o outro 10; e a outra 8.',
    'Um tem dezesseis anos\no outro dez\na outra oito']){
    const r=update(text,pending,now);
    assert.equal(r.handled,true,text);assert.equal(r.guests,5,text);
    assert.equal(r.party.adults,2,text);assert.equal(r.party.children,3,text);
    assert.deepEqual(r.party.ages_months,[192,120,96],text);
    assert.equal(r.children_pending,false,text);assert.equal(r.clarification,undefined,text);
    assert.deepEqual(update(text,r.party,now+1000),r,text);
  }
  const r=update('2 adultos e 3 filhos: '+message,undefined,now);
  assert.equal(r.guests,5);assert.deepEqual(r.party.ages_months,[192,120,96]);
});

test('meses explícitos são compartilhados como meses, sem virarem anos ou cortesia presumida',()=>{
  const two={...pending,children:2,total:4};
  for(const text of ['Uma tem seis meses e a outra oito.','Uma tem seis e a outra oito meses.']){
    const r=update(text,two,now);
    assert.deepEqual(r.party.ages_months,[6,8],text);assert.equal(r.guests,4,text);
    assert.equal(r.children_pending,false,text);
  }
  const explicit=update('Um tem um ano e seis meses, o outro dez anos e a outra oito meses.',pending,now);
  assert.deepEqual(explicit.party.ages_months,[18,120,8]);assert.equal(explicit.children_pending,false);
});

test('unidades mistas ou compostas não autorizam completar idades omitidas',()=>{
  for(const text of ['Um tem 16 anos, o outro 10 meses e a outra 8.',
    'Um tem 1 ano e 6 meses, o outro 10 e a outra 8.',
    'Um tem 16, o outro 10 e a outra 8.']){
    assert.equal(assigned(text,true),text,text);
    const r=update(text,pending,now);
    assert.notEqual(r.children_pending,false,text);
    assert.ok((r.party?.ages_months.length||0)<3,text);
  }
});

test('perguntas, negação, hipótese, datas e números de quarto não ganham unidades inventadas',()=>{
  for(const text of [message.replace('.','?'),'Talvez '+message,'Não, '+message,
    'Se um tem 16 anos, o outro 10 e a outra 8.',
    'Quarto um tem 16 anos, o outro 10 e a outra 8.',
    'Um tem 16/09, o outro 10 e a outra 8 anos.',
    'Um tem 16 anos, o outro 10 a 12 e a outra 8.',
    'Um tem 16 anos, o outro 10 reais e a outra 8.']){
    assert.equal(assigned(text,true),text,text);
    const r=update(text,pending,now);
    assert.notEqual(r.children_pending,false,text);
    assert.ok((r.party?.ages_months.length||0)<3,text);
  }
  assert.equal(assigned(message),message);
  assert.equal(update(message,undefined,now).handled,false);
  assert.equal(update(message,{...pending,updated_at:now-31*60000},now).handled,false);
});

test('idade faltante, excedente, inválida e composição conflitante permanecem pendentes',()=>{
  const partial=update('Um tem 16 anos e o outro 10.',pending,now);
  assert.deepEqual(partial.party.ages_months,[192,120]);assert.equal(partial.children_pending,true);
  const excess=update(message,{...pending,children:2,total:4},now);
  assert.equal(excess.clarification,'child_ages');assert.equal(excess.children_pending,true);
  const invalid=update('Um tem 999 anos, o outro 10 e a outra 8.',pending,now);
  assert.equal(invalid.clarification,'child_ages');assert.equal(invalid.children_pending,true);
  const conflict=update(message,{...pending,total:4,clarification:'party_composition'},now);
  assert.equal(conflict.guests,undefined);assert.equal(conflict.clarification,'party_composition');
});

test('áudio transcrito por fixture percorre prepare e route com cinco hóspedes e todas as idades',async()=>{
  const state={version:2,history:['Somos 2 adultos e 3 filhos'],facts:{extras:[],guests:5,children_pending:true},
    family_party:pending,family_clarification:'child_ages',greeted:true,topic:'package_info',topic_at:now,
    package_context:{id:'reveillon-fixture',name:'Réveillon Solar 2027',start_date:'2026-12-31',end_date:'2027-01-03',updated_at:now}};
  const url='https://fixture.invalid/spoken-ages.ogg',token='Bearer fixture-only';
  let calls=0;
  const p=await handleConversation({operation:'prepare',user_message:url,state},token,async(input,authorization)=>{
    calls++;assert.equal(input,url);assert.equal(authorization,token);return message;
  },now);
  assert.equal(calls,1);
  const r=control({operation:'route',user_message:url,state:p.state,proposed:'NOQUOTE',ai_response:'Resposta genérica fixture.'},now);
  const parsed=JSON.parse(r.state);
  assert.deepEqual(parsed.family_party.ages_months,[192,120,96]);assert.equal(parsed.facts.guests,5);
  assert.equal(parsed.facts.children_pending,false);assert.equal(parsed.family_clarification,undefined);
  assert.equal(r.can_collect,'NAO');assert.doesNotMatch(r.answer,/Quais são as idades/);
  assert.equal(parsed.facts.check_in,undefined);assert.equal(parsed.facts.check_out,undefined);
});
