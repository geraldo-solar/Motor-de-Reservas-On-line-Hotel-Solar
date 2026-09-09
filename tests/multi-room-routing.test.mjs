import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundled = await build({ entryPoints:['api/conversation-control.ts'], bundle:true, write:false, platform:'node', format:'esm' });
const { control } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const now = Date.parse('2026-07-20T15:00:00Z');
const facts = { guests:2, extras:[] };
const initial = { version:2, history:[], facts, greeted:true };

function turn(message, state = initial) {
  const prepared = control({operation:'prepare', user_message:message, state}, now);
  const routed = control({operation:'route', user_message:message, state:prepared.state,
    proposed:'QUOTE|2026-08-29|2026-08-31|2|NONE', ai_response:'Já reservei dois quartos pelo preço de um.'}, now);
  return { prepared, routed, state:JSON.parse(routed.state), context:JSON.parse(prepared.context) };
}

test('orçamento real de dois apartamentos vai à recepção, sem preço de um quarto ou datas presumidas', () => {
  for (const message of [
    'Queria um orçamento para 2 apartamento duplos de 29/08 a 31/08',
    'Preciso reservar dois quartos separados para quatro pessoas',
    '2 apartamentos duplos',
  ]) {
    const result = turn(message);
    assert.equal(result.routed.quote_request,'HUMANO',message);
    assert.equal(result.routed.can_collect,'NAO',message);
    assert.equal(result.routed.confirmation_text,'',message);
    assert.equal(result.context.solicitacao_varios_apartamentos,true,message);
    assert.match(result.routed.answer,/recepção.*vários apartamentos/i,message);
    assert.doesNotMatch(result.routed.answer,/Luiza|já reservei|preço de um/i,message);
    assert.deepEqual(result.state.facts,facts,message);
    assert.equal(result.state.pending,undefined,message);
  }
});

test('redução posterior para um apartamento libera a simulação individual solicitada', () => {
  const multiple = turn('Queria orçamento para 2 apartamentos duplos de 29/08 a 31/08');
  const single = turn('Agora quero apenas 1 apartamento duplo de 29/08 a 31/08',multiple.state);
  assert.equal(single.context.solicitacao_varios_apartamentos,false);
  assert.equal(single.routed.quote_request,'QUOTE|2026-08-29|2026-08-31|2|NONE');
  assert.equal(single.routed.can_collect,'NAO');
  assert.deepEqual(single.state.facts,{guests:2,extras:[],check_in:'2026-08-29',check_out:'2026-08-31'});
});

test('fotos de dois quartos não viram pedido de várias reservas ou de humano', () => {
  const result = turn('Quero fotos de 2 quartos');
  assert.equal(result.routed.quote_request,'NOQUOTE');
  assert.equal(result.context.solicitacao_varios_apartamentos,false);
  assert.equal(result.state.topic,'room_photos');
  assert.deepEqual(result.state.facts,facts);
});

test('evento empresarial conserva atendimento personalizado de eventos', () => {
  const result = turn('Quero orçamento de evento empresarial e 2 apartamentos para o grupo');
  assert.equal(result.routed.quote_request,'NOQUOTE');
  assert.equal(result.context.solicitacao_varios_apartamentos,false);
  assert.match(result.routed.answer,/Luiza/);
  assert.deepEqual(result.state.facts,facts);
});

test('pedido direto de vários quartos invalida cartão anterior mesmo sem prepare', () => {
  const result = control({operation:'route',user_message:'Quero reservar 2 apartamentos',
    state:{...initial,pending:{quote_id:'old',option:'Loft'}},proposed:'COLETAR',ai_response:'Reservei.'},now);
  assert.equal(result.quote_request,'HUMANO');
  assert.equal(result.can_collect,'NAO');
  assert.equal(result.confirmation_text,'');
  assert.equal(JSON.parse(result.state).pending,undefined);
  assert.deepEqual(JSON.parse(result.state).facts,facts);
});
