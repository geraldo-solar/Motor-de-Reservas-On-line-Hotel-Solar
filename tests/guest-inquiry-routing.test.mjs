import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

// Controller-only fixtures: no HTTP adapter, provider, catalog or live contact.
const bundled = await build({
  entryPoints: ['api/conversation-control.ts'], bundle: true, write: false,
  platform: 'node', format: 'esm',
});
const { control } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);
const now = Date.parse('2026-09-08T16:00:00Z');
const empty = { version: 2, history: [], facts: { extras: [] }, greeted: true };
const lodgingFacts = {
  guests: 4, check_in: '2026-09-20', check_out: '2026-09-25',
  extras: ['MESA'], children_pending: true,
};
const existingStay = { ...empty, facts: lodgingFacts };
const wrongQuote = 'QUOTE|2026-09-15|2026-09-16|3|MESA';
const facts = state => (typeof state === 'string' ? JSON.parse(state) : state).facts;
const lodgingCollection = /quantas pessoas será a estadia|datas de entrada e sa[ií]da|idades das crianças|confirmar opção|nome completo|\bCPF\b/i;

function turn(message, state = empty, {
  time = now,
  answer = 'Continuamos com as informações solicitadas, sem uma reserva de hospedagem.',
  proposed = wrongQuote,
} = {}) {
  const prepared = control({ operation: 'prepare', user_message: message, state }, time);
  const routed = control({
    operation: 'route', user_message: message, state: prepared.state,
    proposed, ai_response: answer,
  }, time);
  return { prepared, routed, state: routed.state, context: JSON.parse(prepared.context) };
}

function informational(result, expectedFacts, message) {
  assert.equal(result.routed.quote_request, 'NOQUOTE', message);
  assert.equal(result.routed.can_collect, 'NAO', message);
  assert.equal(result.routed.confirmation_text, '', message);
  assert.deepEqual(facts(result.prepared.state), expectedFacts, `${message}: prepare`);
  assert.deepEqual(facts(result.state), expectedFacts, `${message}: route`);
  assert.doesNotMatch(result.routed.answer, lodgingCollection, message);
}

test('café da manhã de visitante → três pessoas → data não vira estadia nem grava hóspedes/datas', () => {
  // Real inquiry shape observed on 08/09; the intermediate AI replies are
  // fixtures, not claims that a table, meal or reservation was confirmed.
  for (const initial of [empty, existingStay]) {
    let state = initial;
    let index = 0;
    for (const [message, answer] of [
      ['Vocês servem café da manhã para quem não está hospedado?', 'Você deseja informações sobre o café da manhã para visitantes?'],
      ['Seria para 03 pessoas', 'Para qual dia vocês desejam informações sobre o café da manhã?'],
      ['Dia 15/09/26', 'Vou manter sua dúvida sobre o café da manhã de visitantes para o dia informado.'],
    ]) {
      const result = turn(message, state, { time: now + index++ * 1000, answer });
      informational(result, facts(initial), message);
      assert.equal(result.context.atendimento_informativo_em_foco?.kind, 'dining', message);
      assert.match(result.routed.answer, /café da manhã|visitantes/i, message);
      state = result.state;
    }
  }
});

test('datas completas e acompanhamentos de refeição também não contaminam viagem já conhecida', () => {
  let state = turn('Quero informações sobre almoço para visitantes', existingStay).state;
  for (const message of ['Somos 3 pessoas', 'No dia 15/09/2026', 'E uma criança de 5 anos?']) {
    const result = turn(message, state, { answer: 'Continuamos falando do almoço para visitantes.' });
    informational(result, lodgingFacts, message);
    assert.equal(result.context.atendimento_informativo_em_foco?.kind, 'dining', message);
    state = result.state;
  }
});

test('Day Use para duas pessoas permanece informativo mesmo com proposta incorreta de QUOTE', () => {
  for (const initial of [empty, existingStay]) {
    const first = turn('Quanto custa o day use para 2 adultos?', initial, {
      answer: 'As condições do Day Use dependem da data e da programação.',
    });
    informational(first, facts(initial), 'day use para 2 adultos');
    assert.equal(first.context.atendimento_informativo_em_foco?.kind, 'day_use');
    const second = turn('Dia 15/09/2026', first.state, {
      answer: 'Continuamos com sua consulta de Day Use para a data informada.',
    });
    informational(second, facts(initial), 'data do Day Use');
    assert.equal(second.context.atendimento_informativo_em_foco?.kind, 'day_use');
  }
});

test('FAQ de café incluso, pets, pagamento e check-in não inicia orçamento de hospedagem', () => {
  for (const initial of [empty, existingStay]) {
    for (const [message, answer, expected] of [
      ['O café da manhã está incluso na diária?', 'O café da manhã está incluso na diária.', /café da manhã.*inclus/i],
      ['Vocês aceitam pets na hospedagem?', 'O hotel não aceita pets.', /não aceita pets/i],
      ['Como funciona o pagamento da reserva?', 'As condições de pagamento constam das regras de hospedagem.', /condições de pagamento/i],
      ['Qual o horário para entrar no quarto?', 'O check-in é a partir das 14h.', /check-in.*14h/i],
    ]) {
      const result = turn(message, initial, { answer });
      informational(result, facts(initial), message);
      assert.equal(result.context.atendimento_informativo_em_foco?.kind, 'lodging_faq', message);
      assert.match(result.routed.answer, expected, message);
    }
  }
});

test('mudança explícita de café/Day Use para cotação de hospedagem libera a viagem solicitada', () => {
  for (const first of [
    'Vocês servem café da manhã para visitantes?',
    'Quanto custa o day use para 3 pessoas?',
  ]) {
    const state = turn(first).state;
    const message = 'Agora quero cotação de hospedagem para 2 adultos de 20 a 22 de setembro';
    const result = turn(message, state, { proposed: 'NOQUOTE' });
    assert.equal(result.routed.quote_request, 'QUOTE|2026-09-20|2026-09-22|2|NONE', first);
    assert.equal(result.routed.can_collect, 'NAO', first);
    assert.equal(result.routed.confirmation_text, '', first);
    assert.deepEqual(facts(result.state), {
      extras: [], guests: 2, check_in: '2026-09-20', check_out: '2026-09-22',
    }, first);
    assert.equal(result.context.atendimento_informativo_em_foco, null, first);
  }
});

test('foco informativo expira após 30 minutos e não prende uma solicitação de hospedagem', () => {
  const started = turn('Vocês servem café da manhã para visitantes?');
  const expired = turn('3 pessoas', started.state, {
    time: now + 31 * 60000, proposed: 'NOQUOTE', answer: 'Qual informação deseja?',
  });
  assert.equal(expired.context.atendimento_informativo_em_foco, null);
  const stay = turn('Quero hospedagem para 2 adultos de 20 a 22 de setembro', expired.state, {
    time: now + 31 * 60000 + 1000, proposed: 'NOQUOTE',
  });
  assert.equal(stay.routed.quote_request, 'QUOTE|2026-09-20|2026-09-22|2|NONE');
});

test('consulta de restaurante não captura pedido explícito de fotos', () => {
  const state = turn('Quero informações sobre café da manhã para visitantes', existingStay).state;
  const result = turn('Quero fotos da hidromassagem', state);
  informational(result, lodgingFacts, 'fotos da hidromassagem');
  assert.equal(result.context.atendimento_informativo_em_foco, null);
  assert.deepEqual(result.context.fotos_lazer_solicitadas, ['HIDRO']);
  assert.match(result.routed.resolved_message, /fotos.*hidromassagem/i);
  assert.match(result.routed.answer, /fotos|acervo/i);
  assert.doesNotMatch(result.routed.answer, /café da manhã|day use/i);
});

test('pedido explícito de humano tem prioridade sobre o foco de café da manhã', () => {
  const state = turn('Quero informações sobre café da manhã para visitantes', existingStay).state;
  const result = turn('Quero falar com a recepção', state);
  assert.equal(result.routed.quote_request, 'HUMANO');
  assert.equal(result.routed.can_collect, 'NAO');
  assert.equal(result.routed.confirmation_text, '');
  assert.deepEqual(facts(result.state), lodgingFacts);
  assert.equal(result.context.atendimento_informativo_em_foco, null);
});

test('eventos privados e programação musical mantêm as suas rotas próprias após uma refeição', () => {
  const state = turn('Quero informações sobre almoço para visitantes', existingStay).state;
  const privateEvent = turn('Quero orçamento de evento empresarial para 30 pessoas', state);
  informational(privateEvent, lodgingFacts, 'evento privado');
  assert.equal(privateEvent.context.atendimento_informativo_em_foco, null);
  assert.match(privateEvent.routed.answer, /Luiza|evento/i);
  const publicEvent = turn('Quem toca no Reserva Solar hoje?', state);
  informational(publicEvent, lodgingFacts, 'programação pública');
  assert.equal(publicEvent.context.atendimento_informativo_em_foco, null);
  assert.match(publicEvent.routed.answer, /programação|apresentação/i);
  assert.doesNotMatch(publicEvent.routed.answer, /Luiza|café da manhã/i);
});

test('consulta explícita de Réveillon não fica presa ao foco de Day Use', () => {
  const state = turn('Quanto custa o day use para 3 pessoas?').state;
  const result = turn('Quero informações sobre o pacote Réveillon', state);
  informational(result, { extras: [] }, 'pacote Réveillon');
  assert.equal(result.context.atendimento_informativo_em_foco, null);
  assert.match(result.routed.answer, /pacote/i);
  assert.doesNotMatch(result.routed.answer, /café da manhã|day use/i);
});

test('divergência no link de pagamento e cobrança duplicada exigem humano sem alterar a viagem', () => {
  for (const initial of [empty, existingStay]) {
    for (const message of [
      'O valor no link de pagamento está errado',
      'O link de pagamento está cobrando um valor diferente do combinado',
      'Fui cobrado duas vezes',
    ]) {
      const result = turn(message, initial, {
        proposed: 'COLETAR',
        answer: 'A equipe precisa conferir essa cobrança.',
      });
      assert.equal(result.routed.quote_request, 'HUMANO', message);
      assert.equal(result.routed.can_collect, 'NAO', message);
      assert.equal(result.routed.confirmation_text, '', message);
      assert.deepEqual(facts(result.prepared.state), facts(initial), `${message}: prepare`);
      assert.deepEqual(facts(result.state), facts(initial), `${message}: route`);
      assert.doesNotMatch(result.routed.answer, lodgingCollection, message);
      assert.doesNotMatch(result.routed.answer, /pagamento confirmado|cobrança corrigida|reembolso (?:feito|realizado)|pague novamente/i, message);
    }
  }
});

test('dúvida de condição de pagamento ou total por diária continua informação, não reclamação financeira', () => {
  for (const initial of [empty, existingStay]) {
    for (const [message, answer] of [
      ['Como funciona o pagamento da reserva?', 'Posso explicar as condições de pagamento da hospedagem.'],
      ['Esse total é pelas 3 diárias ou por dia?', 'Posso esclarecer o período ao qual o total da simulação se refere.'],
    ]) {
      const result = turn(message, initial, { answer });
      informational(result, facts(initial), message);
      assert.notEqual(result.routed.quote_request, 'HUMANO', message);
      assert.doesNotMatch(result.routed.answer, /cobrança indevida|cobrança duplicada|reembolso|pague novamente/i, message);
    }
  }
});
