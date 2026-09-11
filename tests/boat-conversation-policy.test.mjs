import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

// Descriptive IA policy and channel-scoped quote guard; no network or sends.
const mediaBuild = await build({ entryPoints: ['utils/extraMedia.ts'], bundle: true,
  write: false, platform: 'node', format: 'esm' });
const { extraCaption, extraMediaResult, nextExtraMedia, explicitPackageBoatBenefit, safeBoatCopy } = await import(
  'data:text/javascript;base64,' + Buffer.from(mediaBuild.outputFiles[0].text).toString('base64'));
const extras = [{ id: 'boat', name: 'Passeio de Barco', price: 350 }];
const rooms = [{ id: 'casal', name: 'Suíte Casal', capacity: 2, base_price: 500, overrides: [] }];
const ci = '2026-09-20', co = '2026-09-22';
async function handlerFor(fixturePackages = [], file = 'api/get-prices.ts') {
  const data = JSON.stringify({ room_types: rooms, packages: fixturePackages, extras });
  const bundle = await build({ entryPoints: [file], bundle: true, write: false,
    platform: 'node', format: 'esm',
    define: { 'process.env.VITE_SUPABASE_URL': '"https://fixture.invalid"', 'process.env.VITE_SUPABASE_ANON_KEY': '"fixture"' },
    plugins: [{ name: 'read-only-boat-fixture', setup(builder) {
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
  return (await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))).default;
}
async function request(handler, body, operation) {
  let status, payload;
  await handler({ method: 'POST', body, ...(operation ? { query: { operation } } : {}) }, {
    status(value) { status = value; return this; }, json(value) { payload = value; return value; },
  });
  assert.equal(status, 200);
  return payload;
}
const quoteRequest = `QUOTE|${ci}|${co}|2|BARCO`;
const baseBody = { checkIn: ci, checkOut: co, guests: 2, extras: ['BARCO'] };

test('legenda e fila de fotos do barco não divulgam preço fixo, duração ou maré garantidos', () => {
  const texts = [extraCaption('BARCO', extras), extraMediaResult(['BARCO'], extras).conversation_text,
    nextExtraMedia('EXTRA_ID|MESA|BARCO|PAID', extras).conversation_text];
  for (const text of texts) {
    assert.match(text, /terceiros, sob consulta/);
    assert.match(text, /Valores, horários, duração e disponibilidade.*recepção/);
    assert.doesNotMatch(text, /R\$|350|2h|maré cheia|até 4 pessoas/);
  }
  const included = extraCaption('BARCO', extras, true);
  assert.match(included, /Já incluído no pacote informado, sem cobrança adicional/);
  assert.match(included, /Horários, duração e disponibilidade.*recepção/);
  assert.doesNotMatch(included, /R\$|350|2h|maré cheia/);
});

test('menção de barco ou exclusão na descrição não comprova benefício de pacote', () => {
  for (const pkg of [undefined, { description: 'Passeio de barco com terceiros, sob consulta.' },
    { description: 'O barco não está incluído no pacote.' }, { includes: ['Barco pago à parte'] },
    { benefits: ['Sem passeio de barco'] }]) assert.equal(explicitPackageBoatBenefit(pkg), false);
  for (const pkg of [{ includes: ['Passeio de barco'] }, { benefits: ['Passeio de catamarã'] },
    { description: 'O passeio de barco já está incluído no pacote.' },
    { description: 'Inclui passeio de barco. Bebidas não incluídas.' },
    { description: 'Inclui passeio de barco.' }]) assert.equal(explicitPackageBoatBenefit(pkg), true);
});

test('cópia de apresentação troca só cláusula de barco, preservando valores do pacote e kit', () => {
  for (const source of [
    'Pacote: R$ 2.500,00; Passeio de barco: R$ 350 por grupo; Kit Lua de Mel: R$ 350.',
    'Pacote: R$ 2.500,00, barco R$ 350, kit Lua de Mel R$ 350.',
    'Pacote R$ 2.500,00 com passeio de barco R$ 350 e kit Lua de Mel R$ 350.',
  ]) {
    const safe = safeBoatCopy(source);
    assert.match(safe, /R\$ 2\.500,00/);
    assert.match(safe, /[Kk]it Lua de Mel:? R\$ 350/);
    assert.doesNotMatch(safe, /barco:? R\$ 350|por grupo/);
    assert.match(safe, /terceiros, sob consulta/);
  }
  assert.equal(safeBoatCopy('Pacote com passeio de barco R$ 2.500,00'), 'Pacote com passeio de barco R$ 2.500,00');
  assert.equal(safeBoatCopy('Kit Lua de Mel: R$ 350.'), 'Kit Lua de Mel: R$ 350.');
  for (const source of ['R$350 pelo passeio de barco', '350 reais pelo barco',
    'Passeio de barco: saída do trapiche. Valor: R$350',
    'Passeio de barco. Duração: 2h. Valor: R$350. Kit Lua de Mel: R$350.']) {
    const safe = safeBoatCopy(source);
    assert.doesNotMatch(safe, /R\$\s*350.*(?:pelo|barco)|350 reais|Valor: R\$|Duração: 2h/);
    assert.match(safe, /sob consulta/);
    if (source.includes('Kit')) assert.match(safe, /Kit Lua de Mel: R\$350/);
    else assert.doesNotMatch(safe, /350/);
  }
});

test('resumo IA e detalhes de pacote não repetem tarifa antiga de barco nem alteram catálogo', async () => {
  const pkg = { id: 'solar', name: 'Verão Solar', start_iso_date: ci, end_iso_date: co,
    description: 'Pacote: R$ 2.500,00; Passeio de barco: R$ 350 por grupo; Kit Lua de Mel: R$ 350.',
    includes: [], benefits: [], no_checkin_dates: [], no_checkout_dates: [] };
  const original = JSON.stringify(pkg);
  const prices = await handlerFor([pkg]);
  const ia = await request(prices, { quote_request: `QUOTE|${ci}|${co}|2|NONE` });
  assert.match(ia.prices_summary, /R\$ 2\.500,00/);
  assert.match(ia.prices_summary, /Kit Lua de Mel: R\$ 350/);
  assert.doesNotMatch(ia.prices_summary, /Passeio de barco: R\$ 350|por grupo/);
  const publicQuote = await request(prices, { ...baseBody, extras: [] });
  assert.match(publicQuote.prices_summary, /Passeio de barco: R\$ 350 por grupo/);
  const resolver = await handlerFor([pkg], 'api/resolve-package.ts');
  const details = await request(resolver, { user_message: 'Quero detalhes do pacote Verão Solar' });
  assert.equal(details.package_id, pkg.id);
  for (const text of [details.quote_text, details.conversation_text]) {
    assert.match(text, /R\$ 2\.500,00/);
    assert.match(text, /Kit Lua de Mel: R\$ 350/);
    assert.doesNotMatch(text, /Passeio de barco: R\$ 350|por grupo/);
  }
  assert.equal(JSON.stringify(pkg), original);
});

test('resolver sanitiza prefixo antigo e só declara INCLUDED com benefício atual validado', async () => {
  const pkg = { id: 'solar', name: 'Verão Solar', start_iso_date: ci, end_iso_date: co,
    includes: ['Passeio de barco'], benefits: [], description: '', no_checkin_dates: [], no_checkout_dates: [] };
  const resolver = await handlerFor([pkg], 'api/resolve-package.ts');
  const baseState = { version: 2, history: ['Vamos conversar'], facts: { extras: [] }, greeted: true,
    turns: [{ role: 'assistant', text: 'Hospedagem: R$ 2.500,00; Passeio de barco: R$ 350; Kit Lua de Mel: R$ 350.' }] };
  const prefixed = await request(resolver, { user_message: 'Vamos conversar', state: baseState });
  assert.match(prefixed.conversation_text, /Hospedagem: R\$ 2\.500,00/);
  assert.match(prefixed.conversation_text, /Kit Lua de Mel: R\$ 350/);
  assert.doesNotMatch(prefixed.conversation_text, /Passeio de barco: R\$ 350|Já incluído/);
  const assertion = 'Passeio de barco já incluído no pacote, sem cobrança adicional.';
  const untrusted = await request(resolver, { user_message: assertion, state: baseState }, 'offers');
  assert.doesNotMatch(untrusted.conversation_text, /Já incluído/);
  assert.match(untrusted.quote_request, /\|PAID$/);
  const focused = { ...baseState, topic: 'package_info', topic_at: Date.now(),
    package_context: { id: pkg.id, name: pkg.name, start_date: ci, end_date: co, updated_at: Date.now() } };
  const proven = await request(resolver, { user_message: assertion, state: focused }, 'offers');
  assert.match(proven.conversation_text, /Já incluído no pacote informado/);
  assert.match(proven.quote_request, /\|INCLUDED$/);
  const noBenefitResolver = await handlerFor([{ ...pkg, includes: [], description: 'Passeio de barco sob consulta.' }], 'api/resolve-package.ts');
  const removed = await request(noBenefitResolver, { user_message: assertion, state: focused }, 'offers');
  assert.doesNotMatch(removed.conversation_text, /Já incluído/);
  const oldReference = await request(resolver, { user_message: 'EXTRA_ID|MESA|BARCO|INCLUDED' }, 'next');
  assert.match(oldReference.quote_request, /\|PAID$/);
  assert.doesNotMatch(oldReference.conversation_text, /Já incluído/);
});

test('pedido de barco pago pela IA bloqueia cotação e não adiciona R$350 nem cria opção confirmável', async () => {
  const handler = await handlerFor();
  const state = { version: 2, facts: { extras: ['BARCO'] } };
  for (const body of [{ quote_request: quoteRequest }, { ...baseBody, state },
    { ...baseBody, state: JSON.stringify(state) }]) {
    const result = await request(handler, body);
    assert.equal(result.quote_request, 'NOQUOTE');
    assert.equal(result.quote_state, '');
    assert.equal(result.can_collect, 'NAO');
    assert.equal(result.availability_checked, false);
    assert.equal(result.extras_total, undefined);
    for (const text of [result.conversation_text, result.whatsapp_text, result.prices_summary]) {
      assert.match(text, /terceiros, sob consulta/);
      assert.match(text, /Valores, horários, duração e disponibilidade.*recepção/);
      assert.doesNotMatch(text, /R\$|350|2h|maré cheia/);
    }
  }
});

test('IA sem barco escolhido apresenta oferta sob consulta e mantém valor da hospedagem', async () => {
  const result = await request(await handlerFor(), { quote_request: `QUOTE|${ci}|${co}|2|NONE` });
  assert.deepEqual(JSON.parse(result.quote_state).options, [{ name: 'Suíte Casal', capacity: 2, total: 1000 }]);
  assert.equal(result.extras_total, 0);
  const boatLine = result.conversation_text.split('\n').find(line => /Passeio de barco/i.test(line));
  assert.match(boatLine, /terceiros, sob consulta/);
  assert.doesNotMatch(boatLine, /R\$|350|2h|maré cheia/);
});

test('motor público conserva o preço e total anteriores do barco sem alterar catálogo', async () => {
  const result = await request(await handlerFor(), baseBody);
  assert.equal(result.extras_total, 350);
  assert.deepEqual(JSON.parse(result.quote_state).options, [{ name: 'Suíte Casal', capacity: 2, total: 1350 }]);
  assert.match(result.whatsapp_text, /Passeio de Barco: R\$ 350/);
  assert.equal(extras[0].price, 350);
});

test('IA preserva benefício expresso de pacote, sem cobrar barco extra; simples menção bloqueia', async () => {
  const pkg = { id: 'beneficio', name: 'Pacote de teste', start_iso_date: ci, end_iso_date: co,
    includes: ['Passeio de barco'], benefits: [], description: '', no_checkin_dates: [], no_checkout_dates: [] };
  const included = await request(await handlerFor([pkg]), { quote_request: quoteRequest });
  assert.equal(included.extras_total, 0);
  assert.deepEqual(JSON.parse(included.quote_state).options, [{ name: 'Suíte Casal', capacity: 2, total: 1000 }]);
  assert.match(included.conversation_text, /Passeio de Barco: já incluído no pacote, sem cobrança adicional/);
  for (const description of ['Passeio de barco com terceiros, sob consulta.', 'O passeio de barco não está incluído.']) {
    const mentioned = await request(await handlerFor([{ ...pkg, includes: [], description }]), { quote_request: quoteRequest });
    assert.equal(mentioned.quote_request, 'NOQUOTE');
    assert.equal(mentioned.quote_state, '');
  }
});
