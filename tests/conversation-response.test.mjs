import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const rooms = [
  { id: 'casal', name: 'Suíte Casal', capacity: 2, base_price: 500, overrides: [] },
  { id: 'loft', name: 'Loft', capacity: 4, base_price: 900, overrides: [] },
];
const packages = [
  { id: 'independencia', name: 'Independência Solar', start_iso_date: '2026-09-04', end_iso_date: '2026-09-07', description: 'Praia e descanso.', includes: ['Música ao vivo'], benefits: [], room_prices: [], no_checkin_dates: [], no_checkout_dates: [] },
  { id: 'reveillon', name: 'Réveillon Solar 2027', start_iso_date: '2026-12-31', end_iso_date: '2027-01-03', description: 'Celebração de Ano-Novo.', includes: [], benefits: [], room_prices: [], no_checkin_dates: [], no_checkout_dates: [] },
];

async function loadHandler(file, fixturePackages = packages) {
  const fixture = JSON.stringify({ room_types: rooms, packages: fixturePackages, extras: [] });
  const result = await build({
    entryPoints: [file], bundle: true, write: false, platform: 'node', format: 'esm',
    define: { 'process.env.VITE_SUPABASE_URL': '"https://fixture.invalid"', 'process.env.VITE_SUPABASE_ANON_KEY': '"fixture"' },
    plugins: [{ name: 'read-only-fixtures', setup(builder) {
      builder.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'supabase-fixture', namespace: 'test' }));
      builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
        const data = ${fixture};
        export function createClient() {
          return { from(table) {
            if (!(table in data)) throw new Error('Unexpected table access: ' + table);
            return { select() { return { eq() { return Promise.resolve({data: data[table], error: null}); } }; } };
          } };
        }
      `, loader: 'js' }));
    } }],
  });
  return (await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)).default;
}

async function request(handler, body) {
  let status, payload;
  await handler({ method: 'POST', body }, { status(code) { status = code; return this; }, json(value) { payload = value; return value; } });
  assert.equal(status, 200);
  return payload;
}

function assertSameAmounts(legacy, conversational) {
  const values = value => value.match(/R\$\s*[\d.,]+/g) || [];
  assert.deepEqual(values(conversational), values(legacy));
  assert.doesNotMatch(conversational, /98100|wa\.me|ligue|pelo WhatsApp/i);
}

test('cotação mantém valores, ordenação premium, extras e formato legado', async () => {
  const handler = await loadHandler('api/get-prices.ts');
  const result = await request(handler, { quote_request: 'QUOTE|2026-09-20|2026-09-25|2|BARCO,MESA' });
  assertSameAmounts(result.whatsapp_text, result.conversation_text);
  assert.match(result.whatsapp_text, /98100-0800/);
  assert.match(result.conversation_text, /Qual acomodação você prefere/);
  assert.match(result.conversation_text, /nome completo, e-mail e CPF/);
  assert.ok(result.conversation_text.indexOf('Loft') < result.conversation_text.indexOf('Suíte Casal'));
  assert.equal(result.availability_checked, false);
  assert.equal(result.extras_total, 530);
});

test('ocupação filtra apartamentos e Réveillon parcial propõe cotação completa sem telefone', async () => {
  const handler = await loadHandler('api/get-prices.ts');
  const three = await request(handler, { checkIn: '2026-09-20', checkOut: '2026-09-25', guests: 3 });
  assert.doesNotMatch(three.conversation_text, /Suíte Casal/);
  const restricted = await request(handler, { checkIn: '2027-01-01', checkOut: '2027-01-03', guests: 2 });
  assert.equal(restricted.policy_restriction, 'package_full_period_only');
  assert.match(restricted.conversation_text, /31\/12\/2026 a 03\/01\/2027/);
  assert.match(restricted.conversation_text, /Quer que eu apresente/);
  assert.doesNotMatch(restricted.conversation_text, /98100/);
});

test('pacote dinâmico preserva preços e imagem, mas continua qualificação na conversa', async () => {
  const handler = await loadHandler('api/resolve-package.ts');
  const result = await request(handler, { user_message: 'Quero saber do pacote Independência Solar' });
  assert.equal(result.package_id, 'independencia');
  assertSameAmounts(result.quote_text, result.conversation_text);
  assert.match(result.quote_text, /98100-0800/);
  assert.match(result.conversation_text, /aproveitando o que você já informou/);
  assert.match(result.conversation_text, /não confirmam disponibilidade/);
});

test('lista, ausência de pacote e texto longo também expõem saída conversacional sem telefone', async () => {
  const handler = await loadHandler('api/resolve-package.ts');
  const list = await request(handler, { user_message: 'quais pacotes existem?' });
  assert.equal(list.match_type, 'list');
  assert.equal(list.conversation_text, list.quote_text);
  const faq = await request(handler, { user_message: 'bom dia' });
  assert.equal(faq.conversation_text, '');
  const longHandler = await loadHandler('api/resolve-package.ts', [{ ...packages[0], description: 'Detalhes da programação. '.repeat(200) }]);
  const long = await request(longHandler, { user_message: 'Independência Solar' });
  assert.ok(long.conversation_text.length <= 1901);
  assert.doesNotMatch(long.conversation_text, /98100/);
  const emptyHandler = await loadHandler('api/resolve-package.ts', []);
  const empty = await request(emptyHandler, { user_message: 'pacotes' });
  assert.match(empty.conversation_text, /para quantas pessoas/);
});
