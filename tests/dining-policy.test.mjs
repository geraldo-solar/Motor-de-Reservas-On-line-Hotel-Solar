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
  assert.equal(confirmedDiningPolicy.confirmed_at, '2026-09-11');
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

test('café avulso usa as faixas infantis confirmadas sem apresentar R$75 como preço universal', () => {
  const breakfast = confirmedDiningPolicy.breakfast_visitors;
  assert.equal(breakfast.available, true);
  assert.match(breakfast.age_basis, /anos completos/);
  assert.equal(breakfast.confirmed_at, '2026-09-11');
  assert.match(breakfast.source, /Confirmação explícita do responsável/);
  assert.deepEqual(breakfast.prices_brl_by_age, [
    { min_age_years: 0, max_age_years: 6, price_brl_per_person: 0 },
    { min_age_years: 7, max_age_years: 12, price_brl_per_person: 35 },
    { min_age_years: 13, max_age_years: null, price_brl_per_person: 75 },
  ]);
  for (const [age, price] of [[0, 0], [6, 0], [7, 35], [12, 35], [13, 75], [65, 75]]) {
    const matching = breakfast.prices_brl_by_age.filter(band => age >= band.min_age_years
      && (band.max_age_years === null || age <= band.max_age_years));
    assert.equal(matching.length, 1, `A idade ${age} deve pertencer a uma única faixa`);
    assert.equal(matching[0].price_brl_per_person, price);
  }
  assert.equal(breakfast.price_brl_per_person, undefined);
  assert.equal(breakfast.visitor_children_price_confirmed, true);
});

test('café mantém os mesmos preços no buffet e à la carte sem garantir modalidade ou funcionamento', () => {
  const breakfast = confirmedDiningPolicy.breakfast_visitors;
  assert.match(breakfast.price_note, /Até 6 anos: cortesia; de 7 a 12 anos: R\$35; a partir de 13 anos: R\$75/);
  assert.match(breakfast.price_note, /mesmos valores se aplicam ao buffet e ao à la carte/);
  assert.match(breakfast.service_note, /pode ser à la carte/);
  assert.match(breakfast.service_note, /Não garantir buffet/);
  assert.deepEqual(breakfast.hours, { opens: '07:00', closes: '10:00' });
  assert.ok(confirmedDiningPolicy.limits.some(limit => /horários gerais não comprovam funcionamento em tempo real/.test(limit)));
  assert.ok(confirmedDiningPolicy.limits.some(limit => /Não aplicar esses valores a diárias, ceias ou outros serviços/.test(limit)));
});

test('café de visitantes durante a semana exige agendamento com recepção inclusive no à la carte', () => {
  const booking = confirmedDiningPolicy.breakfast_visitors.weekday_booking;
  assert.equal(booking.required, true);
  assert.equal(booking.channel, 'recepção');
  assert.deepEqual(booking.applies_to, ['buffet', 'à la carte']);
  assert.match(booking.note, /agendar previamente com a recepção durante a semana/);
  assert.match(booking.note, /não confirma agendamento, disponibilidade ou funcionamento na data/);
  assert.ok(confirmedDiningPolicy.limits.some(limit => /Não afirmar agendamento executado/.test(limit)));
});

test('agendamento do café não muda a gratuidade do Reserva Solar nem a ordem de chegada de visitas comuns', () => {
  assert.equal(confirmedDiningPolicy.reserva_solar_admission.default, 'free');
  assert.match(confirmedDiningPolicy.restaurant_visits.ordinary_seating, /ordem de chegada/);
  assert.match(confirmedDiningPolicy.restaurant_visits.scope, /café avulso.*durante a semana exige agendamento prévio/);
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
