import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
const bundled=await build({entryPoints:['api/conversation-control.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {control}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const now=Date.parse('2026-09-08T15:00:00Z');
function turn(message,state,at=now) {
  const prepared=control({operation:'prepare',user_message:message,state},at);
  return control({operation:'route',user_message:message,state:prepared.state,ai_response:'Resposta informativa.',proposed:'QUOTE|2026-10-11|2026-10-13|2|NONE'},at);
}
const facts=result=>JSON.parse(result.state).facts;

test('grupos infantis em linhas separadas contam todos os ocupantes',()=>{
  const result=turn('Quero hospedagem de 11/10 a 13/10. 4 adultos\n1 criança de 13 anos\n1 criança de 5 anos');
  assert.equal(facts(result).guests,6);
  assert.equal(facts(result).children_pending,false);
  assert.equal(result.can_collect,'NAO');
  assert.doesNotMatch(result.quote_request,/\|[245]\|NONE$/);
});

test('uma idade não encerra a pendência de duas crianças',()=>{
  const first=turn('Quero hospedagem de 11/10 a 13/10 para 2 adultos e 2 crianças');
  assert.equal(facts(first).guests,4);
  assert.equal(facts(first).children_pending,true);
  const second=turn('Uma tem 2 anos',first.state);
  assert.equal(facts(second).guests,4);
  assert.equal(facts(second).children_pending,true);
  assert.equal(second.quote_request,'NOQUOTE');
  const third=turn('A outra tem 6 anos',second.state);
  assert.equal(facts(third).guests,4);
  assert.equal(facts(third).children_pending,false);
  assert.match(third.quote_request,/^QUOTE\|2026-10-11\|2026-10-13\|4\|/);
});

test('idade parcial pede o que falta mesmo se o classificador não propõe cotação',()=>{
  const first=turn('Quero hospedagem para 2 adultos e 2 crianças');
  const prepared=control({operation:'prepare',user_message:'Uma tem 2 anos',state:first.state},now);
  const result=control({operation:'route',user_message:'Uma tem 2 anos',state:prepared.state,ai_response:'Certo.',proposed:'NOQUOTE'},now);
  assert.equal(facts(result).guests,4);
  assert.equal(facts(result).children_pending,true);
  assert.equal(result.quote_request,'NOQUOTE');
  assert.match(result.answer,/idades das crianças/);
});

test('correção de composição substitui a anterior e segunda idade solta não vira hóspedes',()=>{
  const first=turn('Quero hospedagem de 11/10 a 13/10 para 2 adultos e 1 criança de 5 anos');
  const second=turn('Na verdade, 1 adulto e 2 crianças',first.state);
  assert.equal(facts(second).guests,3);
  assert.equal(facts(second).children_pending,true);
  const third=turn('10 anos',second.state);
  assert.equal(facts(third).guests,3);
  assert.equal(facts(third).children_pending,true);
  const fourth=turn('14',third.state);
  assert.equal(facts(fourth).guests,3);
  assert.equal(fourth.quote_request,'NOQUOTE');
  assert.equal(facts(fourth).children_pending,true);
});

test('pergunta de tarifa não substitui grupo nem declara uma criança nova',()=>{
  const first=turn('Somos 2 adultos e 2 crianças');
  const second=turn('Uma criança de 5 anos não paga?',first.state);
  assert.equal(facts(second).guests,4);
  assert.equal(facts(second).children_pending,true);
  assert.equal(second.quote_request,'NOQUOTE');
});

test('idades em serviço de visitante não completam as idades da hospedagem',()=>{
  const first=turn('Quero hospedagem para 2 adultos e 2 crianças');
  const dining=turn('Quanto custa o café para visitantes?',first.state);
  const result=turn('2 e 6 anos',dining.state);
  assert.equal(facts(result).guests,4);
  assert.equal(facts(result).children_pending,true);
  assert.equal(result.quote_request,'NOQUOTE');
});

test('pedido de quarto para casal preserva família e cotação; escolha explícita de categoria conserva confirmação',()=>{
  const first=turn('Quero hospedagem de 11/10 a 13/10 para 3 adultos e 1 criança de 5 anos');
  const quote={version:1,id:'family-room-choice',created_at:now,...facts(first),
    family_key:JSON.stringify([3,1,[60]]),
    options:[{name:'Loft',capacity:4,total:2000},{name:'Suíte Quádruplo',capacity:4,total:1600}]};
  for(const [message,expected] of [['Quero uma suíte para casal','NOQUOTE'],['Quero um quarto para um casal','NOQUOTE'],
    ['Quero o Loft','COLETAR'],['Prefiro a Suíte Quádruplo','COLETAR']]) {
    const p=control({operation:'prepare',user_message:message,state:first.state,quote_state:quote},now);
    const r=control({operation:'route',user_message:message,state:p.state,quote_state:quote,ai_response:'Resposta informativa.',proposed:'NOQUOTE'},now);
    assert.deepEqual(facts(r),facts(first),message);
    assert.equal(r.quote_request,expected,message);
    assert.equal(r.can_collect,'NAO',message);
  }
  const declared=turn('Quero uma suíte para casal. Somos 2 adultos e 1 criança de 5 anos',first.state);
  assert.equal(facts(declared).guests,3);
  assert.match(declared.quote_request,/\|3\|NONE$/);
});

test('correção contrastiva aceita grupo afirmado; contraste ambíguo pede composição e impede cotação antiga',()=>{
  const first=turn('Quero hospedagem de 11/10 a 13/10 para 4 adultos e 2 crianças de 2 e 6 anos');
  const clear=turn('Não são 4 adultos e 2 crianças, são 2 adultos e 1 criança de 5 anos',first.state);
  assert.equal(facts(clear).guests,3);
  assert.equal(facts(clear).children_pending,false);
  assert.match(clear.quote_request,/\|3\|NONE$/);
  for(const message of ['Não são 4 adultos e 2 crianças','Não são 4 adultos e 2 crianças, são 2']) {
    const r=turn(message,first.state);
    assert.equal(facts(r).guests,undefined,message);
    assert.equal(r.quote_request,'NOQUOTE',message);
    assert.match(r.answer,/quantos adultos e quantas crianças/,message);
    assert.equal(JSON.parse(r.state).family_clarification,'party_composition',message);
    const retry=turn('3 pessoas',r.state);
    assert.equal(retry.quote_request,'NOQUOTE');
    assert.match(retry.answer,/quantos adultos e quantas crianças/);
    const fixed=turn('2 adultos e 1 criança de 5 anos',r.state);
    assert.equal(facts(fixed).guests,3);
    assert.match(fixed.quote_request,/\|3\|NONE$/);
  }
});
