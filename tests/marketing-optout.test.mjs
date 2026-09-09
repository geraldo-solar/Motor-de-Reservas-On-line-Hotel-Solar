import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundled = await build({
  entryPoints: ['api/conversation-control.ts'], bundle: true, write: false,
  platform: 'node', format: 'esm',
});
const { control, handleConversation } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);
const now = Date.parse('2026-09-08T16:00:00Z');
const facts = { guests: 2, check_in: '2026-09-20', check_out: '2026-09-25', extras: ['MESA'] };
const state = { version: 2, history: [], facts, greeted: true };
const wrongQuote = 'QUOTE|2026-09-20|2026-09-25|2|MESA';
const answer = 'Entendi seu pedido de não receber mensagens promocionais. Vou chamar a equipe para providenciar isso.';

function run(message, previous = state) {
  const prepared = control({ operation: 'prepare', user_message: message, state: previous }, now);
  const routed = control({
    operation: 'route', user_message: message, state: prepared.state,
    proposed: wrongQuote, ai_response: 'Já removi seu número. Aproveite esta promoção!',
  }, now);
  return { prepared, routed, context: JSON.parse(prepared.context), state: JSON.parse(routed.state) };
}

function assertOptOut(result) {
  assert.equal(result.routed.quote_request, 'HUMANO');
  assert.equal(result.routed.can_collect, 'NAO');
  assert.equal(result.routed.confirmation_text, '');
  assert.equal(result.routed.answer, answer);
  assert.equal(result.context.marketing_recusa, true);
  assert.match(result.context.regra_marketing_recusa, /não é uma alteração das permissões/i);
  assert.equal(result.context.cotacao_valida_para_estes_dados, null);
  assert.deepEqual(result.state.facts, facts);
  assert.equal(result.state.pending, undefined);
  assert.equal(result.state.guest_inquiry, undefined);
  assert.equal(result.state.marketing_recusa, undefined);
  assert.equal(result.state.unsubscribed, undefined);
  assert.equal(result.state.tags, undefined);
}

test('recusas reais de agosto chamam humano sem oferta, cotação ou promessa de descadastro', () => {
  // Message shapes observed in the legacy attendance; these tests do not
  // contact a customer or assert that subscription settings were changed.
  for (const message of [
    'Não autorizo o envio de marketing neste número, por favor',
    'Para de me mandar mensagem de marketing sem autorização',
  ]) assertOptOut(run(message));
});

test('pedidos explícitos de parar ou remover propaganda preservam os dados de hospedagem', () => {
  for (const message of [
    'Não quero receber propaganda',
    'Não desejo mais receber mensagens promocionais',
    'Prefiro não receber ofertas',
    'Remova meu número da lista de marketing',
    'Retirem meu contato das campanhas',
    'Descadastre meu número da newsletter',
    'Cancele as mensagens promocionais',
    'Parem de me enviar publicidade',
  ]) assertOptOut(run(message));
});

test('consulta de promoção, cancelamento de orçamento e comando negado não são opt-out', () => {
  for (const message of [
    'Quais promoções vocês têm?',
    'Quero receber ofertas de hospedagem',
    'Não quero essa promoção, quero outra diária',
    'Não recebi a mensagem com minha reserva',
    'Quero cancelar o orçamento da promoção',
    'Não cancele as mensagens promocionais',
    'Não remova meu número da lista de marketing',
  ]) {
    const result = run(message);
    assert.notEqual(result.routed.quote_request, 'HUMANO', message);
    assert.equal(result.context.marketing_recusa, false, message);
    assert.equal(result.context.regra_marketing_recusa, undefined, message);
  }
});

test('pedido atual prevalece sobre contexto de refeição, fotos ou pacote sem alterar configurações', () => {
  for (const previous of [
    { ...state, guest_inquiry: { kind: 'dining', at: now } },
    { ...state, topic: 'extra_photos', topic_at: now, extra_photo_subjects: ['HIDRO'] },
    { ...state, topic: 'package_info', topic_at: now, package_context: {
      id: 'reveillon', name: 'Réveillon', start_date: '2026-12-30', end_date: '2027-01-03', updated_at: now,
    } },
  ]) {
    const result = run('Não autorizo marketing neste número', previous);
    assertOptOut(result);
    assert.equal(result.state.topic, undefined);
    assert.equal(result.state.package_context, undefined);
  }
});

test('recusa no histórico não vira nova recusa nem confirmação de bloqueio no turno seguinte', () => {
  const previous = run('Não autorizo marketing neste número');
  const next = run('Qual o horário do café da manhã?', previous.state);
  assert.equal(next.context.marketing_recusa, false);
  assert.equal(next.context.regra_marketing_recusa, undefined);
  assert.equal(next.routed.quote_request, 'NOQUOTE');
  assert.equal(next.state.unsubscribed, undefined);
});

test('route sem prepare ainda prioriza recusa e invalida confirmação antiga', () => {
  const result = control({
    operation: 'route', user_message: 'Não quero receber propaganda',
    state: { ...state, pending: { quote_id: 'old', option: 'Loft' } },
    proposed: wrongQuote, ai_response: 'Já cancelei as campanhas.',
  }, now);
  assert.equal(result.quote_request, 'HUMANO');
  assert.equal(result.answer, answer);
  assert.equal(JSON.parse(result.state).pending, undefined);
  assert.deepEqual(JSON.parse(result.state).facts, facts);
});

test('áudio conserva a recusa promocional sem guardar dados pessoais ou alegar bloqueio', async () => {
  const input = 'https://media.example.test/request.ogg';
  const prepared = await handleConversation({
    operation: 'prepare', user_message: input, state,
  }, '', async () => 'Não autorizo marketing no meu número 5591999999999', now);
  const context = JSON.parse(prepared.context);
  assert.equal(context.marketing_recusa, true);
  assert.equal(context.ultima_mensagem, 'Não quero receber mensagens promocionais');
  assert.doesNotMatch(prepared.state, /5591999999999/);
  const routed = control({
    operation: 'route', user_message: input, state: prepared.state,
    proposed: wrongQuote, ai_response: 'Já bloqueei as campanhas.',
  }, now);
  assert.equal(routed.quote_request, 'HUMANO');
  assert.equal(routed.answer, answer);
  assert.deepEqual(JSON.parse(routed.state).facts, facts);
});
