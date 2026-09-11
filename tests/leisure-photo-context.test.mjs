import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundled = await build({entryPoints:['api/conversation-control.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {control,handleConversation} = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const now = Date.parse('2026-09-08T16:00:00Z');
const facts = {extras:['MESA'],guests:2,check_in:'2026-09-20',check_out:'2026-09-25'};
const initial = {version:2,history:[],facts,greeted:true,daily_greeting:{day:new Date(now-3*3600000).toISOString().slice(0,10),first:false}};
const prepare = (user_message,state=initial,time=now) => control({operation:'prepare',user_message,state},time);
const route = (user_message,state,time=now) => control({operation:'route',user_message,state,ai_response:'Não temos fotos.',proposed:'QUOTE|2026-09-20|2026-09-25|2|MESA'},time);

test('fotos conhecidas de lazer não repetem negação da IA nem afirmam envio', () => {
  for (const [message,codes] of [
    ['Quero fotos do parque infantil, piscinas e bicicletas',['PARQUE','PISCINA','BIKE']],
    ['Quero uma imagem da piscina',['PISCINA']],
    ['Tem fotografias do playground?',['PARQUE']],
    ['Álbum das bicicletas',['BIKE']],
    ['Galeria do parquinho',['PARQUE']],
    ['Fotos das duas piscinas de hidromassagem',['HIDRO']],
    ['Quero fotos da piscina principal e das hidromassagens',['PISCINA','HIDRO']],
    ['Quero fotos das três piscinas',['PISCINA','HIDRO']],
    ['Fotos de todas as piscinas',['PISCINA','HIDRO']],
  ]) {
    const p = prepare(message);
    const r = route(message,p.state);
    const state = JSON.parse(r.state);
    assert.equal(state.topic,'extra_photos',message);
    assert.deepEqual(state.extra_photo_subjects,codes,message);
    assert.deepEqual(JSON.parse(p.context).fotos_lazer_solicitadas,codes,message);
    assert.deepEqual(state.facts,facts,message);
    assert.equal(r.quote_request,'NOQUOTE');
    assert.equal(r.can_collect,'NAO');
    assert.equal(r.confirmation_text,'');
    assert.match(r.answer,/consultar as fotos/);
    assert.doesNotMatch(r.answer,/não temos|enviei|enviadas|encaminhei/i);
    assert.equal(state.turns.some(turn=>turn.role==='assistant'),false);
  }
});

test('negativas reais observadas no ManyChat são substituídas antes do resolvedor de fotos', () => {
  for (const [message,denial] of [
    ['Fotos das piscinas','O hotel tem piscina, mas não dispomos de fotos específicas para envio aqui.'],
    ['Fotos do playground','No momento, não disponho de fotos específicas do playground para enviar.'],
  ]) {
    const p = prepare(message);
    const r = control({operation:'route',user_message:message,state:p.state,ai_response:denial},now);
    assert.equal(r.answer,'Vou consultar as fotos solicitadas no acervo do hotel.');
    assert.equal(r.quote_request,'NOQUOTE');
    assert.doesNotMatch(r.state,/não dispomos|não disponho|enviadas|enviei/);
  }
});

test('reprodução do teste: piscina e parque em foco resolvem Tem fotos sem contaminar crianças', () => {
  let state = initial;
  for (const [message,resolved,topic,code] of [
    ['O hotel tem piscina?','O hotel tem piscina?','extra_info','PISCINA'],
    ['Tem fotos?','Fotos de piscinas','extra_photos','PISCINA'],
    ['Tem parquinho para crianças?','Tem parquinho para crianças?','extra_info','PARQUE'],
    ['Playground para crianças?','Playground para crianças?','extra_info','PARQUE'],
    ['Tem foto?','Fotos de parque infantil','extra_photos','PARQUE'],
  ]) {
    const p = prepare(message,state);
    const r = route(message,p.state);
    state = JSON.parse(r.state);
    assert.equal(r.resolved_message,resolved,message);
    assert.equal(state.topic,topic,message);
    assert.deepEqual(state.extra_photo_subjects,[code],message);
    assert.deepEqual(state.facts,facts,message);
    assert.equal(state.facts.children_pending,undefined,message);
    assert.equal(r.quote_request,'NOQUOTE',message);
    assert.equal(r.can_collect,'NAO',message);
  }
});

test('acompanhamentos curtos trocam entre fotos de lazer sem usar assunto de apartamento', () => {
  let state = control({operation:'remember_response',state:prepare('Fotos do Loft').state,room_name:'Loft',response_text:'Loft.'},now).state;
  for (const [message,codes] of [
    ['E das bicicletas?',['BIKE']],
    ['e das piscinas?',['PISCINA']],
    ['E do parque infantil e bicicletas?',['PARQUE','BIKE']],
    ['E das hidros?',['HIDRO']],
    ['E das duas piscinas de hidromassagem?',['HIDRO']],
    ['E da piscina principal e hidromassagens?',['PISCINA','HIDRO']],
  ]) {
    const p = prepare(message,state);
    const r = route(message,p.state);
    state = r.state;
    assert.equal(r.resolved_message,`Fotos de ${message}`);
    assert.deepEqual(JSON.parse(state).extra_photo_subjects,codes);
    assert.equal(JSON.parse(state).subject,undefined);
    assert.deepEqual(JSON.parse(state).facts,facts);
    assert.equal(r.quote_request,'NOQUOTE');
  }
});

test('informação sobre hidromassagem seguida de fotos mantém só as hidros e não altera hóspedes',()=>{
 for(const message of ['Tem hidromassagem?','Vocês têm duas piscinas de hidromassagem?','Como são as hidros?']) {
  const first=prepare(message);
  assert.equal(JSON.parse(first.state).topic,'extra_info',message);
  assert.deepEqual(JSON.parse(first.state).extra_photo_subjects,['HIDRO'],message);
  assert.deepEqual(JSON.parse(first.state).facts,facts,message);
  assert.deepEqual(JSON.parse(first.context).fotos_lazer_solicitadas,[],message);
  for(const followup of ['Tem fotos?','Tem fotos delas?']) {
   const p=prepare(followup,first.state);
   const r=route(followup,p.state);
   assert.equal(r.resolved_message,'Fotos de piscinas de hidromassagem',message);
   assert.deepEqual(JSON.parse(r.state).extra_photo_subjects,['HIDRO'],message);
   assert.deepEqual(JSON.parse(r.state).facts,facts,message);
   assert.equal(r.quote_request,'NOQUOTE');
   assert.equal(r.can_collect,'NAO');
  }
 }
 const both=prepare('Fotos da piscina principal e das hidromassagens');
 assert.equal(JSON.parse(prepare('Todas, pfv',both.state).state).resolved_message,'Fotos de piscinas e piscinas de hidromassagem');
 assert.deepEqual(JSON.parse(prepare('Todas, pfv',both.state).state).extra_photo_subjects,['PISCINA','HIDRO']);
 const information=prepare('Tem hidromassagem?');
 assert.equal(JSON.parse(prepare('E das hidros?',information.state).state).topic,'extra_info');
 const expired=prepare('Tem fotos?',information.state,now+31*60000);
 assert.equal(JSON.parse(expired.state).resolved_message,'Tem fotos?');
});

test('grupo das três piscinas mantém referência em acompanhamentos de foto e informação',()=>{
 const photoState=prepare('Fotos da hidro').state;
 for(const message of ['E de todas as piscinas?','E das três piscinas?','E das 3 piscinas?']) {
  const p=prepare(message,photoState);
  const r=route(message,p.state);
  assert.equal(r.resolved_message,`Fotos de ${message}`);
  assert.equal(JSON.parse(r.state).topic,'extra_photos');
  assert.deepEqual(JSON.parse(r.state).extra_photo_subjects,['PISCINA','HIDRO']);
  assert.deepEqual(JSON.parse(r.state).facts,facts);
 }
 for(const message of ['Tem três piscinas?','Como são todas as piscinas?']) {
  const p=prepare(message);
  assert.equal(JSON.parse(p.state).topic,'extra_info');
  assert.deepEqual(JSON.parse(p.state).extra_photo_subjects,['PISCINA','HIDRO']);
  assert.deepEqual(JSON.parse(p.context).fotos_lazer_solicitadas,[]);
  const next=prepare('Tem fotos delas?',p.state);
  assert.equal(JSON.parse(next.state).resolved_message,'Fotos de piscinas e piscinas de hidromassagem');
  assert.deepEqual(JSON.parse(next.state).extra_photo_subjects,['PISCINA','HIDRO']);
  assert.deepEqual(JSON.parse(next.state).facts,facts);
 }
 const hydrosOnly=prepare('E de todas as piscinas de hidromassagem?',photoState);
 assert.equal(JSON.parse(hydrosOnly.state).topic,'extra_photos');
 assert.deepEqual(JSON.parse(hydrosOnly.state).extra_photo_subjects,['HIDRO']);
});

test('foto dessa piscina nunca herda o nome de quarto em memória', () => {
  const state = {...initial,subject:'Loft',topic:'room_photos',topic_at:now};
  const p = prepare('Quero fotos dessa piscina',state);
  assert.equal(JSON.parse(p.state).resolved_message,'Quero fotos dessa piscina');
  assert.equal(JSON.parse(p.state).subject,undefined);
  assert.deepEqual(JSON.parse(p.state).extra_photo_subjects,['PISCINA']);
});

test('Todas após lazer repete os assuntos de lazer e nunca muda para todos os apartamentos', () => {
  const first = prepare('Quero fotos do parque infantil e piscinas');
  for (const message of ['Todas, pfv', 'Todos', 'Quero fotos de todas']) {
    const p = prepare(message,first.state);
    const r = route(message,p.state);
    assert.equal(r.resolved_message,'Fotos de parque infantil e piscinas',message);
    assert.equal(JSON.parse(r.state).topic,'extra_photos',message);
    assert.deepEqual(JSON.parse(r.state).extra_photo_subjects,['PARQUE','PISCINA'],message);
    assert.equal(r.quote_request,'NOQUOTE');
    assert.doesNotMatch(r.resolved_message,/apartamento|quarto|loft/i);
  }
  // An explicitly named new subject remains a deliberate topic change.
  const rooms = prepare('Todas as acomodações',first.state);
  assert.equal(JSON.parse(rooms.state).resolved_message,'Fotos de todos os apartamentos');
  assert.equal(JSON.parse(rooms.state).topic,'room_photos');
});

test('nome de quarto lembrado pelo assistente não substitui lazer atual do cliente', () => {
  const first = prepare('O hotel tem piscina?');
  const remembered = control({operation:'remember_response',state:first.state,response_text:'Conheça também o Loft.',room_name:'Loft'},now);
  const p = prepare('Tem fotos?',remembered.state);
  assert.equal(JSON.parse(p.state).resolved_message,'Fotos de piscinas');
  assert.equal(JSON.parse(p.state).subject,undefined);
  assert.deepEqual(JSON.parse(p.state).extra_photo_subjects,['PISCINA']);
});

test('foco de lazer só vira pedido fotográfico com intenção explícita', () => {
  let state = prepare('O hotel tem piscina?').state;
  for (const message of ['E das bicicletas?', 'As bicicletas são gratuitas?', 'Tem piscina para crianças?']) {
    const p = prepare(message,state);
    state = p.state;
    assert.equal(JSON.parse(state).resolved_message,message);
    assert.equal(JSON.parse(state).topic,'extra_info');
    assert.deepEqual(JSON.parse(p.context).fotos_lazer_solicitadas,[]);
    assert.deepEqual(JSON.parse(state).facts,facts);
  }
  const p = prepare('Tem alguma imagem?',state);
  assert.equal(JSON.parse(p.state).resolved_message,'Fotos de piscinas');
});

test('novo assunto encerra foco e não transforma perguntas genéricas em fotos antigas', () => {
  for (const message of ['Tem academia?', 'Qual o cardápio?', 'Quero uma reserva no Hotel Solar', 'Quero falar com a recepção']) {
    const p = prepare(message,prepare('Quero fotos das piscinas').state);
    assert.equal(JSON.parse(p.state).topic,undefined,message);
    assert.equal(JSON.parse(p.state).extra_photo_subjects,undefined,message);
    assert.equal(JSON.parse(prepare('Tem fotos?',p.state).state).resolved_message,'Tem fotos?',message);
    assert.equal(JSON.parse(prepare('E das bicicletas?',p.state).state).resolved_message,'E das bicicletas?',message);
  }
  const unknown = prepare('Quero fotos delas na academia',prepare('Fotos das piscinas').state);
  assert.equal(JSON.parse(unknown.state).resolved_message,'Quero fotos delas na academia');
  assert.equal(JSON.parse(unknown.state).extra_photo_subjects,undefined);
});

test('foco expira em 30 minutos e timestamps inválidos não revivem intenção antiga', () => {
  const state = JSON.parse(prepare('Fotos de piscinas').state);
  for (const stamp of [now-31*60000,now+60000,0]) {
    for (const message of ['Tem fotos?','E das bicicletas?']) {
      const p = prepare(message,{...state,topic_at:stamp,turns:[]});
      assert.equal(JSON.parse(p.state).resolved_message,message);
      assert.notEqual(JSON.parse(p.state).topic,'extra_photos');
    }
  }
  assert.equal(JSON.parse(prepare('Tem fotos?',state,now+30*60000).state).resolved_message,'Fotos de piscinas');
});

test('memória aceita os sete códigos de mídia mas não os inclui nos extras pagos', () => {
  const p = control({operation:'remember_response',state:initial,extra_photo_requests:['PARQUE','PISCINA','BIKE','BARCO','MESA','LUA','HIDRO','PARQUE','UNKNOWN',{},['PISCINA']]},now);
  const q = prepare('Bom dia',p.state);
  assert.deepEqual(JSON.parse(q.state).extra_photo_requests,['PARQUE','PISCINA','BIKE','BARCO','MESA','LUA','HIDRO']);
  assert.deepEqual(JSON.parse(q.state).facts,facts);
});

test('anexo e áudio falho removem foco de lazer para os próximos acompanhamentos', async () => {
  for (const url of ['https://media.example.test/receipt.pdf','https://media.example.test/audio.ogg']) {
    const p = await handleConversation({operation:'prepare',user_message:url,state:prepare('Fotos de piscinas').state},'',async()=>{throw Error('unavailable');},now,async()=>({kind:'unreadable',summary:''}));
    const state = JSON.parse(p.state);
    assert.equal(state.topic,undefined,url);
    assert.equal(state.extra_photo_subjects,undefined,url);
    assert.equal(JSON.parse(prepare('Tem fotos?',state).state).resolved_message,'Tem fotos?',url);
  }
});

test('fotos anulam confirmação pendente sem mudar fatos e perguntas preservam pendência de crianças legada', () => {
  const quote = {version:1,id:'quote',created_at:now,...facts,options:[{name:'Loft',capacity:4,total:1000}]};
  const state = {...initial,pending:{quote_id:'quote',option:'Loft'}};
  const p = prepare('Quero fotos das bicicletas',state);
  assert.deepEqual(JSON.parse(p.state).facts,facts);
  assert.equal(JSON.parse(p.state).pending,undefined);
  const confirmation = control({operation:'confirm',state:p.state,quote_state:quote},now);
  assert.equal(confirmation.can_collect,'NAO');
  const legacy = prepare('Tem parquinho para crianças?',{...initial,facts:{...facts,children_pending:true}});
  assert.equal(JSON.parse(legacy.state).facts.children_pending,true);
});
