import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['utils/familyParty.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {updateFamilyParty:update,readFamilyParty:read}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const now=Date.parse('2026-09-08T15:00:00Z');
const turn=(message,previous,at=now)=>update(message,previous?.party||previous,at);

test('caso real quatro adultos mais dois grupos infantis resulta em seis, sem classe tarifária por idade',()=>{
  for(const message of ['4 adultos\n1 criança de 13 anos\n1 criança de 5 anos','4adultos\n1criança13anos\n1criança5anos',
    'Qual valor da diária para 4 adultos, 1 criança de 13 anos e 1 criança de 5 anos?']) {
    const r=turn(message);
    assert.equal(r.handled,true,message);assert.equal(r.guests,6,message);
    assert.equal(r.party.adults,4);assert.equal(r.party.children,2);
    assert.deepEqual(r.party.ages_months,[156,60]);assert.equal(r.children_pending,false);
    assert.equal(r.clarification,undefined);
    assert.doesNotMatch(JSON.stringify(r),/pagante|adult_equivalent|pcd|saude|diagnostico/);
  }
});

test('total infantil e descrição das idades não são somados duas vezes',()=>{
  for(const message of ['2 adultos e 2 crianças, uma de 2 anos e outra de 6 anos',
    '2 adultos e 2 crianças de 2 e 6 anos','2 adultos e 2 crianças: 1 criança de 2 anos e 1 criança de 6 anos']) {
    const r=turn(message);assert.equal(r.guests,4,message);assert.equal(r.party.children,2,message);
    assert.deepEqual(r.party.ages_months,[24,72],message);assert.equal(r.children_pending,false,message);
  }
  const unitsMissing=turn('2 adultos e 2 crianças, uma de 2 e outra de 6');
  assert.equal(unitsMissing.guests,4);assert.equal(unitsMissing.party.children,2);
  assert.equal(unitsMissing.children_pending,true);
});

test('duas idades distintas em mensagens separadas mantêm pendência até a outra criança',()=>{
  const start=turn('2 adultos e 2 crianças');
  const first=turn('Uma tem 2 anos',start);
  assert.equal(first.guests,4);assert.equal(first.children_pending,true);
  assert.deepEqual(first.party.ages_months,[24]);
  const second=turn('A outra tem 6 anos',first);
  assert.equal(second.guests,4);assert.equal(second.children_pending,false);
  assert.deepEqual(second.party.ages_months,[24,72]);
});

test('correção substitui composição e não reutiliza idade da criança anterior',()=>{
  const previous=turn('2 adultos e 1 criança de 5 anos');
  const corrected=turn('Na verdade, 1 adulto e 2 crianças',previous);
  assert.equal(corrected.guests,3);assert.equal(corrected.children_pending,true);
  assert.deepEqual(corrected.party.ages_months,[]);
  const first=turn('10 anos',corrected);
  assert.equal(first.guests,3);assert.deepEqual(first.party.ages_months,[120]);
  const bare=turn('14',first);
  assert.equal(bare.handled,true);assert.equal(bare.guests,3);
  assert.equal(bare.children_pending,true);assert.equal(bare.clarification,'age_reference');
  assert.deepEqual(bare.party.ages_months,[120]);
  const explicit=turn('A outra tem 14 anos',bare);
  assert.equal(explicit.guests,3);assert.equal(explicit.children_pending,false);
  assert.deepEqual(explicit.party.ages_months,[120,168]);
});

test('composição adulta explícita nova não herda um total genérico anterior',()=>{
  const previous=turn('3 pessoas');
  const next=turn('Quero reservar hospedagem de 20/09 a 22/09 para 2 adultos',previous);
  assert.equal(next.guests,2);
  assert.equal(next.party.adults,2);
  assert.equal(next.party.total,undefined);
  const explicitConflict=turn('Somos 3 pessoas, 2 adultos e 2 crianças',previous);
  assert.equal(explicitConflict.guests,undefined);
  assert.equal(explicitConflict.clarification,'party_composition');
});

test('meses são idades, e uma idade composta não vira duas crianças',()=>{
  const infant=turn('Um casal e um bebê de 18 meses');
  assert.equal(infant.guests,3);assert.deepEqual(infant.party.ages_months,[18]);
  const compound=turn('2 adultos e 1 criança de 1 ano e 6 meses');
  assert.deepEqual(compound.party.ages_months,[18]);assert.equal(compound.children_pending,false);
  const partial=turn('2 adultos e 2 crianças de 2 anos e 6 meses');
  assert.equal(partial.children_pending,true);assert.deepEqual(partial.party.ages_months,[30]);
});

test('mesma entrada reaplicada é idempotente e não renova o relógio do estado',()=>{
  const initial=turn('2 adultos e 2 crianças');
  const first=turn('Uma tem 2 anos',initial);
  assert.deepEqual(turn('Uma tem 2 anos',first,now+1000),first);
  const second=turn('A outra tem 6 anos',first);
  assert.deepEqual(turn('A outra tem 6 anos',second,now+1000),second);
});

test('números soltos sem família ativa, estado antigo e metadata inválida não fornecem composição',()=>{
  assert.equal(turn('14').handled,false);
  assert.equal(turn('2 e 6 anos').handled,false);
  const initial=turn('2 adultos e 2 crianças');
  assert.equal(turn('A outra tem 6 anos',initial,now+31*60000).handled,false);
  assert.equal(read({...initial.party,updated_at:now+1},now),undefined);
  assert.equal(read({...initial.party,ages_months:[24,72,120]},now),undefined);
  assert.equal(read({...initial.party,ages_months:[-1]},now),undefined);
});

test('nome da Suíte Casal e comparação de acomodações não alteram adultos',()=>{
  const initial=turn('4 adultos e 2 crianças');
  for(const message of ['Quero Suíte Casal','Casal ou triplo?','Quarto casal','Apartamento casal']) {
    const r=turn(message,initial);assert.equal(r.handled,false,message);assert.equal(r.party.adults,4,message);
  }
  assert.equal(turn('Casal').guests,2);
  assert.equal(turn('Casal e uma criança de 5 anos').guests,3);
  assert.equal(turn('2 casais e 1 criança de 9 anos').guests,5);
});

test('casal ligado ao pedido de quarto não substitui a composição, mas declaração separada continua válida',()=>{
  const initial=turn('4 adultos e 2 crianças de 2 e 6 anos');
  for(const message of ['Quero uma suíte para casal','Quero um quarto para um casal','Preciso de apartamento para casal',
    'Quero um quarto para 2 casais']) {
    const r=turn(message,initial);
    assert.equal(r.handled,false,message);
    assert.deepEqual(r.party,initial.party,message);
  }
  for(const message of ['Quero uma suíte. Somos um casal e 1 criança de 5 anos',
    'Quero um quarto, mas somos um casal e uma criança de 5 anos',
    'Somos um casal e uma criança de 5 anos; quero o Loft']) {
    const r=turn(message,initial);
    assert.equal(r.guests,3,message);
    assert.equal(r.party.adults,2,message);
    assert.equal(r.party.children,1,message);
  }
});

test('contraste inequívoco descarta números e idades negados e aplica somente a composição afirmada',()=>{
  const initial=turn('4 adultos e 2 crianças de 2 e 6 anos');
  for(const message of [
    'Não são 4 adultos e 2 crianças de 2 e 6 anos, são 2 adultos e 1 criança de 5 anos',
    'Não somos quatro adultos e duas crianças; somos dois adultos e uma criança de 5 anos',
    'Não são 4 adultos e 2 crianças. Na verdade, são 2 adultos e 1 criança de 5 anos',
  ]) {
    const r=turn(message,initial);
    assert.equal(r.guests,3,message);
    assert.equal(r.party.adults,2,message);
    assert.equal(r.party.children,1,message);
    assert.deepEqual(r.party.ages_months,[60],message);
    assert.equal(r.children_pending,false,message);
    assert.deepEqual(turn(message,r,now+1000),r,message);
  }
});

test('negação sem substituição clara invalida o grupo e pede composição, sem ressuscitar idades anteriores',()=>{
  const initial=turn('4 adultos e 2 crianças de 2 e 6 anos');
  for(const message of ['Não são 4 adultos e 2 crianças','Não são 4 adultos e 2 crianças, são 2',
    'Não são 4 adultos e 2 crianças, são 2 adultos ou 3 adultos',
    'Não são 4 adultos e 2 crianças, são 2 adultos']) {
    const r=turn(message,initial);
    assert.equal(r.handled,true,message);
    assert.equal(r.guests,undefined,message);
    assert.equal(r.clarification,'party_composition',message);
    assert.equal(r.party.adults,undefined,message);
    assert.equal(r.party.children,undefined,message);
    assert.deepEqual(r.party.ages_months,[],message);
    assert.deepEqual(read(r.party,now),r.party,message);
    assert.deepEqual(turn(message,r,now+1000),r,message);
    assert.equal(turn('3 pessoas',r).clarification,'party_composition',message);
    assert.equal(turn('2 adultos e 1 criança de 5 anos',r).guests,3,message);
  }
});

test('pergunta de tarifa ou comparação com adulto não declara novos ocupantes',()=>{
  const initial=turn('2 adultos e 2 crianças');
  for(const message of ['Uma criança de 5 anos não paga?','Minha filha de 9 anos conta como um adulto?','Criança não paga']) {
    const r=turn(message,initial);assert.equal(r.handled,false,message);
    assert.deepEqual(r.party,initial.party,message);
  }
});

test('totais conflitantes ou idade excedente exigem esclarecimento e não geram total novo confiável',()=>{
  const mismatch=turn('Somos 5 pessoas: 4 adultos e 2 crianças');
  assert.equal(mismatch.guests,undefined);assert.equal(mismatch.clarification,'party_composition');
  const unclear=turn('2 adultos e 2 crianças e 1 criança');
  assert.equal(unclear.guests,undefined);assert.equal(unclear.clarification,'party_composition');
  const ages=turn('2 adultos e 1 criança de 2 e 6 anos');
  assert.equal(ages.clarification,'child_ages');assert.equal(ages.children_pending,true);
  for(const message of ['0 pessoas','0 adultos','99 adultos']) {
    const invalid=turn(message);
    assert.equal(invalid.guests,undefined,message);
    assert.equal(invalid.clarification,'party_composition',message);
  }
});

test('correção de uma idade não identificada entre várias exige informar quais idades valem',()=>{
  const initial=turn('2 adultos e 2 crianças de 2 e 6 anos');
  const corrected=turn('Na verdade, ela tem 3 anos',initial);
  assert.equal(corrected.clarification,'age_reference');assert.equal(corrected.children_pending,true);
  assert.deepEqual(corrected.party.ages_months,[]);
});

test('estado guarda somente números e hash, sem texto de diagnóstico ou identidade',()=>{
  const r=turn('4 adultos e 1 criança de 13 anos e 1 criança de 5 anos; observação particular sobre saúde');
  assert.equal(r.guests,6);
  assert.doesNotMatch(JSON.stringify(r.party),/saude|saúde|observacao|observação|particular/);
  assert.equal(r.party.last_message_hash.length,64);
});
