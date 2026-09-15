import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
const b=await build({stdin:{contents:`export {updateFamilyParty,readFamilyParty} from './utils/familyParty.ts';export {familyAccommodation} from './utils/familyAccommodation.ts';export {control} from './api/conversation-control.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {updateFamilyParty:update,readFamilyParty:read,familyAccommodation,control}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const now=Date.parse('2026-09-13T10:00:00-03:00');
const initial={version:2,history:[],facts:{extras:[]},greeted:true,
  assistant_disclosure:{version:1,show:false,rendered:true}};
const family=update('2 adultos e 1 criança de 5 anos',undefined,now);
function turn(message,state=initial){
  const p=control({operation:'prepare',user_message:message,state},now);
  const r=control({operation:'route',user_message:message,state:p.state,proposed:'NOQUOTE',ai_response:'Resposta neutra.'},now);
  return {...r,parsed:JSON.parse(r.state),context:JSON.parse(p.context)};
}
const seed=()=>turn('Quero hospedagem para 2 adultos e 1 criança de 5 anos, de 20/09 a 22/09');

test('N-R02: nova viagem individual substitui a família anterior antes de cotar',()=>{
  for(const message of [
    'Quero outra viagem para minha mãe sozinha, só uma pessoa, de 23/09 a 25/09',
    'Quero outra viagem para minha mãe sozinha de 23/09 a 25/09',
    'Quero outra viagem para uma pessoa, de 23/09 a 25/09',
    'Quero outra viagem para 1 hóspede de 23/09 a 25/09',
    'Vou sozinho de 23/09 a 25/09',
  ]){
    const r=turn(message,seed().state);
    assert.equal(r.context.fatos_informados_pelo_cliente.guests,1,message);
    assert.equal(r.quote_request,'QUOTE|2026-09-23|2026-09-25|1|NONE',message);
    assert.equal(r.parsed.facts.children_pending,false,message);
    assert.equal(r.parsed.family_party.children,undefined,message);
    assert.equal(r.parsed.family_party.adults,undefined,message);
    assert.deepEqual(r.parsed.family_party.ages_months,[],message);
    assert.equal(r.parsed.family_clarification,undefined,message);
    const accommodation=familyAccommodation(r.parsed,1,now);
    assert.equal(accommodation.eligible,0,message);assert.equal(accommodation.pending,false,message);
    assert.equal(r.can_collect,'NAO',message);
  }
});

test('singular pessoa/hóspede e declaração direta individual não repetem coleta',()=>{
  for(const phrase of ['uma pessoa','1 pessoa','um hóspede','1 hóspede']){
    const r=turn(`Quero hospedagem para ${phrase} de 23/09 a 25/09`);
    assert.equal(r.quote_request,'QUOTE|2026-09-23|2026-09-25|1|NONE',phrase);
    assert.doesNotMatch(r.answer,/Para quantas pessoas/,phrase);
    assert.equal(update(phrase,family.party,now).guests,1,phrase);
  }
  for(const message of ['Vou sozinha','Sozinha','Minha mãe vai sozinha','Agora é só para mim','Só eu','Só uma pessoa']){
    const r=update(message,family.party,now);
    assert.equal(r.guests,1,message);assert.deepEqual(r.party.ages_months,[],message);
    assert.deepEqual(read(r.party,now),r.party,message);
    assert.deepEqual(update(message,r.party,now+1000),r,message);
  }
});

test('nova viagem solo limpa pendência infantil anterior sem inventar idade ou cortesia',()=>{
  const pending=turn('Quero hospedagem para 2 adultos e 2 crianças de 20/09 a 22/09');
  assert.equal(pending.parsed.facts.children_pending,true);
  const r=turn('Quero outra viagem para minha mãe sozinha, uma pessoa, de 23/09 a 25/09',pending.state);
  assert.equal(r.parsed.facts.guests,1);assert.equal(r.parsed.facts.children_pending,false);
  assert.equal(r.quote_request,'QUOTE|2026-09-23|2026-09-25|1|NONE');
  assert.deepEqual(r.parsed.family_party.ages_months,[]);
});

test('mera mudança de período conserva a família e as idades declaradas',()=>{
  const r=turn('Quero outro período de 23/09 a 25/09',seed().state);
  assert.equal(r.quote_request,'QUOTE|2026-09-23|2026-09-25|3|NONE');
  assert.equal(r.parsed.family_party.adults,2);assert.equal(r.parsed.family_party.children,1);
  assert.deepEqual(r.parsed.family_party.ages_months,[60]);
});

test('negação, hipótese e cotação por pessoa não substituem o grupo por um',()=>{
  for(const message of ['Não vou sozinha','Não é só uma pessoa','Talvez eu vá, só uma pessoa',
    'Se eu for sozinha','E se for só uma pessoa?','Quero saber o valor para uma pessoa?',
    'Qual o preço por pessoa, só uma pessoa?',
    'Cada quarto é para uma pessoa','Não quero outra viagem para minha mãe sozinha',
    'Vou sozinha e minha mãe também','Vou sozinha com minha mãe',
    'Só eu, minha mãe e meu pai']){
    const r=update(message,family.party,now);
    assert.notEqual(r.guests,1,message);
    assert.deepEqual(r.party,family.party,message);
  }
  const couple=update('Só eu e minha esposa',family.party,now);
  assert.equal(couple.guests,2);assert.notEqual(couple.guests,1);
  assert.deepEqual(couple.party.ages_months,[]);
});

test('pessoa singular em composição declarada não apaga criança e idade',()=>{
  const child=update('1 pessoa, 1 criança de 5 anos',undefined,now);
  assert.equal(child.guests,1);assert.equal(child.party.children,1);
  assert.deepEqual(child.party.ages_months,[60]);
  const group=update('Somos 3 pessoas, 2 adultos e 1 criança de 5 anos',undefined,now);
  assert.equal(group.guests,3);assert.deepEqual(group.party.ages_months,[60]);
  const additional=update('Vai mais um adulto',family.party,now);
  assert.equal(additional.guests,4);assert.equal(additional.party.children,1);
  assert.deepEqual(additional.party.ages_months,[60]);
  assert.equal(update('Quero quarto para casal',family.party,now).handled,false);
});
