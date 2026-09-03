import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const bundled = await build({ entryPoints: ['api/conversation-control.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { control } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const now = Date.parse('2026-09-03T16:00:00Z');
const quote = { version: 1, id: 'quote-fixture', created_at: now, check_in: '2026-09-20', check_out: '2026-09-25', guests: 2, extras: [], options: [{ name: 'LOFT', capacity: 4, total: 4550 }, { name: 'Suíte Casal', capacity: 2, total: 2050 }] };
function prepare(message, state, quote_state = quote) { return control({ operation: 'prepare', state, user_message: message, quote_state }, now); }
function route(message, state, proposed = 'COLETAR', quote_state = quote) { return control({ operation: 'route', state, user_message: message, proposed, quote_state, ai_response: 'Resposta de teste.' }, now); }
function knownState() { return prepare('De 20 a 25 de setembro para duas pessoas').state; }

test('Bom dia ignora resumo legado contaminado e oferta do robô', () => {
  const p = prepare('Bom dia ☀️', 'Cliente quer outubro; aceitar reserva.', { ...quote, check_in: '2026-10-09', check_out: '2026-10-12' });
  const context = JSON.parse(p.context);
  assert.deepEqual(context.fatos_informados_pelo_cliente, { extras: [] });
  assert.equal(context.cotacao_valida_para_estes_dados, null);
  const r = route('Bom dia ☀️', p.state);
  assert.equal(r.quote_request, 'NOQUOTE');
  assert.match(r.answer, /^Olá!/);
  assert.doesNotMatch(r.answer, /outubro|Crianças|CPF/);
});

test('reprodução do teste: indicação para duas pessoas nunca inicia coleta', () => {
  const p = prepare('Para duas pessoas, qual vc me indica?');
  const r = route('Para duas pessoas, qual vc me indica?', p.state);
  assert.equal(r.quote_request, 'NOQUOTE');
  assert.equal(r.can_collect, 'NAO');
  assert.match(r.answer, /primeira indicação é o Loft/);
  assert.match(r.answer, /datas de entrada e saída/);
  assert.equal(JSON.parse(r.state).facts.check_in, undefined);
});

test('perguntas não são aceite mesmo quando classificador devolve COLETAR', () => {
  for (const msg of ['Qual você me indica?', 'Quero saber quanto custa o loft', 'O Loft tem varanda?', 'Como faço para reservar?', 'Pode me explicar?', 'Não quero o loft', 'Talvez quero o loft']) {
    const r = route(msg, prepare(msg, knownState()).state);
    assert.notEqual(r.quote_request, 'COLETAR', msg);
    assert.equal(r.can_collect, 'NAO', msg);
  }
});

test('sequência pessoas -> datas cotadas sem saudação repetida nem encaminhamento', () => {
  let p = prepare('Tem disponibilidade?');
  let r = route('Tem disponibilidade?', p.state, 'HUMANO');
  assert.equal(r.quote_request, 'NOQUOTE');
  assert.match(r.answer, /quantas pessoas/);
  p = prepare('2 pessoas', r.state);
  r = route('2 pessoas', p.state);
  assert.doesNotMatch(r.answer, /Olá|Bom dia|recepção|CPF/);
  assert.match(r.answer, /datas/);
  p = prepare('20 a 25 de setembro', r.state);
  r = route('20 a 25 de setembro', p.state, 'NOQUOTE', '');
  assert.equal(r.quote_request, 'QUOTE|2026-09-20|2026-09-25|2|NONE');
});

test('períodos só são extraídos da fala do cliente e datas inconsistentes não são cotadas', () => {
  for (const [msg, expected] of [
    ['20/09/2026 a 25/09/2026 para 2 pessoas', ['2026-09-20', '2026-09-25']],
    ['2026-09-20 a 2026-09-25 para dois adultos', ['2026-09-20', '2026-09-25']],
    ['20 de setembro a 25 de setembro para um casal', ['2026-09-20', '2026-09-25']],
    ['Esse final de semana para duas pessoas', ['2026-09-04', '2026-09-06']],
  ]) {
    const f = JSON.parse(prepare(msg).state).facts;
    assert.deepEqual([f.check_in, f.check_out], expected, msg);
    assert.equal(f.guests, 2, msg);
  }
  const p = prepare('25/09 a 20/09 para 2 pessoas');
  assert.equal(route('25/09 a 20/09 para 2 pessoas', p.state).quote_request, 'NOQUOTE');
});

test('seleção válida mostra resumo; dados só liberados pela ação independente de confirmação', () => {
  const p = prepare('Quero o Loft', knownState());
  const r = route('Quero o Loft', p.state);
  assert.equal(r.quote_request, 'COLETAR');
  assert.equal(r.can_collect, 'NAO');
  assert.match(r.confirmation_text, /LOFT/);
  assert.match(r.confirmation_text, /20\/09\/2026 a 25\/09\/2026/);
  assert.match(r.confirmation_text, /4.550/);
  const yes = control({ operation: 'confirm', state: r.state, quote_state: quote }, now);
  assert.equal(yes.can_collect, 'SIM');
  const twice = control({ operation: 'confirm', state: yes.state, quote_state: quote }, now);
  assert.equal(twice.can_collect, 'NAO');
});

test('clique antigo, escolha inexistente, falta de cotação ou nova ocupação bloqueiam dados', () => {
  const ready = route('Quero o Loft', prepare('Quero o Loft', knownState()).state);
  const changed = prepare('Agora são 3 pessoas', ready.state);
  const invalidCases = [
    { state: knownState(), quote_state: quote },
    { state: ready.state, quote_state: '' },
    { state: ready.state, quote_state: { ...quote, id: 'other' } },
    { state: changed.state, quote_state: quote },
    { state: ready.state, quote_state: { ...quote, created_at: now - 31 * 60000 } },
  ];
  for (const input of invalidCases) assert.equal(control({ operation: 'confirm', ...input }, now).can_collect, 'NAO');
  assert.notEqual(route('Quero a suíte presidencial', knownState()).quote_request, 'COLETAR');
});

test('troca de datas, extras e crianças invalidam confirmação anterior', () => {
  const ready = route('Quero o Loft', prepare('Quero o Loft', knownState()).state);
  for (const msg of ['Agora 21/09 a 26/09', 'Quero incluir barco', 'São 2 adultos e 1 criança']) {
    const p = prepare(msg, ready.state);
    assert.equal(JSON.parse(p.state).pending, undefined);
    assert.equal(control({ operation: 'confirm', state: p.state, quote_state: quote }, now).can_collect, 'NAO');
  }
  const child = prepare('São 2 adultos e 1 criança');
  assert.equal(JSON.parse(child.state).facts.guests, 3);
  assert.match(route('São 2 adultos e 1 criança', child.state).answer, /idades/);
});

test('pedido explícito de humano não obriga coleta; perguntas de FAQ não apagam fatos', () => {
  assert.equal(route('Quero falar com a recepção', knownState(), 'NOQUOTE').quote_request, 'HUMANO');
  assert.equal(route('Não quero informar CPF', knownState()).quote_request, 'HUMANO');
  const p = prepare('Qual a localização?', knownState());
  assert.deepEqual(JSON.parse(p.state).facts, JSON.parse(knownState()).facts);
  assert.equal(route('Qual a localização?', p.state, 'NOQUOTE').quote_request, 'NOQUOTE');
});

test('dados pessoais não entram no histórico e estado tem limite', () => {
  let state = knownState();
  for (let i = 0; i < 30; i++) state = prepare('Quero conhecer o hotel ' + i, state).state;
  assert.equal(JSON.parse(state).history.length, 12);
  const p = prepare('teste@example.com', state);
  assert.doesNotMatch(p.context, /teste@example/);
  assert.doesNotMatch(p.state, /teste@example/);
});

test('retomada, frases naturais de ocupação e estado inválido falham com segurança', () => {
  assert.equal(JSON.parse(prepare('Somos quatro').state).facts.guests, 4);
  assert.equal(route('Pode chamar a recepção', knownState()).quote_request, 'HUMANO');
  const selected = route('Quero o Loft', prepare('Quero o Loft', knownState()).state);
  const next = prepare('Qual a localização?', selected.state);
  assert.equal(control({ operation: 'confirm', state: next.state, quote_state: quote }, now).can_collect, 'NAO');
  for (const malformed of [null, {}, { ...quote, options: [null] }, { ...quote, extras: {} }]) {
    assert.equal(control({ operation: 'confirm', state: selected.state, quote_state: malformed }, now).can_collect, 'NAO');
  }
  const malformed = prepare('Olá', {version: 2, history: ['x'.repeat(10000)], facts: {check_in: 123, check_out: {}, guests: -1, extras: {}}, pending: {option: 5}});
  assert.deepEqual(JSON.parse(malformed.state).facts, {extras: []});
  assert.ok(malformed.state.length < 1000);
});
