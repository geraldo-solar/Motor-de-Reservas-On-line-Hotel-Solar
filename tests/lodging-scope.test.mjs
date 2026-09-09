import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
const bundled=await build({entryPoints:['utils/lodgingScope.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {multiRoomRequest}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
test('pedido explícito de vários apartamentos não cabe na cotação de uma acomodação',()=>{
  for(const message of ['Precisando um orçamento para 2 apartamento duplos de 29 a 31/08','Quero reservar dois quartos separados','Qual o valor de 3 suítes?','2 apartamentos','Duas suítes de casal']) assert.equal(multiRoomRequest(message),true,message);
});
test('não confunde quartos comparados, hóspedes, fotos, grupo de evento ou correção para um quarto',()=>{
  for(const message of ['Favor cotar 1 apartamento duplo de 29/08 a 31/08','Quero um quarto para 2 adultos','Quero fotos de dois quartos','Qual a capacidade de duas suítes?','Prefiro apenas um quarto, não dois apartamentos','Não quero dois quartos','Quero orçamento de grupo de 20 pessoas em 10 quartos','O hotel possui dois quartos?']) assert.equal(multiRoomRequest(message),false,message);
});
