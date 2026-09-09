import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

// Read-only regression tests. No booking, provider or outbound services run.
const bundled = await build({
  entryPoints: ['api/conversation-control.ts'], bundle: true, write: false,
  platform: 'node', format: 'esm',
});
const { control } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);
const now = Date.parse('2026-08-15T15:00:00Z');
const empty = { version: 2, history: [], facts: { extras: [] }, greeted: true };
const knownGuests = { ...empty, facts: { guests: 2, extras: [] } };
const knownStay = { ...empty, facts: {
  guests: 2, check_in: '2026-10-20', check_out: '2026-10-25', extras: [],
} };
function turn(message, state = knownGuests, proposed = 'NOQUOTE', time = now) {
  const prepared = control({ operation: 'prepare', user_message: message, state }, time);
  const routed = control({
    operation: 'route', user_message: message, state: prepared.state,
    proposed, ai_response: 'Resposta informativa sintética.',
  }, time);
  return { prepared, routed, state: JSON.parse(routed.state), context: JSON.parse(prepared.context) };
}

function asksDurationClarification(result) {
  assert.equal(result.routed.quote_request, 'NOQUOTE');
  assert.equal(result.routed.can_collect, 'NAO');
  assert.equal(result.routed.confirmation_text, '');
  assert.match(result.routed.answer, /noites?|di[aá]rias?|sa[ií]da|check.?out/i);
  assert.match(result.routed.answer, /\?/);
  assert.equal(result.state.facts.check_out, undefined, 'saída ambígua não deve chegar à cotação');
}

test('dois dias 11/10 e 12/10 pede esclarecimento antes de cotar uma noite', () => {
  for (const message of [
    'Eu queria orçamento de hospedagem para 2 dias, lua de mel, dia 11/10 e dia 12/10',
    'Quero hospedagem por dois dias, de 11/10 a 12/10',
  ]) asksDurationClarification(turn(message));
});

test('ambiguidade sobrevive à pergunta intermediária de quantidade de hóspedes', () => {
  const first = turn('Eu queria orçamento de hospedagem para 2 dias, lua de mel, dia 11/10 e dia 12/10', empty);
  const second = turn('Somos 2 pessoas', first.state);
  asksDurationClarification(second);
});

test('noites ou diárias incompatíveis com intervalo explícito não são ignoradas', () => {
  for (const message of [
    'Quero hospedagem por 2 noites de 11/10 a 12/10',
    'Quero hospedagem por duas diárias de 11/10 a 12/10',
    'Quero hospedagem por 2 noites, check-in 11/10 e check-out 12/10',
  ]) asksDurationClarification(turn(message));
});

test('duração declarada e datas no turno seguinte precisam ser reconciliadas', () => {
  const first = turn('Quero hospedagem por 2 noites');
  asksDurationClarification(turn('11/10 e 12/10', first.state));
});

test('três noites não podem virar automaticamente o fim de semana padrão de duas', () => {
  asksDurationClarification(turn('Quero hospedagem por 3 noites neste fim de semana'));
});

test('hoje e amanhã não podem reaproveitar datas antigas da viagem', () => {
  for (const message of [
    'Quero hospedagem por 2 dias de hoje até amanhã',
    'Quero hospedagem por 2 noites de amanhã até depois de amanhã',
  ]) {
    const result = turn(message, knownStay);
    assert.equal(result.routed.quote_request, 'NOQUOTE');
    assert.equal(result.state.facts.check_in, undefined);
    assert.equal(result.state.facts.check_out, undefined);
    assert.match(result.routed.answer, /datas de entrada e sa[ií]da/i);
    assert.match(result.routed.answer, /dia\/m[eê]s|dd\/mm/i);
  }
});

test('a data de saída informada na clarificação decide o intervalo, sem aumentar a estadia por conta própria', () => {
  const first = turn('Quero hospedagem por 2 noites de 11/10 a 12/10');
  asksDurationClarification(first);
  for (const [message,checkout] of [['Saída 13/10','2026-10-13'],['12/10','2026-10-12'],['Saída 12/10','2026-10-12']]) {
    const chosen = turn(message,first.state);
    assert.equal(chosen.state.stay_date_pending,undefined,message);
    assert.equal(chosen.state.facts.check_in,'2026-10-11',message);
    assert.equal(chosen.state.facts.check_out,checkout,message);
    assert.equal(chosen.routed.quote_request,`QUOTE|2026-10-11|${checkout}|2|NONE`,message);
    assert.equal(chosen.routed.can_collect,'NAO',message);
    assert.equal(chosen.routed.confirmation_text,'',message);
  }
});

test('resposta 2 ou Sim não significa escolher automaticamente uma das saídas sugeridas', () => {
  for (const state of [knownGuests,empty]) {
    const first = turn('Quero hospedagem por 2 noites de 11/10 a 12/10',state);
    for (const message of ['2','Sim']) {
      const reply = turn(message,first.state,'QUOTE|2026-10-11|2026-10-13|2|NONE');
      if (reply.state.facts.guests) asksDurationClarification(reply);
      else {
        assert.equal(reply.routed.quote_request,'NOQUOTE');
        assert.equal(reply.routed.can_collect,'NAO');
        assert.equal(reply.routed.confirmation_text,'');
        assert.match(reply.routed.answer,/quantas pessoas|noites?|sa[ií]da|check.?out/i);
      }
      assert.ok(reply.state.stay_date_pending,message);
      assert.equal(reply.state.facts.check_out,undefined,message);
      assert.equal(reply.state.pending,undefined,message);
    }
  }
});

test('duração e pendência usam TTL de 30 minutos, sem aceitar timestamp inválido ou futuro', () => {
  const first = turn('Quero hospedagem por 2 noites de 11/10 a 12/10');
  assert.ok(first.state.stay_date_pending);
  assert.ok(first.state.duration_request);
  const atLimit = turn('Somos 2 pessoas',first.state,'NOQUOTE',now+30*60000);
  asksDurationClarification(atLimit);
  for (const stamp of [now-30*60000-1,now+1000,0,'inválido',null]) {
    const stale = {...first.state,duration_request:{...first.state.duration_request,at:stamp},stay_date_pending:{...first.state.stay_date_pending,at:stamp}};
    const reply = turn('Somos 2 pessoas',stale);
    assert.equal(reply.state.duration_request,undefined,String(stamp));
    assert.equal(reply.state.stay_date_pending,undefined,String(stamp));
    assert.equal(reply.state.facts.check_out,undefined,String(stamp));
    assert.equal(reply.routed.quote_request,'NOQUOTE',String(stamp));
  }
});

test('duração expirada não reinterpreta duas datas novas como conflito do pedido antigo', () => {
  const first = turn('Quero hospedagem por 2 noites');
  const reply = turn('11/10 e 12/10',first.state,'NOQUOTE',now+31*60000);
  assert.equal(reply.state.duration_request,undefined);
  assert.equal(reply.state.stay_date_pending,undefined);
  assert.equal(reply.state.facts.check_in,'2026-10-11');
  assert.equal(reply.state.facts.check_out,'2026-10-12');
  assert.equal(reply.routed.quote_request,'QUOTE|2026-10-11|2026-10-12|2|NONE');
});

test('pendência de datas relativas sem check_out permanece segura até o cliente informar datas completas', () => {
  const first = turn('Quero hospedagem por 2 noites de hoje até amanhã',knownStay);
  assert.ok(first.state.stay_date_pending);
  assert.equal(first.state.stay_date_pending.check_out,undefined);
  for (const message of ['2','Somos 3 pessoas','Quero incluir mesa posta']) {
    const reply = turn(message,first.state,'QUOTE|2026-10-20|2026-10-25|2|NONE');
    assert.equal(reply.routed.quote_request,'NOQUOTE',message);
    assert.equal(reply.state.facts.check_in,undefined,message);
    assert.equal(reply.state.facts.check_out,undefined,message);
    assert.ok(reply.state.stay_date_pending,message);
    assert.match(reply.routed.answer,/dia\/m[eê]s|dd\/mm/i,message);
  }
});

test('FAQ, fotos, pacote e humano cancelam a pendência sem recuperar saída ambígua do histórico', () => {
  for (const message of ['Tem piscina?','Quero fotos da hidromassagem','Quero informações do pacote Réveillon','Quero falar com a recepção']) {
    const first = turn('Quero hospedagem por 2 noites de 11/10 a 12/10');
    const next = turn(message,first.state);
    assert.equal(next.state.stay_date_pending,undefined,message);
    assert.equal(next.state.duration_request,undefined,message);
    assert.equal(next.state.facts.check_out,undefined,message);
    if (message.includes('recepção')) assert.equal(next.routed.quote_request,'HUMANO');
    else assert.equal(next.routed.quote_request,'NOQUOTE',message);
    const following = turn('Somos 2 pessoas',next.state);
    assert.equal(following.state.facts.check_out,undefined,message);
    assert.equal(following.state.stay_date_pending,undefined,message);
  }
});

test('extras e composição familiar podem mudar sem resolver ou perder a duração ambígua', () => {
  const first = turn('Quero hospedagem por 2 noites de 11/10 a 12/10');
  const extra = turn('Quero incluir mesa posta',first.state);
  asksDurationClarification(extra);
  assert.deepEqual(extra.state.facts.extras,['MESA']);
  const family = turn('Somos um casal e uma criança de 5 anos',extra.state);
  asksDurationClarification(family);
  assert.equal(family.state.facts.guests,3);
  assert.equal(family.state.facts.children_pending,false);
  assert.deepEqual(family.state.facts.extras,['MESA']);
  assert.ok(family.state.stay_date_pending);
  const chosen = turn('Saída 13/10',family.state);
  assert.equal(chosen.routed.quote_request,'QUOTE|2026-10-11|2026-10-13|3|MESA');
});

test('duração consistente preserva a cotação de duas noites sem somar dia ao checkout', () => {
  for (const message of [
    'Quero hospedagem por 2 noites de 11/10 a 13/10',
    'Quero hospedagem por duas diárias de 11/10 a 13/10',
    'Quero hospedagem por 2 dias de 11/10 a 13/10',
  ]) {
    const result = turn(message);
    assert.equal(result.routed.quote_request, 'QUOTE|2026-10-11|2026-10-13|2|NONE');
    assert.equal(result.state.facts.check_out, '2026-10-13');
  }
});

test('dois dias de calendário com entrada e saída explícitas continuam uma noite', () => {
  for (const message of [
    'Quero hospedagem por 2 dias, entrada 11/10 e saída 12/10',
    'Quero hospedagem por 2 dias, check-in 11/10 e check-out 12/10',
    'Check-in 11/10 e check-out 12/10',
  ]) {
    const result = turn(message);
    assert.equal(result.routed.quote_request, 'QUOTE|2026-10-11|2026-10-12|2|NONE');
    assert.equal(result.state.facts.check_out, '2026-10-12');
  }
});

test('duração de Day Use e refeições não cria datas de quarto', () => {
  for (const message of [
    'Quero day use por 2 dias, dia 11/10 e dia 12/10, para 2 pessoas',
    'Quero almoço para visitantes por 2 dias, 11/10 e 12/10',
  ]) {
    const result = turn(message);
    assert.equal(result.routed.quote_request, 'NOQUOTE');
    assert.deepEqual(result.state.facts, knownGuests.facts);
    assert.ok(result.context.atendimento_informativo_em_foco);
  }
});

test('pacote e atendimento humano mantêm prioridade sobre a duração da estadia', () => {
  const packageResult = turn('Quero pacote de Réveillon por 2 noites, 30/12 e 31/12');
  assert.equal(packageResult.routed.quote_request, 'NOQUOTE');
  assert.equal(packageResult.state.topic, 'package_info');
  assert.match(packageResult.routed.answer, /pacote/);
  const human = turn('Quero falar com a recepção sobre 2 noites de 11/10 a 12/10');
  assert.equal(human.routed.quote_request, 'HUMANO');
  assert.deepEqual(human.state.facts, knownGuests.facts);
});

test('datas relativas sem viagem prévia pedem datas, sem assumir entrada ou saída', () => {
  for (const message of [
    'Quero hospedagem por 2 dias de hoje até amanhã',
    'Quero hospedagem por 2 noites de amanhã até depois de amanhã',
  ]) {
    const result = turn(message);
    assert.equal(result.routed.quote_request, 'NOQUOTE');
    assert.deepEqual(result.state.facts, knownGuests.facts);
    assert.match(result.routed.answer, /datas de entrada e sa[ií]da/i);
  }
});
