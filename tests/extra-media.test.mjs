import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
const bundled=await build({entryPoints:['utils/extraMedia.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {requestedExtraCodes,extraMediaResult,nextExtraMedia}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const extras=[{id:'b',name:'Passeio de Barco',price:100,image_url:'https://example.com/barco.jpg'},{id:'m',name:'Mesa Posta',price:180,image_url:'https://example.com/mesa.jpg'},{id:'l',name:'Kit Lua de Mel',price:350,image_url:'https://example.com/lua.jpg'},{id:'c',name:'Bicicletas',price:50,image_url:'https://example.com/bike.jpg'}];
test('oferta específica, contextual e todos; não repete automaticamente, mas reenvia a pedido',()=>{
 assert.deepEqual(requestedExtraCodes('Quero conhecer o barco',''),['BARCO']);
 assert.deepEqual(requestedExtraCodes('Viagem romântica','Que tal a Mesa Posta?'),['MESA']);
 assert.deepEqual(requestedExtraCodes('Quais os extras?',''),['BARCO','MESA','LUA','BIKE']);
 assert.deepEqual(requestedExtraCodes('Qual valor do barco?','',['BARCO']),[]);
 assert.deepEqual(requestedExtraCodes('Mande a foto do barco novamente','',['BARCO']),['BARCO']);
 assert.deepEqual(requestedExtraCodes('Não quero barco','Ofereço o barco'),[]);
 assert.deepEqual(requestedExtraCodes('Foto do Loft','Também há passeio de barco'),[]);
 assert.deepEqual(requestedExtraCodes('Pacote Independência','Inclui barco'),[]);
});
test('fila finita com legenda e valores corretos, bicicletas gratuitas e barco por grupo',()=>{
 let r=extraMediaResult(['BARCO','MESA','LUA','BIKE'],extras); const captions=[];
 for(let i=0;r.quote_request.startsWith('EXTRA_ID|');i++) {
  assert.ok(i<4);captions.push(r.conversation_text); r=nextExtraMedia(r.quote_request,extras);
 }
 assert.equal(r.quote_request,'ROOM_DONE');assert.equal(captions.length,4);
 assert.match(captions[0],/350,00 por grupo de até 4/);assert.doesNotMatch(captions[0],/100,00/);
 assert.match(captions[1],/180,00/);assert.match(captions[2],/350,00/);
 assert.match(captions[3],/Cortesia gratuita/);assert.doesNotMatch(captions[3],/50,00/);
 assert.match(extraMediaResult(['BARCO'],extras,true).conversation_text,/sem cobrança adicional/);
});
test('sem imagem ou extra inativo não usa foto alheia nem inventa valor',()=>{
 const r=extraMediaResult(['MESA'],[{id:'x',name:'Mesa Posta',active:false,image_url:'https://example.com/inativa.jpg'}]);
 assert.equal(r.quote_request,'ROOM_LIST');assert.match(r.conversation_text,/Valor a confirmar/);assert.match(r.conversation_text,/não há foto cadastrada/);
});
