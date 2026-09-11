import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

// Owner-confirmed descriptive policies only; no provider, inventory or sends.
const policyBundle = await build({ entryPoints: ['utils/familyAccommodation.ts'],
  bundle: true, write: false, platform: 'node', format: 'esm' });
const { familyAccommodationPolicy, familyAccommodation, baseRoomCapacity, familyBeddingRule,
  familyRoomRule, familyRoomExplanation, coupleRoomConfigurationText } = await import(
  'data:text/javascript;base64,' + Buffer.from(policyBundle.outputFiles[0].text).toString('base64'));
const now = Date.now();
const dates = { check_in: '2026-09-20', check_out: '2026-09-22' };
function familyState(ages, adults = 2) {
  return { version: 2, history: [], greeted: true,
    facts: { ...dates, guests: adults + ages.length, extras: [], children_pending: false },
    family_party: { adults, children: ages.length, ages_months: ages, updated_at: now } };
}

test('berço/cama infantil e duplo são regras descritivas, com consulta e sem ampliar ocupação', () => {
  assert.equal(familyAccommodationPolicy.max_base_capacity, 4);
  assert.equal(familyAccommodationPolicy.max_complimentary_children_per_room, 1);
  assert.equal(familyAccommodationPolicy.child_age_months_exclusive, 84);
  assert.equal(familyAccommodationPolicy.crib.complimentary, true);
  assert.equal(familyAccommodationPolicy.extra_bed.complimentary_for_allowance_child_only, true);
  assert.match(familyBeddingRule, /berço é gratuito.*solicitação.*disponibilidade/);
  assert.match(familyBeddingRule, /criança de até 6 anos em cortesia.*cama extra gratuita/);
  assert.match(familyBeddingRule, /não precisa obrigatoriamente compartilhar/);
  assert.match(familyBeddingRule, /compatibilidade com o apartamento/);
  assert.match(familyBeddingRule, /Nenhum item está reservado ou instalado/);
  assert.match(coupleRoomConfigurationText, /duplo com duas camas de solteiro.*quando solicitado/);
  assert.match(coupleRoomConfigurationText, /confirmar a configuração e a disponibilidade/);
  assert.match(familyRoomRule, /categoria maior é opcional/);
  assert.doesNotMatch(familyRoomRule, /Isso não garante cama extra|berço pago|cama extra gratuita para adultos/);
  assert.deepEqual(familyAccommodation(familyState([60]), 3, now), {
    pending: false, children: 1, eligible: 1, key: '[2,1,[60]]',
  });
  assert.deepEqual(familyAccommodation(familyState([84]), 3, now), {
    pending: false, children: 1, eligible: 0, key: '[2,1,[84]]',
  });
  assert.equal(baseRoomCapacity(6), 4);
});

test('explicação apresenta cama gratuita apenas no grupo com criança elegível e não promete instalação', () => {
  for (const text of [familyRoomExplanation(3, 1), familyRoomExplanation(6, 1, true)]) {
    assert.match(text, /berço é gratuito/);
    assert.match(text, /criança de até 6 anos em cortesia.*cama extra gratuita/);
    assert.match(text, /disponibilidade dos itens/);
    assert.match(text, /Nenhum item está reservado ou instalado/);
  }
  assert.doesNotMatch(familyRoomExplanation(3, 0), /cama extra gratuita/);
  assert.doesNotMatch(familyRoomExplanation(6, 0, true), /cama extra gratuita/);
});

const rooms = [
  { id: 'casal', name: 'Suíte Casal', capacity: 2, base_price: 500, overrides: [] },
  { id: 'triplo', name: 'Suíte Triplo', capacity: 3, base_price: 700, overrides: [] },
  { id: 'loft', name: 'Loft', capacity: 4, base_price: 900, overrides: [] },
];
const data = JSON.stringify({ room_types: rooms, packages: [], extras: [] });
const pricesBundle = await build({ entryPoints: ['api/get-prices.ts'], bundle: true, write: false,
  platform: 'node', format: 'esm',
  define: { 'process.env.VITE_SUPABASE_URL': '"https://fixture.invalid"',
    'process.env.VITE_SUPABASE_ANON_KEY': '"fixture"' },
  plugins: [{ name: 'read-only-bedding-fixture', setup(builder) {
    builder.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'fixture', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: `
      const data = ${data};
      export function createClient() { return { from(table) {
        if (!(table in data)) throw new Error('Unexpected table: ' + table);
        return { select() { return { eq() { return Promise.resolve({ data: data[table], error: null }); } }; } };
      } }; }
    ` }));
  } }],
});
const handler = (await import('data:text/javascript;base64,' + Buffer.from(pricesBundle.outputFiles[0].text).toString('base64'))).default;
async function quote(guests, state) {
  let status, payload;
  await handler({ method: 'POST', body: { checkIn: dates.check_in, checkOut: dates.check_out, guests, state } },
    { status(value) { status = value; return this; }, json(value) { payload = value; return value; } });
  assert.equal(status, 200);
  return { ...payload, quote: JSON.parse(payload.quote_state) };
}

test('cotação familiar conserva preço/capacidade/ocupantes e apresenta berço/cama e opção duplo', async () => {
  const result = await quote(3, familyState([60]));
  assert.deepEqual(result.quote.options, [
    { name: 'Suíte Casal', capacity: 3, total: 1000, child_allowance: 1 },
    { name: 'Loft', capacity: 5, total: 1800, child_allowance: 1 },
    { name: 'Suíte Triplo', capacity: 4, total: 1400, child_allowance: 1 },
  ]);
  assert.equal(result.quote.guests, 3);
  assert.equal(result.quote.family_key, '[2,1,[60]]');
  assert.equal(result.availability_checked, false);
  for (const text of [result.conversation_text, result.whatsapp_text, result.prices_summary]) {
    assert.match(text, /criança de até 6 anos em cortesia.*cama extra gratuita/s);
    assert.match(text, /berço é gratuito/);
    assert.match(text, /duplo com duas camas de solteiro/);
    assert.match(text, /confirmar a configuração e a disponibilidade/);
    assert.doesNotMatch(text, /Isso não garante cama extra/);
  }
});

test('dois adultos recebem configuração duplo sem cama extra gratuita nem mudança de valores', async () => {
  const result = await quote(2);
  assert.deepEqual(result.quote.options, [
    { name: 'Loft', capacity: 4, total: 1800 },
    { name: 'Suíte Triplo', capacity: 3, total: 1400 },
    { name: 'Suíte Casal', capacity: 2, total: 1000 },
  ]);
  assert.match(result.conversation_text, /duplo com duas camas de solteiro/);
  assert.doesNotMatch(result.conversation_text, /cama extra gratuita/);
  const olderChild = await quote(3, familyState([84]));
  assert.deepEqual(olderChild.quote.options, [
    { name: 'Loft', capacity: 4, total: 1800 },
    { name: 'Suíte Triplo', capacity: 3, total: 1400 },
  ]);
  assert.doesNotMatch(olderChild.conversation_text, /cama extra gratuita|duplo com duas camas de solteiro/);
});
