import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundled = await build({entryPoints:['api/conversation-control.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {control,handleConversation} = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const now = Date.parse('2026-09-08T16:00:00Z');
const audio = 'https://media.example.com/voice.ogg?signature=private-fixture';
const auth = 'Bearer fixture-only';
const menu = 'Cardápio do Reserva Solar: https://cardapio-reserva-solar.vercel.app/';

test('áudio do Reserva Solar chega ao contexto e preserva gastronomia até a resposta', async () => {
  let calls = 0;
  const p = await handleConversation({operation:'prepare',user_message:audio},auth,async (url,authorization) => {
    calls++; assert.equal(url,audio); assert.equal(authorization,auth);
    return 'Qual o cardápio do restaurante Reserva Solar?';
  },now);
  assert.equal(calls,1);
  assert.equal(p.transcription_status,'ok');
  assert.equal(JSON.parse(p.context).ultima_mensagem,'Qual o cardápio do restaurante Reserva Solar?');
  assert.equal(JSON.parse(p.context).tipo_entrada,'audio');
  assert.doesNotMatch(p.state+p.context,/signature|media\.example|Bearer/);
  const r = control({operation:'route',user_message:audio,state:p.state,ai_response:menu,proposed:'QUOTE|2026-09-20|2026-09-25|2|NONE'},now);
  assert.equal(r.quote_request,'NOQUOTE');
  assert.equal(r.can_collect,'NAO');
  assert.match(r.answer,/cardapio-reserva-solar/);
  assert.doesNotMatch(r.answer,/quantas pessoas|datas de entrada/i);
  assert.equal(r.resolved_message,'Qual o cardápio do restaurante Reserva Solar?');
});

test('áudio aproveita pessoas da conversa e datas faladas continuam na cotação', async () => {
  const first = control({operation:'prepare',user_message:'Quero hospedagem para duas pessoas'},now);
  const p = await handleConversation({operation:'prepare',user_message:audio,state:first.state},auth,async () => 'De 20 a 25 de setembro.',now);
  const r = control({operation:'route',user_message:audio,state:p.state,ai_response:'Resposta.'},now);
  assert.equal(r.quote_request,'QUOTE|2026-09-20|2026-09-25|2|NONE');
  assert.deepEqual(JSON.parse(r.state).facts,{extras:[],guests:2,check_in:'2026-09-20',check_out:'2026-09-25'});
});

test('áudio de acompanhamento mantém referência das fotos solicitadas', async () => {
  const first = control({operation:'prepare',user_message:'Quero fotos de todos os apartamentos'},now);
  const p = await handleConversation({operation:'prepare',user_message:audio,state:first.state},auth,async () => 'Varanda térreo',now);
  const r = control({operation:'route',user_message:audio,state:p.state,ai_response:'Fotos.'},now);
  assert.equal(r.resolved_message,'Fotos de Varanda térreo');
  assert.equal(r.quote_request,'NOQUOTE');
});

test('áudio de bicicletas e piscinas mantém fotos de lazer e perguntas anteriores em foco', async () => {
  for (const [firstMessage,spoken,resolved,codes] of [
    ['Quero fotos do parque infantil','E das bicicletas?','Fotos de E das bicicletas?',['BIKE']],
    ['Fotos das bicicletas','e das piscinas?','Fotos de e das piscinas?',['PISCINA']],
    ['O hotel tem piscina?','Tem fotos?','Fotos de piscinas',['PISCINA']],
    ['Playground para crianças?','Tem foto?','Fotos de parque infantil',['PARQUE']],
  ]) {
    const first = control({operation:'prepare',user_message:firstMessage},now);
    const p = await handleConversation({operation:'prepare',user_message:audio,state:first.state},auth,async()=>spoken,now);
    const r = control({operation:'route',user_message:audio,state:p.state,ai_response:'Não temos fotos.',proposed:'COLETAR'},now);
    assert.equal(r.resolved_message,resolved);
    assert.deepEqual(JSON.parse(r.state).extra_photo_subjects,codes);
    assert.equal(r.quote_request,'NOQUOTE');
    assert.equal(r.can_collect,'NAO');
    assert.match(r.answer,/consultar as fotos/);
    assert.deepEqual(JSON.parse(r.state).facts,{extras:[]});
    assert.doesNotMatch(p.state+p.context,/signature|media\.example|Bearer/);
  }
});

test('falha ou áudio vazio não reutiliza resposta antiga nem inicia coleta', async () => {
  const state = control({operation:'prepare',user_message:'De 20 a 25 de setembro para duas pessoas'},now).state;
  for (const transcribe of [async () => {throw Error('provider secret');},async () => '   ']) {
    const p = await handleConversation({operation:'prepare',user_message:audio,state},auth,transcribe,now);
    assert.equal(p.transcription_status,'error');
    assert.equal(JSON.parse(p.context).audio_transcrito,false);
    const r = control({operation:'route',user_message:audio,state:p.state,ai_response:'Sua reserva está confirmada.',proposed:'COLETAR'},now);
    assert.equal(r.quote_request,'NOQUOTE'); assert.equal(r.can_collect,'NAO');
    assert.match(r.answer,/reenviar ou escrever/);
    assert.doesNotMatch(r.answer,/confirmada|secret/);
    assert.equal(JSON.parse(r.state).pending,undefined);
  }
});

test('troca de arquivo ou transcrição expirada não reaproveita consentimento antigo', async () => {
  const p = await handleConversation({operation:'prepare',user_message:audio},auth,async () => 'Quero falar com a recepção',now);
  const human = control({operation:'route',user_message:audio,state:p.state},now);
  assert.equal(human.quote_request,'HUMANO');
  for (const [url,time] of [[audio.replace('voice','new'),now],[audio,now+16*60000]]) {
    const r = control({operation:'route',user_message:url,state:p.state,proposed:'COLETAR'},time);
    assert.equal(r.quote_request,'NOQUOTE'); assert.match(r.answer,/reenviar/);
  }
});

test('texto segue sem chamar transcrição e limpa o áudio anterior', async () => {
  const audioTurn = await handleConversation({operation:'prepare',user_message:audio},auth,async () => 'Cardápio do Reserva Solar',now);
  const p = await handleConversation({operation:'prepare',user_message:'Quero uma reserva no Hotel Solar',state:audioTurn.state},'',async () => {throw Error('Should not transcribe text');},now);
  assert.equal(p.transcription_status,undefined);
  assert.equal(JSON.parse(p.state).audio,undefined);
  const r = control({operation:'route',user_message:'Quero uma reserva no Hotel Solar',state:p.state},now);
  assert.match(r.answer,/quantas pessoas/);
});

test('transcrição não passa a guardar dados pessoais no estado', async () => {
  const p = await handleConversation({operation:'prepare',user_message:audio},auth,async () => 'Meu CPF é 12345678900',now);
  assert.doesNotMatch(p.state+p.context,/12345678900/);
});

test('recusa de informar CPF e apresentação pessoal preservam pedido de atendimento humano', async () => {
  for (const message of ['Não quero informar CPF', 'Meu nome é Fulano, quero falar com a recepção', 'Me chamo Fulano; pode chamar a recepção? Meu CPF é 123.456.789-00']) {
    const p = await handleConversation({operation:'prepare',user_message:audio},auth,async () => message,now);
    const r = control({operation:'route',user_message:audio,state:p.state,proposed:'QUOTE|2026-09-20|2026-09-25|2|NONE'},now);
    assert.equal(JSON.parse(p.context).ultima_mensagem,'Quero falar com a recepção');
    assert.equal(r.quote_request,'HUMANO',message);
    assert.doesNotMatch(p.state+p.context+r.state,/Fulano|123\.456\.789-00/);
  }
});

test('nome, CPF e e-mail não apagam a pergunta de gastronomia nem sobrevivem no estado', async () => {
  for (const message of [
    'Meu nome é Fulano, qual o cardápio do Reserva Solar?',
    'Me chamo Fulano de Tal; quero o cardápio do Reserva Solar.',
    'Meu nome é Fulano de Tal quero o cardápio do Reserva Solar.',
    'Qual o cardápio do Reserva Solar? Meu nome é Fulano de Tal.',
    'Meu CPF é 123.456.789-00 e meu e-mail é fulano@example.com, pode me passar o cardápio do Reserva Solar?',
  ]) {
    const p = await handleConversation({operation:'prepare',user_message:audio},auth,async () => message,now);
    assert.match(JSON.parse(p.context).ultima_mensagem,/cardápio do Reserva Solar/);
    const r = control({operation:'route',user_message:audio,state:p.state,ai_response:menu,proposed:'QUOTE|2026-09-20|2026-09-25|2|NONE'},now);
    assert.equal(r.quote_request,'NOQUOTE');
    assert.match(r.answer,/cardapio-reserva-solar/);
    assert.doesNotMatch(r.answer,/quantas pessoas|datas de entrada/);
    assert.doesNotMatch(p.state+p.context+r.state,/Fulano|fulano@example|123\.456\.789-00/);
  }
});

test('apresentação antes do pedido de fotos preserva a solicitação para o resolvedor de mídia', async () => {
  for (const message of ['Meu nome é Fulano, quero fotos do Loft', 'Me chamo Fulano de Tal pode me mandar fotos do Loft?']) {
    const p = await handleConversation({operation:'prepare',user_message:audio},auth,async () => message,now);
    const r = control({operation:'route',user_message:audio,state:p.state,ai_response:'Fotos.',proposed:'QUOTE|2026-09-20|2026-09-25|2|NONE'},now);
    assert.equal(r.quote_request,'NOQUOTE');
    assert.match(r.resolved_message,/fotos do Loft/);
    assert.match(JSON.parse(r.state).audio.text,/fotos do Loft/);
    assert.doesNotMatch(p.state+p.context+r.state,/Fulano/);
  }
});

test('perguntas sobre CPF sem número continuam compreensíveis e nomes sem pedido separável são omitidos', async () => {
  const p = await handleConversation({operation:'prepare',user_message:audio},auth,async () => 'Preciso informar CPF para reservar?',now);
  assert.equal(JSON.parse(p.context).ultima_mensagem,'Preciso informar Cadastro de Pessoas Físicas para reservar?');
  for (const message of ['Meu nome é Fulano de Tal', 'Me chamo Fulano, de Tal']) {
    const hidden = await handleConversation({operation:'prepare',user_message:audio},auth,async () => message,now);
    assert.equal(JSON.parse(hidden.state).audio.text,'[Dado pessoal omitido]');
    assert.doesNotMatch(hidden.state+hidden.context,/Fulano|de Tal/);
  }
});
