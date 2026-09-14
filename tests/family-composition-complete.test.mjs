import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

// Pure family parser and existing controller, no providers or production calls.
const b=await build({stdin:{contents:`export {updateFamilyParty,readFamilyParty} from './utils/familyParty.ts';export {control} from './api/conversation-control.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {updateFamilyParty:update,readFamilyParty:read,control}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const now=Date.parse('2026-09-14T12:42:00-03:00');
const previous={total:2,ages_months:[],updated_at:now};
const literal='No meu caso para o réveillon somos 5 pessoas.\n1 casal mais 3 filhos\n1 tem 8 anos\n1 tem 10 anos\n1 tem 16 anos\nDão todos em um apto?';
const family=(message,old=previous,time=now)=>update(message,old,time);

test('Inbox 14/09: casal mais três filhos declara cinco ocupantes e todas as idades',()=>{
  for(const old of [null,previous,family('2 adultos e 1 criança de 5 anos',null).party]){
    const r=family(literal,old);
    assert.equal(r.handled,true);assert.equal(r.guests,5);
    assert.equal(r.party.total,5);assert.equal(r.party.adults,2);assert.equal(r.party.children,3);
    assert.equal(r.party.age_subject,'offspring');
    assert.deepEqual(r.party.ages_months,[96,120,192]);
    assert.equal(r.children_pending,false);assert.equal(r.clarification,undefined);
    assert.deepEqual(read(r.party,now),r.party);
    assert.deepEqual(family(literal,r.party,now+1000),r);
  }
});

test('composição com casal mais filhos equivale a casal e filhos, sem herdar criança antiga',()=>{
  const old=family('2 adultos e 1 criança de 5 anos',null).party;
  for(const message of [
    literal,
    'Somos um casal mais 3 filhos de 8, 10 e 16 anos. Cabem em um apartamento?',
    'Quero hospedagem para um casal mais 3 filhos de 8, 10 e 16 anos',
    'Um casal mais 3 filhos de 8, 10 e 16 anos',
    'No nosso caso somos 5 pessoas: um casal mais 3 filhos de 8, 10 e 16 anos',
  ]){
    const actual=family(message,old),expected=family(message.replace('mais 3 filhos','e 3 filhos'),old);
    assert.equal(actual.guests,5,message);
    assert.equal(actual.guests,expected.guests,message);
    assert.deepEqual(actual.party.ages_months,expected.party.ages_months,message);
    assert.equal(actual.party.children,expected.party.children,message);
    assert.equal(actual.clarification,undefined,message);
  }
  const plural=family('Somos 5 pessoas: 2 casais mais 1 filho de 8 anos',old);
  assert.equal(plural.guests,5);assert.equal(plural.party.adults,4);
  assert.equal(plural.party.children,1);assert.deepEqual(plural.party.ages_months,[96]);
});

test('adição incremental real mantém os ocupantes anteriores e continua idempotente',()=>{
  const old=family('2 adultos e 2 crianças de 8 e 10 anos',null).party;
  for(const message of ['Vai mais um bebê de 1 ano','Inclua uma criança de 1 ano','Acrescenta 1 criança de 1 ano']){
    const r=family(message,old);
    assert.equal(r.guests,5,message);assert.equal(r.party.children,3,message);
    assert.deepEqual(r.party.ages_months,[96,120,12],message);
    assert.deepEqual(family(message,r.party,now+1000),r,message);
  }
  const adult=family('Vai mais um adulto',old);
  assert.equal(adult.guests,5);assert.equal(adult.party.adults,3);
  assert.deepEqual(adult.party.ages_months,[96,120]);
  const ambiguous=family('Vai mais uma criança de 1 ano?',old);
  assert.equal(ambiguous.guests,undefined);assert.equal(ambiguous.clarification,'party_composition');
  assert.deepEqual(ambiguous.party.ages_months,[96,120]);
});

test('hipótese ou negação de composição não vira uma declaração confirmada',()=>{
  const old=family('2 adultos e 1 criança de 5 anos',null).party;
  for(const message of [
    'E se formos um casal mais 3 filhos de 8, 10 e 16 anos?',
    'Talvez seja um casal mais 3 filhos de 8, 10 e 16 anos',
    'Caso sejamos um casal mais 3 filhos de 8, 10 e 16 anos',
    'Poderia ser um casal mais 3 filhos de 8, 10 e 16 anos?',
    'Não é um casal mais 3 filhos de 8, 10 e 16 anos',
    'Um casal mais 3 filhos de 8, 10 e 16 anos, talvez',
  ]){
    const r=family(message,old);
    assert.equal(r.guests,undefined,message);
    assert.equal(r.clarification,'party_composition',message);
    assert.equal(r.party.adults,old.adults,message);assert.equal(r.party.children,old.children,message);
    assert.deepEqual(r.party.ages_months,old.ages_months,message);
  }
});

test('total conflitante, idade faltante e idade excedente continuam bloqueados',()=>{
  const conflict=family(literal.replace('somos 5 pessoas','somos 4 pessoas'));
  assert.equal(conflict.guests,undefined);assert.equal(conflict.clarification,'party_composition');
  const missing=family(literal.replace('1 tem 16 anos\n',''));
  assert.equal(missing.guests,5);assert.equal(missing.children_pending,true);
  assert.deepEqual(missing.party.ages_months,[96,120]);
  const extra=family(literal.replace('1 tem 16 anos','1 tem 16 anos\n1 tem 18 anos'));
  assert.equal(extra.clarification,'child_ages');assert.equal(extra.children_pending,true);
});

test('prepare recebe composição correta antes de resolver pergunta do pacote',()=>{
  const state={version:2,history:['É apto para 2 pessoas'],facts:{extras:[],guests:2},greeted:true,
    family_party:previous,topic:'package_info',topic_at:now,
    package_context:{id:'reveillon',name:'Réveillon Solar 2027',start_date:'2026-12-31',end_date:'2027-01-03',updated_at:now}};
  const p=control({operation:'prepare',user_message:literal,state},now);
  const actual=JSON.parse(p.state),context=JSON.parse(p.context);
  assert.equal(actual.facts.guests,5);assert.equal(actual.facts.children_pending,false);
  assert.equal(actual.family_party.adults,2);assert.equal(actual.family_party.children,3);
  assert.deepEqual(actual.family_party.ages_months,[96,120,192]);
  assert.equal(actual.family_clarification,undefined);
  assert.equal(context.composicao_familiar_informada.filhos,3);
  assert.deepEqual(context.composicao_familiar_informada.idades_em_meses,[96,120,192]);
  assert.equal(actual.facts.check_in,undefined);assert.equal(actual.facts.check_out,undefined);
});

test('lista completa responde às idades pendentes sem alterar total, adultos ou filhos',()=>{
  const pending=family('No Réveillon somos 5 pessoas: 2 adultos e 3 crianças. Cabem em um apartamento?');
  assert.equal(pending.children_pending,true);assert.deepEqual(pending.party.ages_months,[]);
  for(const text of ['8, 10 e 16','8, 10, 16','8 e 10 e 16','oito, dez e dezesseis','8, 10 e 16.']){
    const r=family(text,pending.party);
    assert.equal(r.handled,true,text);assert.equal(r.guests,5,text);
    assert.equal(r.party.adults,2,text);assert.equal(r.party.children,3,text);
    assert.deepEqual(r.party.ages_months,[96,120,192],text);
    assert.equal(r.children_pending,false,text);assert.equal(r.clarification,undefined,text);
    assert.deepEqual(family(text,r.party,now+1000),r,text);
  }
  const partial=family('Uma tem 8 anos',pending.party);
  assert.equal(partial.children_pending,true);assert.deepEqual(partial.party.ages_months,[96]);
  const complete=family('8, 10 e 16',partial.party);
  assert.deepEqual(complete.party.ages_months,[96,120,192]);assert.equal(complete.guests,5);
});

test('números sem contexto completo, datas, lista parcial e hipótese não se tornam idades',()=>{
  const pending=family('2 adultos e 3 crianças').party;
  for(const text of ['8','8, 10','8, 10, 16, 18','8/10/16','18/09 a 20/09','8 a 10 e 16',
    'Talvez 8, 10 e 16','8, 10 e 16?','Não, 8, 10 e 16','Quarto 8, 10 e 16','8, 10 e 16 reais']){
    const r=family(text,pending);
    assert.deepEqual(r.party.ages_months,[],text);assert.equal(r.party.adults,2,text);
    assert.equal(r.party.children,3,text);assert.notEqual(r.children_pending,false,text);
  }
  for(const old of [undefined,{children:3,ages_months:[],updated_at:now},
    {...pending,total:4,clarification:'party_composition'},
    {...pending,total:4,clarification:undefined},
    {...pending,updated_at:now-31*60000}]){
    const r=update('8, 10 e 16',old,now);
    assert.notEqual(r.children_pending,false);assert.deepEqual(r.party?.ages_months||[],[]);
  }
  const completed=family('8, 10 e 16',pending).party;
  const unrelated=family('9, 11 e 17',completed);
  assert.equal(unrelated.handled,false);assert.deepEqual(unrelated.party.ages_months,[96,120,192]);
});

test('unidades explícitas e guarda de idades inválidas seguem preservadas',()=>{
  const pending=family('2 adultos e 3 crianças').party;
  const months=family('8, 10 e 16 meses',pending);
  assert.deepEqual(months.party.ages_months,[8,10,16]);assert.equal(months.children_pending,false);
  const invalid=family('8, 10 e 999',pending);
  assert.equal(invalid.clarification,'child_ages');assert.equal(invalid.children_pending,true);
  assert.deepEqual(invalid.party.ages_months,[]);
});
