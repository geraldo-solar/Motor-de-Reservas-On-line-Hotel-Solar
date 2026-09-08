import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
const bundled=await build({entryPoints:['utils/extraMedia.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {requestedExtraCodes,extraMediaResult,nextExtraMedia,extraImage,extraImages,extraPhotoRequest}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
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

test('pedido combinado preserva parque, piscinas e bicicletas em fila finita e sem fotos alheias',()=>{
 const codes=requestedExtraCodes('Quero fotos do parque infantil, piscinas e bicicletas','Também temos barco e Mesa Posta');
 assert.deepEqual(codes,['PARQUE','PISCINA','BIKE']);
 const sent=[];
 let result=extraMediaResult(codes,[]);
 while(result.quote_request.startsWith('EXTRA_ID|')) {
  assert.ok(sent.length<3);
  sent.push({code:result.quote_request.split('|')[1],caption:result.conversation_text});
  result=nextExtraMedia(result.quote_request,[]);
 }
 assert.equal(result.quote_request,'ROOM_DONE');
 assert.deepEqual(sent.map(item=>item.code),codes);
 assert.match(sent[0].caption,/Parque infantil/);
 assert.match(sent[1].caption,/Piscinas/);
 assert.match(sent[2].caption,/Bicicletas.*\nCortesia gratuita/);
 for(const item of sent.slice(0,2)) assert.doesNotMatch(item.caption,/R\$|gratuit|cortesia|Lua de Mel|barco|cobrança/i);
 assert.deepEqual(requestedExtraCodes('Fotos das piscinas','Veja também o parque e as bicicletas'),['PISCINA']);
 assert.deepEqual(requestedExtraCodes('Fotos do parquinho',''),['PARQUE']);
 assert.deepEqual(requestedExtraCodes('Álbum do playground',''),['PARQUE']);
 assert.deepEqual(requestedExtraCodes('Quais são os extras?','Parque infantil e piscinas'),['BARCO','MESA','LUA','BIKE']);
 assert.equal(nextExtraMedia('EXTRA_ID|PISCINA|DESCONHECIDO|PAID',[]).quote_request,'ROOM_DONE');
});

test('imagem, fotografia e álbum reenviam pedido explícito mesmo quando já lembrado',()=>{
 for(const word of ['foto','fotos','imagem','imagens','fotografia','fotografias','galeria','álbum']) {
  const message=`Quero ${word} das bicicletas`;
  assert.equal(extraPhotoRequest(message),true);
  assert.deepEqual(requestedExtraCodes(message,'',['BIKE']),['BIKE']);
 }
 assert.equal(extraPhotoRequest('Quanto custa usar as bicicletas?'),false);
 assert.deepEqual(requestedExtraCodes('Não quero fotos da piscina',''),[]);
});

test('perguntas informativas de lazer não são substituídas por uma legenda de foto',()=>{
 for(const message of ['O hotel tem piscina?','A piscina tem proteção?','Tem parque infantil?','Como é o playground?','O parquinho e as piscinas ficam perto?']) {
  assert.deepEqual(requestedExtraCodes(message,'Também temos bicicletas e barco'),[]);
 }
 assert.deepEqual(requestedExtraCodes('','Temos parque infantil e piscinas'),[]);
 assert.deepEqual(requestedExtraCodes('Quero fotos da piscina','',['PISCINA']),['PISCINA']);
 assert.deepEqual(requestedExtraCodes('Quero uma imagem do parque infantil','',['PARQUE']),['PARQUE']);
 assert.deepEqual(requestedExtraCodes('Quero conhecer o barco',''),['BARCO']);
 assert.deepEqual(requestedExtraCodes('','Sugiro bicicletas e piscina'),['BIKE']);
});

test('cadastro válido precede ManyChat e site; inválido ou vazio não esconde a fonte oficial correta',()=>{
 const site='https://www.hotelsolar.tur.br/assets/images/';
 assert.equal(extraImage(undefined,'PARQUE'),site+'parquinho.webp');
 assert.equal(extraImage(undefined,'PISCINA'),site+'editada-piscina.webp');
 for(const image_url of ['', '   ', 'javascript:alert(1)', 'http://example.com/image.jpg', 'https://', 'https://invalid host/image.jpg', 'data:image/png;base64,', 'https://user:password@example.com/image.jpg']) {
  assert.equal(extraImage({id:'p',image_url},'PARQUE'),site+'parquinho.webp');
 }
 assert.equal(extraImage({id:'p',image_url:'   ',imageUrl:' https://example.com/piscina.jpg '},'PISCINA'),'https://example.com/piscina.jpg');
 assert.equal(extraImage({id:'p',image_url:'https://example.com/atual.jpg'},'PARQUE'),'https://example.com/atual.jpg');
 const bikeImages=extraImages({id:'b',image_url:'https://example.com/bike.jpg'},'BIKE');
 assert.equal(bikeImages[0],'https://example.com/bike.jpg');
 assert.match(bikeImages[1],/^https:\/\/manybot-thumbnails\./);
 assert.equal(bikeImages[2],site+'bike.webp');
 assert.equal(extraImage(undefined,'DESCONHECIDO'),'');
});

async function loadImageHandler(records=[]) {
 const result=await build({
  entryPoints:['api/package-image.ts'],bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'image-fixture',setup(builder){
   builder.onResolve({filter:/^sharp$/},()=>({path:pathToFileURL(createRequire(import.meta.url).resolve('sharp')).href,external:true}));
   builder.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'supabase-fixture',namespace:'test'}));
   builder.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`export function createClient(){return {from(table){if(table!=='extras') throw Error('Unexpected table: '+table);const query={select(){return query},eq(){return query},then(resolve){return Promise.resolve({data:${JSON.stringify(records)},error:null}).then(resolve)}};return query}}}`,loader:'js'}));
  }}],
 });
 return (await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)).default;
}

async function imageRequest(handler,reference) {
 let status,bytes,json;
 const headers={};
 await handler({method:'GET',query:{code:reference}},{status(code){status=code;return this},setHeader(key,value){headers[key]=value},send(value){bytes=value;return value},json(value){json=value;return value}});
 assert.equal(status,200,JSON.stringify(json));
 assert.equal(headers['Content-Type'],'image/jpeg');
 assert.ok(bytes.length>0&&bytes.length<4_500_000);
}

test('endpoint entrega o espaço correto e tenta site quando foto cadastrada/ManyChat falham',async()=>{
 const bytes=await sharp({create:{width:16,height:16,channels:3,background:'#479'}}).png().toBuffer();
 const originalFetch=globalThis.fetch;
 try {
  for(const [code,file] of [['PARQUE','parquinho.webp'],['PISCINA','editada-piscina.webp']]) {
   const seen=[];
   globalThis.fetch=async url=>{seen.push(String(url));return new Response(bytes,{headers:{'content-type':'image/png'}})};
   await imageRequest(await loadImageHandler(),`EXTRA_ID|${code}|BIKE|PAID`);
   assert.deepEqual(seen,[`https://www.hotelsolar.tur.br/assets/images/${file}`]);
  }
  const seen=[];
  globalThis.fetch=async url=>{seen.push(String(url));return String(url).endsWith('/bike.webp')?new Response(bytes,{headers:{'content-type':'image/png'}}):new Response(null,{status:404})};
  await imageRequest(await loadImageHandler([{id:'bike',name:'Bicicletas',image_url:'https://example.com/missing.jpg'}]),'EXTRA_ID|BIKE||PAID');
  assert.equal(seen.length,3);
  assert.equal(seen[0],'https://example.com/missing.jpg');
  assert.match(seen[1],/^https:\/\/manybot-thumbnails\./);
  assert.equal(seen[2],'https://www.hotelsolar.tur.br/assets/images/bike.webp');
 } finally {globalThis.fetch=originalFetch}
});
