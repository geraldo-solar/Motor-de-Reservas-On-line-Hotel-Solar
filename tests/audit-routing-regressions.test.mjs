import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

// Offline regression probes: no provider, CRM or customer action is invoked.
const bundled = await build({
  stdin: { contents: "export { control } from './api/conversation-control.ts'; export { guestInquiry, explicitLodgingRequest } from './utils/guestInquiry.ts'; export { multiRoomRequest } from './utils/lodgingScope.ts';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const { control, guestInquiry, explicitLodgingRequest, multiRoomRequest } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);
const now = Date.parse('2026-09-08T16:00:00Z');
const facts = { guests: 2, check_in: '2026-10-20', check_out: '2026-10-25', extras: [] };
const previous = { version: 2, history: [], facts, greeted:true,daily_greeting:{day:new Date(now-3*3600000).toISOString().slice(0,10),first:false} };
const empty = { version: 2, history: [], facts: { extras: [] }, greeted:true,daily_greeting:{day:new Date(now-3*3600000).toISOString().slice(0,10),first:false} };
const oldQuote = 'QUOTE|2026-10-20|2026-10-25|2|NONE';
const informativeAnswer = 'Resposta factual sintética, sem preço ou disponibilidade confirmada.';

function turn(message, state = previous) {
  const prepared = control({ operation: 'prepare', user_message: message, state }, now);
  const routed = control({ operation: 'route', user_message: message, state: prepared.state,
    proposed: oldQuote, ai_response: informativeAnswer }, now);
  return { routed, state: JSON.parse(routed.state), context: JSON.parse(prepared.context) };
}

test('nova entrada isolada substitui a entrada antiga e nunca herda a saída anterior', () => {
  for (const message of [
    'Quero hospedagem a partir de 11/10',
    'Quero uma nova hospedagem no dia 11/10',
    'Entrada 11/10',
    'Check-in 11/10',
  ]) {
    const result = turn(message);
    assert.equal(result.routed.quote_request, 'NOQUOTE', message);
    assert.equal(result.routed.can_collect, 'NAO', message);
    assert.equal(result.state.facts.check_in, '2026-10-11', message);
    assert.equal(result.state.facts.check_out, undefined, message);
    assert.match(result.routed.answer, /sa[ií]da/i, message);
    const completed = turn('Saída 13/10', result.state);
    assert.equal(completed.routed.quote_request, 'QUOTE|2026-10-11|2026-10-13|2|NONE', message);
  }
});

test('nova data aparente não reconhecida apaga datas antigas e pede dia/mês', () => {
  for (const state of [previous, empty]) {
    const result = turn('Quero hospedagem a partir de 11-10-2026', state);
    assert.equal(result.routed.quote_request, 'NOQUOTE');
    assert.equal(result.state.facts.check_in, undefined);
    assert.equal(result.state.facts.check_out, undefined);
    assert.equal(result.state.stay_date_pending?.reason, 'unparsed_dates');
    // Without occupancy the controller may ask the number of guests first;
    // once it is supplied it must still clarify the dates, not restore them.
    const ready = result.state.facts.guests ? result : turn('2 hóspedes', result.state);
    assert.equal(ready.routed.quote_request, 'NOQUOTE');
    assert.match(ready.routed.answer, /dia\/m[eê]s/i);
  }
});

test('saída explícita e novo intervalo completo mantêm a cotação legítima', () => {
  assert.equal(turn('Saída 27/10').routed.quote_request, 'QUOTE|2026-10-20|2026-10-27|2|NONE');
  assert.equal(turn('Quero hospedagem de 11/10 a 13/10').routed.quote_request, 'QUOTE|2026-10-11|2026-10-13|2|NONE');
});

test('imagem singular e dúvida de quartos interligados não chamam humano', () => {
  for (const message of ['Quero uma imagem de 2 quartos', 'Quero saber se os 2 quartos são interligados']) {
    assert.equal(multiRoomRequest(message), false, message);
    const result = turn(message);
    assert.equal(result.routed.quote_request, 'NOQUOTE', message);
    assert.equal(result.context.solicitacao_varios_apartamentos, false, message);
    assert.deepEqual(result.state.facts, facts, message);
  }
  for (const message of ['Quero reservar 2 quartos', 'Quero saber o valor de 2 quartos']) {
    assert.equal(multiRoomRequest(message), true, message);
    assert.equal(turn(message).routed.quote_request, 'HUMANO', message);
  }
});

test('recusa de orçamento ou pagamento não vira recusa de marketing em outra oração', () => {
  for (const message of [
    'Não quero receber orçamento de quartos caros, quero ver as ofertas',
    'Não autorizo pagamento agora; quero receber ofertas',
  ]) {
    const result = turn(message);
    assert.equal(result.context.marketing_recusa, false, message);
    assert.equal(result.context.regra_marketing_recusa, undefined, message);
    assert.notEqual(result.routed.quote_request, 'HUMANO', message);
    assert.doesNotMatch(result.routed.answer, /não receber mensagens promocionais/i, message);
  }
});

test('marketing realmente recusado continua indo para humano inclusive mensagem singular', () => {
  for (const message of [
    'Não autorizo o envio de marketing neste número, por favor',
    'Para de me mandar mensagem de marketing sem autorização',
    'Não quero receber comunicação promocional',
  ]) {
    const result = turn(message);
    assert.equal(result.context.marketing_recusa, true, message);
    assert.equal(result.routed.quote_request, 'HUMANO', message);
    assert.match(result.routed.answer, /vou chamar a equipe/i, message);
    assert.equal(result.state.unsubscribed, undefined, message);
  }
});

test('cotação com hóspedes e café é hospedagem, mas participantes de refeição não são hóspedes', () => {
  const message = 'Quero cotação para 2 hóspedes de 11/10 a 13/10 com café da manhã';
  assert.equal(explicitLodgingRequest(message), true);
  assert.equal(guestInquiry(message), undefined);
  const result = turn(message, empty);
  assert.equal(result.routed.quote_request, 'QUOTE|2026-10-11|2026-10-13|2|NONE');
  assert.equal(result.state.facts.guests, 2);
  for (const request of [
    'Quero cotação para café da manhã para 2 pessoas dia 11/10',
    'Quero orçamento para 2 pessoas com café da manhã',
    'Quero cotação de day use para 2 hóspedes com café da manhã',
  ]) {
    assert.equal(explicitLodgingRequest(request), false, request);
    const info = turn(request, empty);
    assert.equal(info.routed.quote_request, 'NOQUOTE', request);
    assert.deepEqual(info.state.facts, empty.facts, request);
  }
});

test('requisitos e capacidade de quarto não recotam dados anteriores, cotação explícita permanece livre', () => {
  for (const message of [
    'Vocês têm quarto adaptado para cadeirante?',
    'Tem quarto que comporta casal e criança de 2 anos?',
    'Tem quarto com varanda?',
  ]) {
    assert.equal(explicitLodgingRequest(message), false, message);
    assert.equal(guestInquiry(message), 'lodging_faq', message);
    const result = turn(message);
    assert.equal(result.routed.quote_request, 'NOQUOTE', message);
    assert.equal(result.routed.answer, informativeAnswer, message);
    assert.deepEqual(result.state.facts, facts, message);
  }
  const quote = 'Quero cotar quarto adaptado de 11/10 a 13/10 para 2 hóspedes';
  assert.equal(explicitLodgingRequest(quote), true);
  assert.equal(turn(quote).routed.quote_request, 'QUOTE|2026-10-11|2026-10-13|2|NONE');
  assert.equal(explicitLodgingRequest('Tem um quarto para 3 pessoas?'), true);
  assert.equal(explicitLodgingRequest('Tem quartos disponíveis?'), true);
});
