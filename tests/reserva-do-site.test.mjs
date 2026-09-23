import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
const b=await build({entryPoints:['utils/reservaDoSite.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const m=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));

const ID='3f2a9c1e-1234-4abc-8def-0123456789ab';
const base={id:ID,checkIn:'2026-10-10',checkOut:'2026-10-12',nights:2,rooms:[{id:'835b8136-77a7-499a-b40e-40f61ddd10d8',name:'Suíte Casal',priceSnapshot:800}],
  mainGuest:{name:'Maria Teste',email:'maria@exemplo.com',phone:'91999999999',cpf:'12345678909'},paymentMethod:'PIX',totalPrice:800,extras:[],additionalGuests:[]};

test('reserva do site: aceita a do formulário e recusa a forjada',()=>{
  assert.equal(m.conferirReservaDoSite(base),null);
  assert.match(m.conferirReservaDoSite({...base,id:'1'}),/inválido/);
  assert.match(m.conferirReservaDoSite({...base,checkOut:'2026-10-10'}),/saída/);
  assert.match(m.conferirReservaDoSite({...base,rooms:[]}),/1 a 10/);
  assert.match(m.conferirReservaDoSite({...base,paymentMethod:'DINHEIRO'}),/pagamento/);
  assert.match(m.conferirReservaDoSite({...base,mainGuest:{name:'',email:'x'}}),/obrigatórios/);
});

test('reserva do site entra sempre pendente e sem dados de cartão',()=>{
  const r=m.reservaLimpa({...base,status:'CONFIRMED',amountPaid:800,paymentMethod:'CREDIT_CARD',cardDetails:{number:'4111111111111111',cvv:'123',maxInstallments:3}});
  assert.equal(r.status,'PENDING');
  assert.equal(r.amountPaid,undefined);
  assert.deepEqual(r.cardDetails,{viaCielo:true,maxInstallments:3});
  const [linha]=m.linhasPorQuarto(r,'Motor de Reservas');
  assert.deepEqual(linha.card_details,{viaCielo:true,maxInstallments:3});
  assert.equal(linha.status,'PENDING');
  assert.equal(linha.created_by,'Motor de Reservas');
});

test('duas acomodações viram duas linhas do mesmo grupo',()=>{
  const r=m.reservaLimpa({...base,rooms:[...base.rooms,{id:'7b27b1f2-c298-45c0-9c31-16cf0096b8ae',name:'Triplo',priceSnapshot:1200}],totalPrice:2000});
  const linhas=m.linhasPorQuarto(r,'Motor de Reservas');
  assert.equal(linhas.length,2);
  assert.equal(linhas[0].id,ID);
  assert.ok(linhas[0].group_id && linhas[0].group_id===linhas[1].group_id);
  assert.equal(linhas[0].total_price+linhas[1].total_price,2000);
});

test('código curto é o dos e-mails e o número completo é exigido fora dele',()=>{
  assert.equal(m.codigoCurto(ID),'3F2A9C1E');
  assert.ok(m.ehCodigoCurto('3f2a9c1e'));
  assert.ok(!m.ehCodigoCurto('3F2A'));
  assert.ok(m.ehUuid(ID));
  assert.ok(!m.ehUuid('3F2A9C1E'));
});

test('rascunho do chatbot só enquanto pendente',()=>{
  assert.ok(m.ehRascunhoDoChatbot({observations:'[ORIGEM: AI CHATBOT] oi',status:'PENDING'}));
  assert.ok(!m.ehRascunhoDoChatbot({observations:'[ORIGEM: AI CHATBOT] oi',status:'CONFIRMED'}));
  assert.ok(!m.ehRascunhoDoChatbot({observations:'reserva do site',status:'PENDING'}));
});

test('estoque: reservar tira 1 por dia, devolver repõe sem passar do total',()=>{
  assert.deepEqual(m.diasDaEstadia('2026-10-30','2026-11-02'),['2026-10-30','2026-10-31','2026-11-01']);
  const quarto={total_quantity:3,base_price:400,overrides:[{dateIso:'2026-10-10',availableQuantity:1,price:500}]};
  const depois=m.estoqueAjustado(quarto,'2026-10-10','2026-10-12','reservar');
  assert.deepEqual(depois.map(o=>[o.dateIso,o.availableQuantity]),[['2026-10-10',0],['2026-10-11',2]]);
  assert.equal(quarto.overrides[0].availableQuantity,1,'não altera o original');
  const devolvido=m.estoqueAjustado({...quarto,overrides:depois},'2026-10-10','2026-10-12','devolver');
  assert.deepEqual(devolvido.map(o=>o.availableQuantity),[1,3]);
  assert.deepEqual(m.estoqueAjustado({total_quantity:3,overrides:[]},'2026-10-10','2026-10-11','devolver'),[]);
});

test('cancelamento: parcial recalcula, e sem acomodação restante vira total',()=>{
  const linha={rooms:[{id:'a',name:'Casal',priceSnapshot:800},{id:'b',name:'Triplo',priceSnapshot:1200}],
    extras:[{name:'Transfer',priceSnapshot:100,quantity:2}],observations:'obs'};
  const p=m.cancelamentoDoSite(linha,[1],[],'23/09/2026');
  assert.equal(p.tipo,'parcial');
  assert.equal(p.alteracao.total_price,1000);
  assert.deepEqual(p.quartosDevolvidos.map(q=>q.id),['b']);
  assert.match(p.alteracao.observations,/CANCELAMENTO PARCIAL em 23\/09\/2026\]: Itens cancelados: Triplo/);
  assert.equal(m.cancelamentoDoSite(linha,[0,1],[],'x').tipo,'total');
  assert.equal(m.cancelamentoDoSite(linha,[0,1],[0],'x').tipo,'total');
  assert.equal(m.cancelamentoDoSite(linha,[7,-1],[],'x').tipo,'nada','índices fora da lista são ignorados');
  assert.equal(m.cancelamentoDoSite(linha,[],[],'x').tipo,'nada','sem nada marcado não cancela nada');
});

test('pré-check-in: só completa ficha de mesmo CPF ou ficha sem documento',()=>{
  assert.equal(m.fichaQuePodeSerCompletada({id:'cpf'},{id:'nome'}),'cpf');
  assert.equal(m.fichaQuePodeSerCompletada(null,{id:'fantasma',document:'',cpf_cnpj:null}),'fantasma');
  assert.equal(m.fichaQuePodeSerCompletada(null,{id:'outra',document:'111.222.333-44'}),null);
  const f=m.fichaDoHospede({full_name:'x'.repeat(500),email:'a@b.c',vip:true,notes:'[SOLAR]'});
  assert.equal(f.full_name.length,300);
  assert.equal(f.vip,undefined);
  assert.equal(f.notes,undefined);
});

test('cupom no formato do formulário',()=>{
  assert.deepEqual(m.cupomParaOSite({code:'SOL10',percentage:10,active:true,start_date:'2026-10-01',min_nights:2}),
    {code:'SOL10',percentage:10,active:true,startDate:'2026-10-01',endDate:'',minNights:2,fullPeriodRequired:false});
});
