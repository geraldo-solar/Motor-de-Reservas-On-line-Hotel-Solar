import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
async function load(path) {
  const bundle=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm'});
  return import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
}
const {updateFamilyParty:update}=await load('utils/familyParty.ts');
const {withAssignedFamilyAgeUnits:assigned}=await load('utils/familyAges.ts');
const now=Date.parse('2026-09-12T15:00:00Z');
const pending={children:3,ages_months:[],clarification:'child_ages',updated_at:now};
const turn=(message,previous,knownTotal)=>update(message,previous?.party||previous,now,knownTotal);

test('casal numeral separado por linha e idades atribuídas recuperam a composição real completa',()=>{
  for(const prefix of ['Somos 1\nCasal','Somos 1 casal','1 casal','Um casal','Somos um\ncasal']) {
    const r=turn(prefix+' e 3 crianças\n1 de 16\n1 de 10\n1 de 8');
    assert.equal(r.guests,5,prefix);assert.equal(r.party.adults,2,prefix);
    assert.equal(r.party.children,3,prefix);assert.deepEqual(r.party.ages_months,[192,120,96],prefix);
    assert.equal(r.children_pending,false,prefix);assert.equal(r.clarification,undefined,prefix);
  }
});

test('lista claramente atribuída aceita anos omitidos somente com família declarada ou pendente',()=>{
  const start=turn('2 adultos e 3 crianças');
  for(const message of ['1 de 16, 1 de 10, 1 de 8','1 de 16 e 1 de 10 e 1 de 8',
    'Uma de dezesseis, uma de dez e uma de oito','Idades: 1 de 16; 1 de 10; 1 de 8']) {
    const r=turn(message,start);
    assert.equal(r.guests,5,message);assert.deepEqual(r.party.ages_months,[192,120,96],message);
    assert.equal(r.children_pending,false,message);
    assert.equal(turn(message).handled,false,message);
  }
  assert.equal(assigned('1 de 16, 1 de 10'),'1 de 16, 1 de 10');
  assert.match(assigned('1 de 16, 1 de 10',true),/16 anos.*10 anos/);
});

test('Nós5 informa total no contexto familiar, não idade ou adultos inventados',()=>{
  for(const message of ['Nós 5','Nós5','Nós somos cinco']) {
    const r=turn(message,pending);
    assert.equal(r.handled,true,message);assert.equal(r.guests,5,message);assert.equal(r.party.total,5,message);
    assert.equal(r.party.adults,undefined,message);assert.equal(r.party.children,3,message);
    assert.deepEqual(r.party.ages_months,[],message);assert.equal(r.children_pending,true,message);
    const completed=turn('1 de 16, 1 de 10, 1 de 8',r);
    assert.equal(completed.guests,5);assert.deepEqual(completed.party.ages_months,[192,120,96]);
    assert.equal(completed.children_pending,false);
    assert.equal(turn(message).handled,false,message);
  }
  const legacy=turn('Nós 5',undefined,5);
  assert.equal(legacy.guests,5);assert.equal(legacy.party.total,5);
  assert.equal(legacy.party.adults,undefined);assert.equal(legacy.party.children,undefined);
  const conflict=turn('Nós 2',pending);
  assert.equal(conflict.guests,undefined);assert.equal(conflict.clarification,'party_composition');
});

test('números soltos, faixas, datas e listas sem atribuição continuam pendentes',()=>{
  for(const message of ['16, 10, 8','16 e 10 e 8','1 de 16','1 de 16 a 18','1 de 16/09, 1 de 10/10',
    '1 de 16 reais, 1 de 10 reais','Quarto 1 de 16, quarto 1 de 10','Nós 5 anos','Nós 5 crianças']) {
    const r=turn(message,pending);
    // Explicit "5 crianças" is a composition update, never a declaration of ages.
    assert.deepEqual(r.party?.ages_months,[],message);
    assert.notEqual(r.children_pending,false,message);
  }
  const bare=turn('5',pending);
  assert.equal(bare.clarification,'age_reference');assert.equal(bare.party.total,undefined);
  const unknownUnits=turn('2 adultos e 2 crianças, uma de 2 e outra de 6');
  assert.deepEqual(unknownUnits.party.ages_months,[]);assert.equal(unknownUnits.children_pending,true);
  const expired=update('1 de 16, 1 de 10, 1 de 8',pending,now+31*60000);
  assert.equal(expired.handled,false);
});

test('categoria Casal não vira composição, e idades dos pais não são atribuídas às crianças',()=>{
  const start=turn('4 adultos e 2 crianças');
  for(const message of ['Quero uma suíte para 1 casal','Quero um quarto para 1\ncasal',
    'Preciso de apartamento para um casal','Casal ou triplo?']) {
    const r=turn(message,start);
    assert.equal(r.handled,false,message);assert.deepEqual(r.party,start.party,message);
  }
  const adultList=turn('2 adultos: 1 de 40, 1 de 42',pending);
  assert.deepEqual(adultList.party.ages_months,[]);assert.equal(adultList.children_pending,true);
});

test('meses explícitos, idades compostas, correção e idempotência permanecem seguros',()=>{
  const r=turn('1 casal e 3 crianças: 1 de 6 meses, 1 de 1 ano e 6 meses, 1 de 8');
  assert.equal(r.guests,5);assert.deepEqual(r.party.ages_months,[6,18,96]);assert.equal(r.children_pending,false);
  const start=turn('2 adultos e 3 crianças');
  const partial=turn('1 de 16, 1 de 10',start);
  assert.equal(partial.children_pending,true);assert.deepEqual(partial.party.ages_months,[192,120]);
  const complete=turn('Na verdade, 1 de 16, 1 de 10, 1 de 8',partial);
  assert.equal(complete.children_pending,false);assert.deepEqual(complete.party.ages_months,[192,120,96]);
  assert.deepEqual(turn('Na verdade, 1 de 16, 1 de 10, 1 de 8',complete),complete);
  const excess=turn('1 de 16, 1 de 10, 1 de 8',turn('1 casal e 2 crianças'));
  assert.equal(excess.children_pending,true);assert.equal(excess.clarification,'child_ages');
  const changed=turn('Não são 4 adultos e 2 crianças, são 1 casal e 3 crianças: 1 de 16, 1 de 10, 1 de 8',start);
  assert.equal(changed.guests,5);assert.deepEqual(changed.party.ages_months,[192,120,96]);
});
