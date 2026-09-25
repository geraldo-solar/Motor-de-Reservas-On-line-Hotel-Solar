import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {build} from 'esbuild';
const bundled = await build({entryPoints:['utils/metaConversoesServidor.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {eventoDeCompra,enviarCompraParaMeta,telefoneNormalizado} = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const eventos = await build({entryPoints:['utils/metaEventos.ts'],bundle:true,write:false,platform:'neutral',format:'esm'});
const {dadosDaCompra,ehHostDeProducao,idDoEventoDeCompra} = await import(`data:text/javascript;base64,${Buffer.from(eventos.outputFiles[0].text).toString('base64')}`);
const sha = value => createHash('sha256').update(value).digest('hex');

const reserva = {
  id: 'AB12CD34-0000-4000-8000-000000000001',
  checkIn: '2026-12-31',
  checkOut: '2027-01-03',
  totalPrice: 5980.5,
  rooms: [{id: 'luxo', priceSnapshot: 3000}, {id: 'standard', priceSnapshot: 2980.5}],
  mainGuest: {name: '  João da Silva Conceição ', email: ' Joao.Silva@Email.com ', phone: '(91) 98888-7777'},
};
const contexto = {
  cookies: 'outro=1; _fbp=fb.1.1700000000000.123456; _fbc=fb.1.1700000000000.AbCdEf',
  ip: '200.1.2.3',
  navegador: 'Mozilla/5.0',
  host: 'reservas.hotelsolar.tur.br',
  pagina: 'https://reservas.hotelsolar.tur.br/?checkIn=2026-12-31',
  agoraMs: 1790000000000,
};

test('navegador e servidor usam o mesmo id de evento, em minúsculas', () => {
  assert.equal(idDoEventoDeCompra(reserva.id), 'reserva-ab12cd34-0000-4000-8000-000000000001');
  assert.equal(eventoDeCompra(reserva, contexto).event_id, idDoEventoDeCompra(reserva.id.toLowerCase()));
});

test('compra leva o valor em reais, as datas e as acomodações', () => {
  const dados = dadosDaCompra(reserva);
  assert.equal(dados.currency, 'BRL');
  assert.equal(dados.value, 5980.5);
  assert.equal(dados.num_items, 2);
  assert.deepEqual(dados.content_ids, ['luxo', 'standard']);
  assert.equal(dados.checkin_date, '2026-12-31');
  assert.equal(dados.checkout_date, '2027-01-03');
  assert.equal(dadosDaCompra({...reserva, totalPrice: '1200.456'}).value, 1200.46);
});

test('dados do hóspede vão normalizados e com hash; fbp, fbc e IP em claro', () => {
  const {user_data: u, event_name, action_source, event_time} = eventoDeCompra(reserva, contexto);
  assert.equal(event_name, 'Purchase');
  assert.equal(action_source, 'website');
  assert.equal(event_time, 1790000000);
  assert.deepEqual(u.em, [sha('joao.silva@email.com')]);
  assert.deepEqual(u.ph, [sha('5591988887777')]);
  assert.deepEqual(u.fn, [sha('joao')]);
  assert.deepEqual(u.ln, [sha('conceicao')]);
  assert.equal(u.fbp, 'fb.1.1700000000000.123456');
  assert.equal(u.fbc, 'fb.1.1700000000000.AbCdEf');
  assert.equal(u.client_ip_address, '200.1.2.3');
  assert.ok(!JSON.stringify(u).includes('Joao'), 'nome ou e-mail em claro');
});

test('sem cookie _fbc, o fbclid da página identifica o clique no anúncio', () => {
  const u = eventoDeCompra(reserva, {...contexto, cookies: '', pagina: 'https://reservas.hotelsolar.tur.br/?fbclid=XYZ'}).user_data;
  assert.equal(u.fbc, 'fb.1.1790000000000.XYZ');
  assert.equal(u.fbp, undefined);
});

test('telefone brasileiro vira DDI + DDD + número; lixo fica de fora', () => {
  assert.equal(telefoneNormalizado('91 3423-1234'), '559134231234');
  assert.equal(telefoneNormalizado('+55 (91) 98888-7777'), '5591988887777');
  assert.equal(telefoneNormalizado('123'), '');
  assert.equal(eventoDeCompra({...reserva, mainGuest: {name: 'Ana', email: 'x', phone: ''}}, contexto).user_data.ph, undefined);
});

test('só o endereço publicado conta como produção', () => {
  for (const host of ['reservas.hotelsolar.tur.br', 'hotelsolar.tur.br', 'www.hotelsolar.tur.br:443']) assert.equal(ehHostDeProducao(host), true, host);
  for (const host of ['localhost:5173', '127.0.0.1', 'motor-abc.vercel.app', 'hotelsolar.tur.br.golpe.com', '']) assert.equal(ehHostDeProducao(host), false, host);
});

test('envia para o pixel certo, com o token no corpo e não na URL', async () => {
  const chamadas = [];
  const buscar = async (url, opcoes) => { chamadas.push({url, corpo: JSON.parse(opcoes.body)}); return {ok: true, status: 200}; };
  const r = await enviarCompraParaMeta(reserva, contexto, {META_CAPI_TOKEN: 'segredo'}, buscar);
  assert.equal(r, 'enviado');
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, 'https://graph.facebook.com/v21.0/743518114034395/events');
  assert.ok(!chamadas[0].url.includes('segredo'));
  assert.equal(chamadas[0].corpo.access_token, 'segredo');
  assert.equal(chamadas[0].corpo.test_event_code, undefined);
  assert.equal(chamadas[0].corpo.data[0].custom_data.value, 5980.5);
});

test('sem token, ou fora de produção sem código de teste, não envia nada', async () => {
  let chamou = false;
  const buscar = async () => { chamou = true; return {ok: true}; };
  assert.equal(await enviarCompraParaMeta(reserva, contexto, {}, buscar), 'sem_token');
  assert.equal(await enviarCompraParaMeta(reserva, {...contexto, host: 'localhost:3000'}, {META_CAPI_TOKEN: 't'}, buscar), 'fora_de_producao');
  assert.equal(chamou, false);
});

test('prévia com código de teste envia para "Testar eventos"', async () => {
  let corpo;
  const buscar = async (_url, opcoes) => { corpo = JSON.parse(opcoes.body); return {ok: true}; };
  const r = await enviarCompraParaMeta(reserva, {...contexto, host: 'motor-abc.vercel.app'}, {META_CAPI_TOKEN: 't', META_TEST_EVENT_CODE: 'TEST123'}, buscar);
  assert.equal(r, 'enviado');
  assert.equal(corpo.test_event_code, 'TEST123');
});

test('falha ou queda da Meta nunca derruba a reserva', async () => {
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(await enviarCompraParaMeta(reserva, contexto, {META_CAPI_TOKEN: 't'}, async () => ({ok: false, status: 400})), 'falhou');
    assert.equal(await enviarCompraParaMeta(reserva, contexto, {META_CAPI_TOKEN: 't'}, async () => { throw new Error('timeout'); }), 'falhou');
  } finally {
    console.error = original;
  }
});
