import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: { contents: `
    export { control, handleConversation } from './api/conversation-control.ts';
    export { publicEventInquiry, publicEventFollowup, publicEventAnswer, publicEventWeekdayReference } from './utils/publicEvents.ts';
    export { packageFollowup, packageWeekdayClarification, packageWeekdayReply } from './utils/packageContext.ts';
  `, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const { control, handleConversation, publicEventInquiry, publicEventFollowup, publicEventAnswer,
  publicEventWeekdayReference, packageFollowup, packageWeekdayClarification, packageWeekdayReply } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const now = Date.parse('2026-09-11T16:00:00-03:00');
const facts = { guests: 2, check_in: '2026-09-20', check_out: '2026-09-22', extras: ['MESA'] };
const pkg = { id: 'criancas', name: 'Dia das Crianças', start_date: '2026-10-09', end_date: '2026-10-12', updated_at: now };
const initial = { version: 2, facts, history: [], greeted: true, daily_greeting: { day: '2026-09-11', first: false },
  topic: 'package_info', topic_at: now, package_context: pkg };

test('F4: referência atual com dia da semana não é continuação do pacote de outubro', () => {
  for (const message of ['Qual a programação para esse sábado agora?', 'Tem programação neste sábado?',
    'Qual evento terá na próxima terça-feira?', 'Quem toca nessa sexta agora?']) {
    assert.equal(publicEventInquiry(message), true, message);
    assert.equal(publicEventWeekdayReference(message), 'current', message);
    assert.equal(packageFollowup(message), false, message);
    assert.equal(packageWeekdayClarification(message, pkg, now), undefined, message);
  }
  const answer = publicEventAnswer('Qual a programação para esse sábado agora?', now);
  assert.match(answer, /12\/09\/2026/);
  assert.match(answer, /Não tenho apresentação confirmada/);
  assert.doesNotMatch(answer, /outubro|10\/2026|05\/09|06\/09|17h|12h|não haverá|não tem música/i);
});

test('F4: sábado sem data com pacote válido exige pergunta, não escolhe calendário', () => {
  const message = 'Qual a programação de sábado?';
  assert.equal(publicEventWeekdayReference(message), 'ambiguous');
  assert.equal(publicEventInquiry(message), true);
  assert.equal(packageFollowup(message), false);
  const answer = packageWeekdayClarification(message, pkg, now);
  assert.match(answer, /sábado do pacote.*ou do próximo sábado/);
  assert.doesNotMatch(answer, /12\/09|10\/10|Heraldo|confirmad|R\$/);
  assert.equal(packageWeekdayClarification(message, undefined, now), undefined);
  assert.equal(packageWeekdayClarification(message, pkg, now + 31 * 60000), undefined);
  assert.equal(packageWeekdayClarification('Qual a programação de terça-feira?', pkg, now)?.includes('da próxima terça-feira'), true);
});

test('resposta curta à clarificação conserva intenção de programação sem escolher data por sim ou número', () => {
  const question = packageWeekdayClarification('Qual a programação de sábado?', pkg, now);
  for (const [message, expected] of [
    ['próximo sábado', 'Qual a programação do próximo sábado?'],
    ['o próximo', 'Qual a programação do próximo sábado?'],
    ['do próximo', 'Qual a programação do próximo sábado?'],
    ['do pacote', 'Qual a programação de sábado do pacote?'],
    ['sábado do pacote', 'Qual a programação de sábado do pacote?'],
    ['no sábado do pacote', 'Qual a programação de sábado do pacote?'],
    ['12/09', 'Qual a programação do hotel em 12/09?'],
    ['dia 12/09/2026', 'Qual a programação do hotel em 12/09/2026?'],
    ['hoje', 'Qual a programação de hoje?'],
    ['amanhã?', 'Qual a programação de amanhã?'],
  ]) {
    const expanded = packageWeekdayReply(message, question);
    assert.equal(expanded, expected, message);
    assert.equal(publicEventInquiry(expanded), !expanded.includes('do pacote'), message);
  }
  for (const message of ['sim', 'não', '2', '1', '31/02', '40/13']) {
    assert.equal(packageWeekdayReply(message, question), question, message);
  }
  for (const message of ['Quero reservar um quarto', 'Qual o cardápio?', 'Humano', 'Paguei minha reserva',
    '2 adultos e 1 criança', 'Vou chegar 12/09 e sair 14/09', 'não quero o pacote', 'fotos do sábado']) {
    assert.equal(packageWeekdayReply(message, question), undefined, message);
  }
  assert.equal(packageWeekdayReply('o próximo', 'Qual o horário do check-in?'), undefined);
  const tuesday = packageWeekdayClarification('Qual a programação de terça-feira?', pkg, now);
  assert.equal(packageWeekdayReply('a próxima', tuesday), 'Qual a programação da próxima terça-feira?');
  assert.equal(packageWeekdayReply('o próximo', 'Programação de sábado: a do pacote ou do próximo sábado?'), 'Qual a programação do próximo sábado?');
});

test('sábado do pacote e datas explícitas não são reinterpretados como próximo sábado', () => {
  for (const message of ['Qual a programação no sábado do pacote?', 'No sábado do pacote', 'Qual a programação de sábado do Dia das Crianças?']) {
    assert.equal(publicEventWeekdayReference(message), 'package', message);
    assert.equal(publicEventInquiry(message), false, message);
    assert.equal(packageFollowup(message), true, message);
    assert.equal(packageWeekdayClarification(message, pkg, now), undefined, message);
  }
  for (const message of ['Qual a programação de sábado, 10/10/2026?', 'Qual a programação no sábado 10 de outubro de 2026?',
    'Qual a programação do sábado 2026-10-10?']) {
    assert.equal(publicEventWeekdayReference(message), 'explicit_date', message);
    assert.equal(packageWeekdayClarification(message, pkg, now), undefined, message);
    const answer = publicEventAnswer(message, now);
    assert.match(answer, /10\/10\/2026/);
    assert.doesNotMatch(answer, /12\/09|19\/09|05\/09|06\/09/);
  }
});

test('weekday respeita calendário de Belém, hoje, próximo e virada de ano', () => {
  for (const [clock, message, expected] of [
    ['2026-09-11T16:00:00-03:00', 'Programação de sábado agora?', '12/09/2026'],
    ['2026-09-12T16:00:00-03:00', 'Programação deste sábado?', '12/09/2026'],
    ['2026-09-12T16:00:00-03:00', 'Programação do próximo sábado?', '19/09/2026'],
    ['2026-09-13T02:59:59Z', 'Programação desse sábado agora?', '12/09/2026'],
    ['2026-09-13T03:00:00Z', 'Programação desse sábado agora?', '19/09/2026'],
    ['2026-09-11T16:00:00-03:00', 'Programação de sexta da semana que vem?', '18/09/2026'],
    ['2026-12-31T23:50:00-03:00', 'Programação da próxima sexta?', '01/01/2027'],
  ]) assert.ok(publicEventAnswer(message, Date.parse(clock)).includes(expected), `${clock}: ${message}`);
  assert.match(publicEventAnswer('Qual era a programação de sábado passado?', now), /05\/09\/2026, às 17h/);
  assert.match(publicEventAnswer('Qual era a programação de sábado passado?', now), /horários já passados/);
});

test('dias da semana não transformam hospedagem, passeio, cardápio ou evento privado em show', () => {
  for (const message of ['Quero reservar o Loft para sábado', 'Quero organizar minha festa de sábado',
    'Qual a programação do passeio de barco neste sábado?', 'Qual o cardápio de sábado?', 'Sábado', 'Na próxima sexta']) {
    assert.equal(publicEventInquiry(message), false, message);
    assert.equal(packageWeekdayClarification(message, pkg, now), undefined, message);
  }
  for (const message of ['E sábado?', 'No próximo sábado?', 'Na próxima terça-feira?']) {
    assert.equal(publicEventFollowup(message), true, message);
  }
});

async function routeAfterPackage(message, audio = false) {
  const user_message = audio ? 'https://media.example.com/weekday-current.ogg' : message;
  const prepared = await handleConversation({ operation: 'prepare', state: initial, user_message },
    '', async () => message, now);
  const routed = control({ operation: 'route', state: prepared.state, user_message,
    proposed: 'QUOTE|2026-10-09|2026-10-12|5|NONE', ai_response: 'O sábado será o do Dia das Crianças, em outubro.' }, now);
  return { prepared, routed, state: JSON.parse(routed.state) };
}

test('F4 texto e áudio após pacote: sábado agora responde 12/09 e preserva fatos da estadia', async () => {
  for (const audio of [false, true]) {
    const { routed, state } = await routeAfterPackage('Qual a programação para esse sábado agora?', audio);
    assert.equal(routed.quote_request, 'NOQUOTE');
    assert.equal(routed.can_collect, 'NAO');
    assert.equal(state.topic, 'public_events');
    assert.equal(state.package_context, undefined);
    assert.deepEqual(state.facts, facts);
    assert.match(routed.answer, /12\/09\/2026/);
    assert.doesNotMatch(routed.answer, /outubro|10\/2026|05\/09|06\/09|17h|12h|opções do pacote|R\$/i);
  }
});

test('F4 texto e áudio após pacote: sábado ambíguo pergunta sem cotar nem selecionar data', async () => {
  for (const audio of [false, true]) {
    const { routed, state } = await routeAfterPackage('Qual a programação de sábado?', audio);
    assert.equal(routed.quote_request, 'NOQUOTE');
    assert.equal(routed.can_collect, 'NAO');
    assert.deepEqual(state.facts, facts);
    assert.match(routed.answer, /sábado do pacote.*ou do próximo sábado/);
    assert.doesNotMatch(routed.answer, /12\/09|10\/10|05\/09|06\/09|opções do pacote|Heraldo|R\$/i);
  }
});
