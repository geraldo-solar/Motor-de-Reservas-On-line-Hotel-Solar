import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const result = await build({
  entryPoints: ['utils/packageReply.ts'], bundle: true, write: false,
  platform: 'node', format: 'esm',
});
const { packagePrices, packageRecommendation } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
);

const rooms = [
  { id: 'casal', name: 'Suíte Casal', capacity: 2, base_price: 500 },
  { id: 'loft', name: 'Loft', capacity: 4, base_price: 800 },
  { id: 'triplo', name: 'Suíte Tripla', capacity: 3, base_price: 600 },
];
const pkg = {
  id: 'reveillon', name: 'Réveillon Solar 2027',
  start_iso_date: '2026-12-31', end_iso_date: '2027-01-03',
  full_period_discount_pct: 10,
};

test('preços explícitos têm prioridade, aceitam os dois nomes do ID e preservam centavos', () => {
  const actual = packagePrices({ ...pkg, room_prices: [
    { roomId: 'triplo', price: 1800.42 }, { room_id: 'loft', price: 2345.67 },
    { roomId: 'casal', price: 0 },
  ] }, rooms);
  assert.equal(actual.label, '💰 *Valores cadastrados por acomodação:*');
  assert.deepEqual(actual.prices, [
    { id: 'loft', name: 'Loft', capacity: 4, price: 2345.67 },
    { id: 'triplo', name: 'Suíte Tripla', capacity: 3, price: 1800.42 },
  ]);
});

test('simulação usa cada diária sem checkout, overrides nas duas formas e desconto do período', () => {
  const actual = packagePrices(pkg, [{
    id: 'loft', name: 'Loft', capacity: 4, base_price: 800,
    overrides: [
      { dateIso: '2026-12-31', price: 1000 },
      { date_iso: '2027-01-01', price: 900 },
      { dateIso: '2027-01-03', price: 90000 },
    ],
  }]);
  assert.equal(actual.label, '💰 *Simulação cadastrada para o período completo:*');
  assert.equal(actual.prices[0].price, 2430);
});

test('comparação para casal e criança mantém pacote e exclui acomodação de dois lugares', () => {
  const reply = packageRecommendation(pkg, rooms, 3);
  assert.match(reply, /Réveillon Solar 2027/);
  assert.match(reply, /31\/12\/2026 a 03\/01\/2027/);
  assert.match(reply, /3 hóspedes, contando adultos e crianças/);
  assert.match(reply, /Opção premium[^\n]*Loft[^\n]*R\$ 2\.160,00/);
  assert.match(reply, /Outra opção[^\n]*Suíte Tripla[^\n]*R\$ 1\.620,00/);
  assert.doesNotMatch(reply, /Suíte Casal|setembro|20\/09|qual.*data|informe.*data|gratuid|grátis/i);
  assert.match(reply, /sem confirmar disponibilidade ou reserva/);
});

test('sem ocupação não inicia cotação e pede apenas o grupo no contexto do pacote', () => {
  for (const guests of [undefined, 0, -1, NaN, 2.5]) {
    const reply = packageRecommendation(pkg, rooms, guests);
    assert.match(reply, /Réveillon Solar 2027/);
    assert.match(reply, /31\/12\/2026 a 03\/01\/2027/);
    assert.match(reply, /Quantas pessoas/);
    assert.doesNotMatch(reply, /R\$|informe.*data|qual.*data/i);
  }
});

test('preço explícito de quarto desconhecido impede indicação inventada ou fallback silencioso', () => {
  const input = { ...pkg, room_prices: [{ roomId: 'fantasma', price: 999 }] };
  assert.equal(packagePrices(input, rooms).prices[0].id, 'fantasma');
  const reply = packageRecommendation(input, rooms, 3);
  assert.match(reply, /Não encontrei valores e capacidades cadastrados suficientes/);
  assert.doesNotMatch(reply, /premium|Outra opção|R\$/);
});

test('capacidade desconhecida ou inválida e preço não finito nunca geram recomendação', () => {
  const invalidRooms = [
    { id: 'missing', name: 'Sem capacidade', base_price: 1000 },
    { id: 'fraction', name: 'Fracionado', capacity: 3.5, base_price: 1100 },
    { id: 'infinite', name: 'Infinito', capacity: Infinity, base_price: 1200 },
    { id: 'negative', name: 'Negativo', capacity: -3, base_price: 1300 },
    { id: 'price', name: 'Sem preço válido', capacity: 4, base_price: Infinity },
  ];
  const reply = packageRecommendation(pkg, invalidRooms, 3);
  assert.match(reply, /Não encontrei valores e capacidades cadastrados suficientes/);
  assert.doesNotMatch(reply, /premium|Outra opção|R\$/);
});

test('resposta respeita 1800 caracteres sem remover ressalva em catálogos longos', () => {
  const longRooms = Array.from({ length: 100 }, (_, index) => ({
    id: String(index), name: `Acomodação ${index} ${'nome muito longo '.repeat(20)}`,
    capacity: 4, base_price: 500 + index,
  }));
  const reply = packageRecommendation({ ...pkg, name: 'Réveillon '.repeat(200) }, longRooms, 3);
  assert.ok(reply.length <= 1800, `Length: ${reply.length}`);
  assert.match(reply, /Opção premium/);
  assert.match(reply, /sem confirmar disponibilidade ou reserva/);
});
