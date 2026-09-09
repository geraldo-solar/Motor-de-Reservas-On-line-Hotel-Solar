import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
const bundled=await build({entryPoints:['api/conversation-control.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {control}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const now=Date.parse('2026-07-22T15:00:00Z');
function turn(message,state) {
  const prepared=control({operation:'prepare',user_message:message,state},now);
  return control({operation:'route',user_message:message,state:prepared.state,ai_response:'Resposta informativa.',proposed:'NOQUOTE'},now);
}
test('pedido real de período seguido somente de Casal completa duas pessoas',()=>{
  const first=turn('Gostaria de um orçamento para o período de 29/07 a 03/08');
  const second=turn('Casal',first.state);
  assert.equal(second.quote_request,'QUOTE|2026-07-29|2026-08-03|2|NONE');
  assert.equal(second.can_collect,'NAO');
});
test('casal com criança ou bebê considera ocupação física sem inferir tarifa infantil',()=>{
  for(const message of ['Casal e uma criança de 5 anos','Um casal e um bebê de 6 meses','2 adultos e um bebê de 18 meses']) {
    const result=turn(message);
    assert.equal(JSON.parse(result.state).facts.guests,3,message);
    assert.equal(JSON.parse(result.state).facts.children_pending,false,message);
    assert.equal(result.can_collect,'NAO');
  }
});
test('Casal em contexto de café continua visita e não vira hospedagem',()=>{
  const first=turn('Quanto custa o café para visitantes?');
  const second=turn('Casal',first.state);
  assert.equal(second.quote_request,'NOQUOTE');
  assert.deepEqual(JSON.parse(second.state).facts,{extras:[]});
  assert.equal(JSON.parse(second.state).guest_inquiry.kind,'dining');
});
test('Casal como escolha de foto continua mídia sem criar ocupação',()=>{
  const first=turn('Quero fotos dos apartamentos');
  const second=turn('Casal',first.state);
  assert.equal(second.quote_request,'NOQUOTE');
  assert.deepEqual(JSON.parse(second.state).facts,{extras:[]});
  assert.match(second.resolved_message,/Fotos de Casal/);
});
