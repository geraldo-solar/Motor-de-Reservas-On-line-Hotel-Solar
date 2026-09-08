import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

const rooms = [
  { id: 'casal', name: 'Suíte Casal', capacity: 2, base_price: 500, overrides: [] },
  { id: 'loft', name: 'Loft', capacity: 4, base_price: 900, overrides: [] },
];
const packages = [
  { id: 'independencia', name: 'Independência Solar', start_iso_date: '2026-09-04', end_iso_date: '2026-09-07', description: 'Praia e descanso.', includes: ['Música ao vivo'], benefits: [], room_prices: [], no_checkin_dates: [], no_checkout_dates: [] },
  { id: 'reveillon', name: 'Réveillon Solar 2027', start_iso_date: '2026-12-31', end_iso_date: '2027-01-03', description: 'Celebração de Ano-Novo.', includes: [], benefits: [], room_prices: [], no_checkin_dates: [], no_checkout_dates: [] },
];

async function loadHandler(file, fixturePackages = packages, fixtureRooms = rooms, fixtureExtras = []) {
  const fixture = JSON.stringify({ room_types: fixtureRooms, packages: fixturePackages, extras: fixtureExtras });
  const result = await build({
    entryPoints: [file], bundle: true, write: false, platform: 'node', format: 'esm',
    define: { 'process.env.VITE_SUPABASE_URL': '"https://fixture.invalid"', 'process.env.VITE_SUPABASE_ANON_KEY': '"fixture"' },
    plugins: [{ name: 'read-only-fixtures', setup(builder) {
      builder.onResolve({ filter: /^sharp$/ }, () => ({path: pathToFileURL(createRequire(import.meta.url).resolve('sharp')).href, external: true}));
      builder.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'supabase-fixture', namespace: 'test' }));
      builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
        const data = ${fixture};
        export function createClient() {
          return { from(table) {
            if (!(table in data)) throw new Error('Unexpected table access: ' + table);
            return { select() { let rows=data[table]; const query={eq(key,value) {if(key==='id') rows=rows.filter(r=>r.id===value); return query;},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve);}}; return query; } };
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

test('áudio transcrito chega às fotos; falha não reutiliza pacote ou evento antigo', async () => {
  const handler = await loadHandler('api/resolve-package.ts', packages, rooms.map(room => ({...room,images:['https://example.com/room.jpg']})));
  const url = 'https://media.example.com/voice.ogg';
  const text = 'Quero fotos do Loft';
  const state = {version:2,history:[text],resolved_message:text,facts:{extras:[]},greeted:true,audio:{source_hash:createHash('sha256').update(url).digest('hex'),text,status:'ok',created_at:Date.now()}};
  const r = await request(handler,{user_message:url,state});
  assert.match(r.quote_request,/ROOM_ID/);
  assert.match(r.room_name,/Loft/);
  for (const invalid of [{...state,audio:{...state.audio,status:'error'}},{...state,audio:{...state.audio,created_at:Date.now()-16*60000}}]) {
    const failed = await request(handler,{user_message:url,state:invalid});
    assert.equal(failed.quote_request,'ROOM_LIST');
    assert.match(failed.conversation_text,/reenviar ou escrever/);
    assert.doesNotMatch(failed.conversation_text,/Loft|pacote|quantas pessoas/);
  }
});

test('programação Heraldo responde antes de pacotes/extras/lead privado sem acessar tabelas', async () => {
  const handler=await loadHandler('api/resolve-package.ts',[],[]);
  for (const user_message of ['Heraldo Ramos dia 05/09/2026 e 06/09/2026', 'Quanto custa o couvert do Heraldo Ramos?']) {
    const r=await request(handler,{user_message,state:{version:2,history:[],facts:{guests:2,extras:[]},greeted:true,turns:[{role:'assistant',text:'Sugiro Mesa Posta'}]}});
    assert.equal(r.quote_request,'ROOM_LIST');
    assert.equal(r.match_type,'public_programming');
    assert.equal(r.availability_checked,false);
    assert.match(r.conversation_text,/Heraldo Ramos/);
    assert.doesNotMatch(r.conversation_text,/Luiza|R\$|Mesa Posta|hospedagem/);
  }
  const state={version:2,history:['E amanhã?'],resolved_message:'Programação musical de Heraldo Ramos no Reserva Solar: E amanhã?',facts:{extras:[]},greeted:true,topic:'public_events'};
  const r=await request(handler,{user_message:'E amanhã?',state});
  assert.equal(r.match_type,'public_programming');
  assert.doesNotMatch(r.conversation_text,/Luiza|quantas pessoas/);
  assert.doesNotMatch(r.conversation_text,/^Olá/);
  const first=await request(handler,{user_message:'Heraldo Ramos hoje?',state:{version:2,history:[],facts:{extras:[]},greeted:true,first_turn:true}});
  assert.match(first.conversation_text,/^Olá!/);
});

test('Reserva Solar possui duas fotos próprias, fila finita e eventos não viram pacotes ou extras', async () => {
  const handler=await loadHandler('api/resolve-package.ts',[],[]);
  const r=await request(handler,{user_message:'Vc tem fotos do restaurante reserva solar?'});
  assert.equal(r.quote_request,'SITE_ID|RESERVA_1|RESERVA_2');
  assert.match(r.conversation_text,/Reserva Solar/); assert.doesNotMatch(r.conversation_text,/Loft|piscina/);
  let next;
  const response={status(){return this;},json(v){next=v;return v;}};
  await handler({method:'POST',query:{operation:'next'},body:{user_message:r.quote_request}},response);
  assert.equal(next.quote_request,'SITE_ID|RESERVA_2');
  await handler({method:'POST',query:{operation:'next'},body:{user_message:next.quote_request}},response);
  assert.equal(next.quote_request,'ROOM_DONE');
  const event=await request(handler,{user_message:'Orçamento de aniversário para 50 pessoas',state:{version:2,history:[],facts:{extras:[]},turns:[{role:'assistant',text:'Sugiro Mesa Posta'}]}});
  assert.equal(event.quote_request,'ROOM_LIST'); assert.match(event.conversation_text,/5591991654050/);
  assert.equal((event.conversation_text.match(/5591991654050/g)||[]).length,1);
  assert.doesNotMatch(event.conversation_text,/99165-4050/);
  assert.equal(event.availability_checked,false);
});

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
  assert.match(result.conversation_text, /Primeiro confirmaremos sua escolha/);
  assert.equal(JSON.parse(result.quote_state).options[0].name, 'Loft');
  assert.ok(result.conversation_text.indexOf('Loft') < result.conversation_text.indexOf('Suíte Casal'));
  assert.equal(result.availability_checked, false);
  assert.equal(result.extras_total, 530);
});

test('foto específica vem da categoria cadastrada, sem preço ou disponibilidade', async () => {
  const original = await sharp({create:{width:2400,height:1600,channels:3,background:'#f60'}}).png().toBuffer();
  const image = 'data:image/png;base64,' + original.toString('base64');
  const room = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'LOFT', images: [image] };
  const quad = { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', name: 'Suíte Quádruplo', images: [image] };
  const handler = await loadHandler('api/resolve-package.ts', [], [room, quad]);
  for (const [message, expected] of [['Quero ver fotos do apto loft', room], ['Quero imagens do quádruplo', quad], ['Me mande fotos dos aptos', room]]) {
    const r = await request(handler, { user_message: message });
    assert.equal(r.quote_request, `ROOM_ID|${expected.id}`);
    assert.equal(r.room_name, expected.name);
    assert.equal(r.availability_checked, false);
    assert.doesNotMatch(r.conversation_text, /R\$|Confirmar opção|CPF|disponível/);
  }
  for (const message of ['Fotos da suíte presidencial', 'Fotos do Loft e da suíte quádruplo']) {
    const r = await request(handler, {user_message: message});
    assert.equal(r.quote_request, 'ROOM_LIST');
  }
  const missing = await loadHandler('api/resolve-package.ts', [], [{...room, images: []}]);
  assert.equal((await request(missing, {user_message: 'Fotos do Loft'})).quote_request, 'ROOM_LIST');
  const imageHandler = await loadHandler('api/package-image.ts', [], [room, quad]);
  let status, bytes; const headers = {};
  await imageHandler({method: 'GET', query: {code: `ROOM_ID|${room.id}`}}, {
    status(code) {status=code; return this;}, setHeader(key,value) {headers[key]=value;},
    send(value) {bytes=value;}, json(value) {throw new Error(JSON.stringify(value));},
  });
  assert.equal(status,200);
  assert.equal(headers['Content-Type'],'image/jpeg');
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format,'jpeg');
  assert.ok(metadata.width <= 1280 && metadata.height <= 1280);
  assert.ok(bytes.length < 4_500_000);
});

test('pedido de foto de pacote mantém o caminho de pacote', async () => {
  const handler = await loadHandler('api/resolve-package.ts');
  const r = await request(handler,{user_message:'Quero foto do pacote Independência Solar'});
  assert.equal(r.quote_request,'PACKAGE_ID|independencia');
});

test('serviço oferecido recebe imagem real, preço correto e memória sem aceite', async()=>{
  const image='data:image/png;base64,'+(await sharp({create:{width:1600,height:1000,channels:3,background:'#369'}}).png().toBuffer()).toString('base64');
  const extras=[{id:'barco',name:'Passeio de Barco',price:100,image_url:image},{id:'mesa',name:'Mesa Posta',price:180,image_url:image}];
  const handler=await loadHandler('api/resolve-package.ts',packages,rooms,extras);
  const state={version:2,history:['Vamos comemorar'],facts:{extras:[]},greeted:true,turns:[{role:'assistant',text:'Que tal a Mesa Posta para celebrar?'}]};
  const result=await request(handler,{user_message:'Vamos comemorar',state});
  assert.match(result.quote_request,/^EXTRA_ID\|MESA/);assert.match(result.conversation_text,/180,00/);
  assert.deepEqual(JSON.parse(result.state).facts.extras,[]);
  assert.deepEqual(JSON.parse(result.state).extra_photo_requests,['MESA']);
  const imageHandler=await loadHandler('api/package-image.ts',packages,rooms,extras);
  let status,bytes;const headers={};
  await imageHandler({method:'GET',query:{code:result.quote_request}},{status(c){status=c;return this;},setHeader(k,v){headers[k]=v;},send(v){bytes=v;},json(v){throw Error(JSON.stringify(v));}});
  assert.equal(status,200);assert.equal(headers['Content-Type'],'image/jpeg');assert.ok(bytes.length<4500000);
  const repeat=await request(handler,{user_message:'Vamos comemorar',state:result.state});assert.equal(repeat.matched,false);
  const resend=await request(handler,{user_message:'Foto da Mesa Posta novamente',state:result.state});assert.match(resend.quote_request,/^EXTRA_ID\|MESA/);
});

test('todos os aptos percorre categorias uma vez e termina; pacote não entra no loop', async () => {
  const catalog = Array.from({length:6},(_,i)=>({id:`room${i}`,name:`Categoria ${i}`,images:['https://example.com/room.jpg']}));
  catalog.push({id:'missing',name:'Sem foto',images:[]});
  const handler = await loadHandler('api/resolve-package.ts',packages,catalog);
  let response = await request(handler,{user_message:'Fotos de todos os aptos'});
  const names = [];
  while (response.quote_request.startsWith('ROOM_ID|')) {
    names.push(response.room_name);
    assert.ok(names.length<=6);
    await handler({method:'POST',query:{operation:'next'},body:{user_message:response.quote_request}},{status(){return this;},json(v){response=v;return v;}});
  }
  assert.deepEqual(names,catalog.slice(0,6).map(r=>r.name));
  assert.equal(response.quote_request,'ROOM_DONE');
  await handler({method:'POST',query:{operation:'next'},body:{user_message:'PACKAGE_ID|independencia'}},{status(){return this;},json(v){response=v;return v;}});
  assert.equal(response.quote_request,'ROOM_DONE');
});

test('resolver usa referência contextual e registra a resposta real de mídia separadamente', async () => {
  const handler = await loadHandler('api/resolve-package.ts',[],[{id:'varanda',name:'Suíte Varanda Térreo',images:['https://example.com/varanda.jpg']}]);
  const state = {version:2,history:['Fotos dos aptos','Varanda térreo'],facts:{extras:[],guests:4},greeted:true,resolved_message:'Fotos de Varanda térreo',topic:'room_photos'};
  const r = await request(handler,{user_message:'Varanda térreo',state:JSON.stringify(state)});
  assert.equal(r.quote_request,'ROOM_ID|varanda');
  assert.equal(JSON.parse(r.state).subject,'Suíte Varanda Térreo');
  assert.equal(JSON.parse(r.state).turns.at(-1).text,r.conversation_text);
  assert.deepEqual(JSON.parse(r.state).facts,state.facts);
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

test('saudações e termos genéricos não selecionam o Dia das Crianças', async () => {
  const handler = await loadHandler('api/resolve-package.ts', [{ ...packages[0], name: 'Dia das Crianças: 4 Dias de Feriado em Salinas', description: 'Praia e lazer. Use o cupom OUTUBRO15 e garanta desconto. Apenas 15 reservas com desconto.' }]);
  for (const user_message of ['Bom dia ☀️', 'Boa tarde', 'Oi', 'Para duas pessoas, qual vc me indica?', 'Quantos dias?', 'Qual a localização em Salinas?']) {
    const result = await request(handler, { user_message });
    assert.equal(result.matched, false, user_message);
  }
  const result = await request(handler, { user_message: 'Quero conhecer o pacote Dia das Crianças' });
  assert.equal(result.matched, true);
  assert.match(result.quote_text, /OUTUBRO15/);
  assert.doesNotMatch(result.conversation_text, /OUTUBRO15|15 reservas/);
});
