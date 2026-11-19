import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

// Pré-check-in do site: a ficha que o hóspede preenche passa a ser o titular
// do quarto no ERP (reservations.main_guest_id). Antes a ficha era gravada no
// cadastro, mas a reserva continuava sem vínculo, e a recepção via
// "Selecionar hóspede para check-in" com o cadastro pronto.

const b = await build({
  entryPoints: ['api/check-reservation.ts'], bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{
    name: 'stubs',
    setup(build) {
      build.onResolve({ filter: /bancoDoServidor/ }, () => ({ path: 'banco', namespace: 'stub' }));
      build.onResolve({ filter: /metaConversoesServidor/ }, () => ({ path: 'meta', namespace: 'stub' }));
      build.onLoad({ filter: /^banco$/, namespace: 'stub' }, () => ({
        contents: 'export const bancoDoServidor = () => globalThis.__banco; export const chaveDoBanco = () => "servidor";',
        loader: 'js',
      }));
      build.onLoad({ filter: /^meta$/, namespace: 'stub' }, () => ({
        contents: 'export async function enviarCompraParaMeta() { return "sem_token"; }',
        loader: 'js',
      }));
    },
  }],
});
const { default: handler } = await import('data:text/javascript;base64,' + Buffer.from(b.outputFiles[0].text).toString('base64'));

const RESERVA = '3f2a9c1e-1234-4abc-8def-0123456789ab';
const QUARTO2 = '7b27b1f2-c298-45c0-9c31-16cf0096b8ae';
const CPF = '52998224725';
const CPF_PONTUADO = '529.982.247-25';
const CPF2 = '11144477735';

/** Banco em memória com o pedaço da API do Supabase que a rota usa. */
function bancoFalso({ reservas = [], fichas = [], falharVinculo = false } = {}) {
  const tabelas = { reservations: reservas.map(r => ({ ...r })), guests: fichas.map(g => ({ ...g })) };
  const chamadas = [];
  let proximo = 1;
  const db = {
    tabelas, chamadas,
    from(tabela) {
      const filtros = [];
      let acao = 'select';
      let dados = null;
      let limite = Infinity;
      const q = {
        select() { return q; },
        insert(linhas) { acao = 'insert'; dados = linhas; return q; },
        update(campos) { acao = 'update'; dados = campos; return q; },
        eq(c, v) { filtros.push(l => l[c] === v); return q; },
        is(c, v) { filtros.push(l => (l[c] ?? null) === v); return q; },
        ilike(c, v) { filtros.push(l => String(l[c] ?? '').toLowerCase() === String(v).toLowerCase()); return q; },
        or(expr) {
          const ops = expr.split(',').map(p => { const [c, , ...v] = p.split('.'); return [c, v.join('.')]; });
          filtros.push(l => ops.some(([c, v]) => String(l[c] ?? '') === v));
          return q;
        },
        limit(n) { limite = n; return q; },
        maybeSingle() { return executar().then(r => ({ data: r.data?.[0] ?? null, error: r.error })); },
        single() { return executar().then(r => ({ data: r.data?.[0] ?? null, error: r.error })); },
        then(ok, erro) { return executar().then(ok, erro); },
      };
      const casam = () => tabelas[tabela].filter(l => filtros.every(f => f(l)));
      async function executar() {
        if (acao === 'insert') {
          const novas = dados.map(l => ({ id: `ficha-nova-${proximo++}`, ...l }));
          tabelas[tabela].push(...novas);
          chamadas.push({ tabela, acao, dados });
          return { data: novas, error: null };
        }
        if (acao === 'update') {
          chamadas.push({ tabela, acao, dados });
          if (falharVinculo && 'main_guest_id' in dados) return { data: null, error: { message: 'falhou' } };
          for (const l of casam()) Object.assign(l, dados);
          return { data: null, error: null };
        }
        return { data: casam().slice(0, limite), error: null };
      }
      return q;
    },
  };
  return db;
}

async function preCheckin(db, corpo) {
  globalThis.__banco = db;
  let status = 0;
  let json = null;
  const res = {
    setHeader() {},
    status(s) { status = s; return res; },
    json(j) { json = j; return res; },
    end() { return res; },
  };
  await handler({ method: 'POST', headers: {}, query: {}, body: { acao: 'pre-checkin', ...corpo } }, res);
  return { status, json };
}

const hospede = { name: 'Thiago Freixas de Alcantara', full_name: 'Thiago Freixas de Alcantara', cpf_cnpj: CPF, document: CPF, email: 't@x.com' };
const quartoUnico = (mainGuest = {}) => [{
  id: RESERVA,
  main_guest: { name: 'Thiago Freixas de Alcantara', cpf: CPF, email: 't@x.com', ...mainGuest },
  additional_guests: [],
}];

test('ficha nova do pré-check-in vira o titular da reserva', async () => {
  const db = bancoFalso({ reservas: [{ id: RESERVA, status: 'pending', group_id: null, main_guest_id: null }] });
  const r = await preCheckin(db, { id: RESERVA, hospede, acompanhantes: [], quartos: quartoUnico() });
  assert.equal(r.status, 200);
  const ficha = db.tabelas.guests.find(g => g.document === CPF);
  assert.ok(ficha, 'ficha criada');
  const reserva = db.tabelas.reservations[0];
  assert.equal(reserva.main_guest_id, ficha.id);
  assert.equal(reserva.pre_checkin_sent, true);
});

test('ficha que já existia (CPF com pontuação) é completada e ligada', async () => {
  const db = bancoFalso({
    reservas: [{ id: RESERVA, status: 'confirmed', group_id: null, main_guest_id: null }],
    fichas: [{ id: 'ficha-antiga', full_name: 'Thiago F Alcantara', name: 'Thiago F Alcantara', document: CPF_PONTUADO, cpf_cnpj: CPF_PONTUADO }],
  });
  const r = await preCheckin(db, { id: RESERVA, hospede, acompanhantes: [], quartos: quartoUnico({ name: 'THIAGO FREIXAS DE ALCÂNTARA' }) });
  assert.equal(r.status, 200);
  assert.equal(db.tabelas.guests.length, 1, 'não duplica o cadastro');
  assert.equal(db.tabelas.guests[0].full_name, 'Thiago Freixas de Alcantara');
  assert.equal(db.tabelas.reservations[0].main_guest_id, 'ficha-antiga', 'nome com acento e maiúsculas ainda bate');
});

test('titular já escolhido pela recepção não é trocado', async () => {
  const db = bancoFalso({ reservas: [{ id: RESERVA, status: 'pending', group_id: null, main_guest_id: 'escolhida-pela-recepcao' }] });
  await preCheckin(db, { id: RESERVA, hospede, acompanhantes: [], quartos: quartoUnico() });
  assert.equal(db.tabelas.reservations[0].main_guest_id, 'escolhida-pela-recepcao');
});

test('sem vínculo quando o cadastro não identifica uma pessoa só', async () => {
  const casos = [
    ['nome do quarto diferente da ficha', {}, quartoUnico({ name: 'Outra Pessoa' })],
    ['dois documentos diferentes no quarto', {}, quartoUnico({ document: CPF2 })],
    ['quarto sem documento', {}, quartoUnico({ cpf: '' })],
    ['documento incompleto', { cpf_cnpj: '123', document: '123' }, quartoUnico({ cpf: '123' })],
  ];
  for (const [nome, mudaHospede, quartos] of casos) {
    const db = bancoFalso({ reservas: [{ id: RESERVA, status: 'pending', group_id: null, main_guest_id: null }] });
    const r = await preCheckin(db, { id: RESERVA, hospede: { ...hospede, ...mudaHospede }, acompanhantes: [], quartos });
    assert.equal(r.status, 200, nome);
    assert.equal(db.tabelas.reservations[0].main_guest_id, null, nome);
    assert.equal(db.tabelas.reservations[0].pre_checkin_sent, true, `${nome}: o pré-check-in continua gravado`);
  }

  // Duas fichas com o mesmo CPF: a recepção escolhe qual vale.
  const db = bancoFalso({
    reservas: [{ id: RESERVA, status: 'pending', group_id: null, main_guest_id: null }],
    fichas: [
      { id: 'a', full_name: 'Thiago Freixas de Alcantara', document: CPF },
      { id: 'b', full_name: 'Thiago Freixas de Alcantara', cpf_cnpj: CPF_PONTUADO },
    ],
  });
  await preCheckin(db, { id: RESERVA, hospede, acompanhantes: [], quartos: quartoUnico() });
  assert.equal(db.tabelas.reservations[0].main_guest_id, null);
  // Ficha apagada não conta como segunda.
  db.tabelas.guests[1].is_deleted = true;
  await preCheckin(db, { id: RESERVA, hospede, acompanhantes: [], quartos: quartoUnico() });
  assert.equal(db.tabelas.reservations[0].main_guest_id, 'a');
});

test('grupo: cada quarto liga à ficha do seu titular, e o quarto sem ficha fica para a recepção', async () => {
  const GRUPO = 'ffffffff-1111-4222-8333-444444444444';
  const QUARTO3 = '0c819644-1111-4222-8333-444444444444';
  const db = bancoFalso({
    reservas: [
      { id: RESERVA, status: 'pending', group_id: GRUPO, main_guest_id: null },
      { id: QUARTO2, status: 'pending', group_id: GRUPO, main_guest_id: null },
      { id: QUARTO3, status: 'pending', group_id: GRUPO, main_guest_id: null },
    ],
  });
  const acompanhante = { name: 'Sophia de Lins Ribeiro', full_name: 'Sophia de Lins Ribeiro', cpf_cnpj: CPF2, document: CPF2 };
  const r = await preCheckin(db, {
    id: RESERVA, hospede, acompanhantes: [acompanhante],
    quartos: [
      // O quarto principal recebeu o CPF de quem preencheu, mas o nome de outra pessoa.
      { id: RESERVA, main_guest: { name: 'Ana Claudia', cpf: CPF }, additional_guests: [] },
      { id: QUARTO2, main_guest: { name: 'Sophia de Lins Ribeiro', cpf: CPF2 }, additional_guests: [] },
      { id: QUARTO3, main_guest: { name: 'Thiago Freixas de Alcantara', cpf: CPF }, additional_guests: [] },
      // Quarto de fora do grupo é ignorado, como antes.
      { id: 'aaaaaaaa-1111-4222-8333-444444444444', main_guest: { name: 'Thiago Freixas de Alcantara', cpf: CPF }, additional_guests: [] },
    ],
  });
  assert.equal(r.status, 200);
  const porId = Object.fromEntries(db.tabelas.reservations.map(l => [l.id, l.main_guest_id]));
  const fichaThiago = db.tabelas.guests.find(g => g.document === CPF).id;
  const fichaSophia = db.tabelas.guests.find(g => g.document === CPF2).id;
  assert.equal(porId[RESERVA], null, 'nome de outra pessoa com o CPF de quem preencheu');
  assert.equal(porId[QUARTO2], fichaSophia);
  assert.equal(porId[QUARTO3], fichaThiago);
  assert.equal(db.tabelas.reservations.length, 3);
});

test('falha ao gravar o vínculo não desfaz o pré-check-in', async () => {
  const db = bancoFalso({ reservas: [{ id: RESERVA, status: 'pending', group_id: null, main_guest_id: null }], falharVinculo: true });
  const original = console.error;
  console.error = () => {};
  try {
    const r = await preCheckin(db, { id: RESERVA, hospede, acompanhantes: [], quartos: quartoUnico() });
    assert.equal(r.status, 200);
  } finally {
    console.error = original;
  }
  assert.equal(db.tabelas.reservations[0].pre_checkin_sent, true);
  assert.equal(db.tabelas.reservations[0].main_guest_id, null);
});

test('reserva cancelada continua recusando o pré-check-in', async () => {
  const db = bancoFalso({ reservas: [{ id: RESERVA, status: 'CANCELED', group_id: null, main_guest_id: null }] });
  const r = await preCheckin(db, { id: RESERVA, hospede, acompanhantes: [], quartos: quartoUnico() });
  assert.equal(r.status, 409);
  assert.equal(db.tabelas.guests.length, 0);
});
