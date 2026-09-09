import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundled = await build({
  entryPoints: ['utils/diningPolicy.ts'], bundle: true, write: false,
  platform: 'node', format: 'esm',
});
const { confirmedDiningPolicy, diningPolicyAnswer } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);

test('política auditável registra confirmação atual e horários mantidos pelo responsável', () => {
  assert.equal(confirmedDiningPolicy.confirmed_at, '2026-09-08');
  assert.match(confirmedDiningPolicy.confirmed_by, /Geraldo Barros/);
  assert.equal(confirmedDiningPolicy.hours.solar_73.opens, '11:00');
  assert.equal(confirmedDiningPolicy.hours.solar_73.closes, '23:00');
  assert.deepEqual(confirmedDiningPolicy.hours.reserva_solar.low_season, {
    weekdays: ['sexta-feira', 'sábado', 'domingo'],
    opens: '10:00', closes: '18:00', approximate: true,
  });
  assert.equal(confirmedDiningPolicy.hours.special_date_hours_confirmed, false);
});

test('nenhuma tarifa automática ou data de cobrança é inventada a partir de férias/feriados', () => {
  const policy = confirmedDiningPolicy.reserva_solar_admission;
  assert.equal(policy.default, 'free');
  assert.equal(policy.charge_requires_owner_authorized_date, true);
  assert.equal(policy.infer_charge_from_holiday_or_vacation, false);
  assert.equal(policy.default_paid_amount, null);
  assert.deepEqual(policy.authorized_charge_dates, []);
});

test('café para visitantes usa informação atual da equipe e não promete buffet nem cortesia infantil', () => {
  const breakfast = confirmedDiningPolicy.breakfast_visitors;
  assert.equal(breakfast.available, true);
  assert.equal(breakfast.price_brl_per_person, 75);
  assert.equal(breakfast.observed_at, '2026-09-08');
  assert.match(breakfast.source, /Resposta da equipe/);
  assert.match(breakfast.service_note, /pode ser à la carte/);
  assert.equal(breakfast.visitor_children_price_confirmed, false);
  assert.equal(confirmedDiningPolicy.reserva_solar_admission.default, 'free');
  assert.match(confirmedDiningPolicy.restaurant_visits.ordinary_seating, /ordem de chegada/);
  assert.match(confirmedDiningPolicy.restaurant_visits.scope, /Eventos, Mesa Posta/);
});

test('dúvidas explícitas de entrada do Reserva Solar recebem regra gratuita sem R$40', () => {
  for (const message of [
    'O Reserva Solar cobra entrada?',
    'Qual o preço do ingresso no Reserva Solar?',
    'Quanto custa para entrar no Reserva Solar?',
    'A entrada do Reserva Solar é gratuita?',
    'O Reserva Solar é pago?',
    'Precisa pagar para visitar o Reserva Solar?',
    'Quanto custa o day use no Reserva Solar?',
    'É R$40 para entrar no Reserva Solar?',
    'A entrada de R$40 no Reserva Solar ainda existe?',
    'Pode entrar de graça no Reserva Solar?',
    'No feriado preciso pagar para entrar no Reserva Solar?',
    'Qual o valor de entrada no Reserva Solar durante as férias?',
  ]) {
    const reply = diningPolicyAnswer(message);
    assert.equal(typeof reply, 'string', message);
    assert.match(reply, /entrada no Reserva Solar é gratuita como regra/i, message);
    assert.match(reply, /datas de grande movimento previamente informadas/i, message);
    assert.doesNotMatch(reply, /R\$|\b40\b|sempre gratuit|aberto|confirmad[ao]|garantid[ao]/i, message);
  }
});

test('data específica não gera garantia de funcionamento nem tarifa especial não autorizada', () => {
  for (const message of [
    'Qual o valor da entrada no Reserva Solar hoje?',
    'Quanto custa entrar no Reserva Solar em 15/09/2026?',
    'No feriado de amanhã a entrada do Reserva Solar é paga?',
  ]) {
    const reply = diningPolicyAnswer(message);
    assert.match(reply, /gratuita como regra/i, message);
    assert.doesNotMatch(reply, /(?:hoje|amanhã).*aberto|funciona|R\$|garant|cobrança confirmada/i, message);
  }
});

test('nome explícito Reserva Solar é obrigatório e preço genérico não é tratado como ingresso', () => {
  for (const message of [
    'Quanto custa o day use?',
    'O hotel cobra entrada?',
    'Qual o preço da entrada no Solar 73?',
    'Quanto custa o Reserva Solar?',
    'Qual o horário do Reserva Solar?',
    'O Solar 73 abre hoje?',
  ]) assert.equal(diningPolicyAnswer(message), undefined, message);
});

test('não substitui fotos, cardápio, café, refeições, consumo ou preços de itens', () => {
  for (const message of [
    'Pode enviar uma foto da entrada do Reserva Solar?',
    'Qual o valor da entrada de camarão do Reserva Solar?',
    'Qual o preço da entrada com queijo do Reserva Solar?',
    'Qual o preço dos pratos e da entrada no Reserva Solar?',
    'Me envie o cardápio e o valor da entrada do Reserva Solar',
    'Tem café da manhã gratuito no Reserva Solar?',
    'O almoço é gratuito no Reserva Solar?',
    'Qual o valor do jantar no Reserva Solar?',
    'Quanto custa o couvert no Reserva Solar?',
    'Quanto preciso consumir para entrar no Reserva Solar?',
  ]) assert.equal(diningPolicyAnswer(message), undefined, message);
});

test('eventos públicos/privados, hospedagem e problemas de cobrança mantêm suas rotas', () => {
  for (const message of [
    'Qual o valor da entrada para o show de Heraldo Ramos no Reserva Solar?',
    'Quanto custa a entrada para a música ao vivo no Reserva Solar?',
    'Quero um orçamento de casamento no Reserva Solar com entrada para 50 pessoas',
    'Qual o valor da entrada para a festa no Reserva Solar?',
    'Quanto custa uma diária com entrada no Reserva Solar?',
    'Paguei a entrada no Reserva Solar e fui cobrado duas vezes',
    'O valor da entrada no Reserva Solar está errado',
    'Quero falar com um atendente sobre o valor da entrada no Reserva Solar',
  ]) assert.equal(diningPolicyAnswer(message), undefined, message);
});
