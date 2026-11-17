import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

const bundle=await build({entryPoints:['utils/celulaDoMapa.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {valorParaGravar,aplicarDiaNoMapa}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

test('grava o número digitado quando a edição termina',()=>{
  assert.equal(valorParaGravar('910',9),910);
  assert.equal(valorParaGravar(' 650 ',599),650);
  assert.equal(valorParaGravar('1866,67',410),1866.67);
  assert.equal(valorParaGravar('1866.67',410),1866.67);
  assert.equal(valorParaGravar('0',2),0,'zerar as vagas fecha a venda do dia');
});

test('não grava quando nada mudou ou o valor não serve',()=>{
  assert.equal(valorParaGravar(null,910),null,'saiu do campo sem digitar');
  assert.equal(valorParaGravar('',910),null,'apagou tudo: fica o que estava');
  assert.equal(valorParaGravar('   ',910),null);
  assert.equal(valorParaGravar('910',910),null,'igual ao que já estava');
  assert.equal(valorParaGravar('910.0','910'),null);
  assert.equal(valorParaGravar('-5',910),null);
  assert.equal(valorParaGravar('abc',910),null);
  assert.equal(valorParaGravar('1e999',910),null);
});

test('zero digitado em célula sem valor é gravado',()=>{
  assert.equal(valorParaGravar('0',undefined),0);
  assert.equal(valorParaGravar('0',''),0);
});

const padrao={price:910,availableQuantity:2};

test('mudar o preço de um dia não mexe no estoque daquele dia nem nos outros dias',()=>{
  // O que está no banco: a reserva de hoje já baixou o estoque para 0.
  const noBanco=[
    {dateIso:'2026-11-17',price:9,availableQuantity:0,isClosed:false},
    {dateIso:'2026-11-20',price:1650,availableQuantity:1,isClosed:false,noCheckIn:true},
  ];
  const depois=aplicarDiaNoMapa(noBanco,'2026-11-17',{price:910},padrao);
  assert.deepEqual(depois,[
    {dateIso:'2026-11-17',price:910,availableQuantity:0,isClosed:false},
    {dateIso:'2026-11-20',price:1650,availableQuantity:1,isClosed:false,noCheckIn:true},
  ]);
  assert.equal(noBanco[0].price,9,'não altera a lista recebida');
});

test('dia ainda sem ajuste nasce com a tarifa e o total da acomodação',()=>{
  const depois=aplicarDiaNoMapa([],'2026-12-05',{price:1200},padrao);
  assert.deepEqual(depois,[{dateIso:'2026-12-05',price:1200,availableQuantity:2,isClosed:false}]);
  const fechado=aplicarDiaNoMapa([],'2026-12-05',{isClosed:true},padrao);
  assert.deepEqual(fechado,[{dateIso:'2026-12-05',price:910,availableQuantity:2,isClosed:true}]);
});

test('vagas, fechamento e restrições entram só no dia pedido',()=>{
  const noBanco=[{dateIso:'2026-11-21',price:980,availableQuantity:1}];
  assert.deepEqual(aplicarDiaNoMapa(noBanco,'2026-11-21',{availableQuantity:3},padrao),
    [{dateIso:'2026-11-21',price:980,availableQuantity:3}]);
  assert.deepEqual(aplicarDiaNoMapa(noBanco,'2026-11-21',{noCheckOut:true},padrao),
    [{dateIso:'2026-11-21',price:980,availableQuantity:1,noCheckOut:true}]);
});

test('a data do ajuste é a do dia pedido, mesmo que os campos tragam outra',()=>{
  const depois=aplicarDiaNoMapa([{dateIso:'2026-11-21',price:980}],'2026-11-21',{dateIso:'2026-01-01',price:700},padrao);
  assert.deepEqual(depois,[{dateIso:'2026-11-21',price:700}]);
});

test('lista vazia, nula ou estragada no banco não derruba a gravação',()=>{
  for(const ruim of [null,undefined,'x',{},[null,'lixo']]){
    assert.deepEqual(aplicarDiaNoMapa(ruim,'2026-12-05',{price:1200},padrao),
      [{dateIso:'2026-12-05',price:1200,availableQuantity:2,isClosed:false}]);
  }
});
