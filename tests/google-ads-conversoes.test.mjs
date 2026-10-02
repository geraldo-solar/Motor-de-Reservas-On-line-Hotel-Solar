import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {build} from 'esbuild';
const importar = async entrada => {
  const r = await build({entryPoints:[entrada],bundle:true,write:false,platform:'neutral',format:'esm'});
  return import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`);
};
const {compraNoGoogle,CONVERSOES_GOOGLE,GOOGLE_ADS_ID,GOOGLE_ANALYTICS_ID} = await importar('utils/googleEventos.ts');
const {dadosDaCompra} = await importar('utils/metaEventos.ts');

const reserva = {
  id: 'AB12CD34-0000-4000-8000-000000000001',
  checkIn: '2026-12-31',
  checkOut: '2027-01-03',
  totalPrice: 5980.5,
  rooms: [{id: 'luxo', name: 'Suíte Casal', priceSnapshot: 3000}, {id: 'standard', name: 'Triplo', priceSnapshot: 2980.5}],
};

test('compra no Google usa o mesmo id e o mesmo valor da Meta', () => {
  const google = compraNoGoogle(reserva);
  const meta = dadosDaCompra(reserva);
  assert.equal(google.transaction_id, meta.order_id);
  assert.equal(google.transaction_id, 'ab12cd34-0000-4000-8000-000000000001');
  assert.equal(google.value, meta.value);
  assert.equal(google.currency, 'BRL');
  assert.deepEqual(google.items.map(i => [i.item_id, i.item_name, i.price]), [['luxo', 'Suíte Casal', 3000], ['standard', 'Triplo', 2980.5]]);
  assert.equal(compraNoGoogle({...reserva, totalPrice: '1200.456'}).value, 1200.46);
  assert.deepEqual(compraNoGoogle({id: 'X', totalPrice: 0}).items, []);
});

test('as três conversões são da conta do Google Ads do hotel', () => {
  for (const sendTo of Object.values(CONVERSOES_GOOGLE)) {
    assert.match(sendTo, new RegExp(`^${GOOGLE_ADS_ID}/[A-Za-z0-9_-]+$`));
  }
  assert.equal(new Set(Object.values(CONVERSOES_GOOGLE)).size, 3);
});

test('index.html carrega a tag com os mesmos ids e só em produção', () => {
  const html = readFileSync('index.html', 'utf8');
  const bloco = html.slice(html.indexOf('// Tag do Google'), html.indexOf('</script>', html.indexOf('// Tag do Google')));
  assert.ok(bloco.includes(`gtag/js?id=${GOOGLE_ADS_ID}`));
  assert.ok(bloco.includes(`gtag('config', '${GOOGLE_ADS_ID}')`));
  assert.ok(bloco.includes(`gtag('config', '${GOOGLE_ANALYTICS_ID}')`));
  assert.ok(bloco.indexOf("hotelsolar.tur.br' &&") < bloco.indexOf('createElement'), 'a trava de produção vem antes de carregar a tag');
});
