import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
const now=Date.parse('2026-09-13T10:00:00-03:00');
const realNow=Date.now;Date.now=()=>now;
const b=await build({stdin:{contents:`export {control,handleConversation,safeTypedMessage} from './api/conversation-control.ts';export {default as resolver} from './api/resolve-package.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',define:{'process.env.VITE_SUPABASE_URL':'"https://example.test"','process.env.VITE_SUPABASE_ANON_KEY':'"synthetic"'},
  plugins:[{name:'no-provider',setup(builder){builder.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'blocked',namespace:'blocked'}));builder.onLoad({filter:/.*/,namespace:'blocked'},()=>({contents:'export function createClient(){throw Error("Unexpected provider access")}'}));}}]});
const {control,handleConversation,safeTypedMessage,resolver}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const initial={version:2,history:[],facts:{extras:[]},greeted:true};
function turn(user_message,state=initial,answer='Resposta factual.'){
  const p=control({operation:'prepare',user_message,state},now);
  const r=control({operation:'route',user_message,state:p.state,proposed:'NOQUOTE',ai_response:answer},now);
  return {p,r,state:JSON.parse(r.state),context:JSON.parse(p.context)};
}
function noPrivate(value){assert.doesNotMatch(JSON.stringify(value),/Ana|Fulano|de Tal|123\.456\.789-00|12345678900|fulano@example\.com/);}

test('apresentação digitada preserva pessoas e datas sem guardar o nome',()=>{
  for(const user_message of [
    'Me chamo Ana. Somos 2 adultos, entrada 20/09 e saída 22/09.',
    'Meu nome é Fulano de Tal, somos 2 adultos, entrada 20/09 e saída 22/09.',
    'Somos 2 adultos, entrada 20/09 e saída 22/09. Meu nome é Fulano de Tal.',
    'Me chamo Ana. Entrada 20/09 e saída 22/09, 2 adultos.',
    'Me chamo Ana. Somos 2 adultos, meu RG é 12.345.678-9, entrada 20/09 e saída 22/09.',
  ]){
    const {p,r,state,context}=turn(user_message);
    assert.deepEqual(state.facts,{extras:[],guests:2,check_in:'2026-09-20',check_out:'2026-09-22'});
    assert.equal(r.quote_request,'QUOTE|2026-09-20|2026-09-22|2|NONE');
    assert.match(context.ultima_mensagem,/2 adultos/);
    assert.doesNotMatch(p.state+p.context+r.state,/12\.345\.678-9/);
    assert.doesNotMatch(r.answer,/quantas pessoas/);noPrivate({p,r});
  }
});

test('PII no texto não apaga pergunta factual e não sobrevive entre etapas',()=>{
  for(const message of [
    'Meu nome é Fulano, qual o cardápio do Reserva Solar?',
    'Meu CPF é 123.456.789-00 e meu e-mail é fulano@example.com, pode me passar o cardápio do Reserva Solar?',
  ]){
    const {p,r,context}=turn(message,initial,'Cardápio: https://cardapio-reserva-solar.vercel.app/');
    assert.match(context.ultima_mensagem,/cardápio do Reserva Solar/);
    assert.equal(r.quote_request,'NOQUOTE');assert.match(r.answer,/cardapio-reserva-solar/);noPrivate({p,r});
  }
});

test('nome sem pedido separável permanece omitido; perguntas sobre CPF são legíveis',()=>{
  for(const message of ['Meu nome é Fulano de Tal','Me chamo Fulano, de Tal']){
    assert.equal(safeTypedMessage(message),'[Dado pessoal omitido]');
    noPrivate(turn(message).p);
  }
  assert.equal(safeTypedMessage('Preciso informar CPF para reservar?'),'Preciso informar Cadastro de Pessoas Físicas para reservar?');
  const plain='Somos 1\nCasal e 3 crianças\n1 de 16\n1 de 10\n1 de 8';
  assert.equal(safeTypedMessage(plain),plain);
  assert.equal(safeTypedMessage('Me chamo Ana. O Reserva abre hoje?'),'O Reserva abre hoje?');
  assert.equal(safeTypedMessage('Me chamo Ana. Fotos das piscinas, por favor.'),'Fotos das piscinas, por favor.');
  for(const label of ['RG é 12.345.678-9','RG: 12 345 678 9','CNH 12345678901','passaporte AB123456']){
    const safe=safeTypedMessage('Me chamo Ana. Somos 2 adultos, meu '+label+', entrada 20/09 e saída 22/09.');
    assert.match(safe,/2 adultos/);assert.doesNotMatch(safe,/Ana|12[. ]?345|AB123456/);
  }
});

test('pedidos operacionais com nome continuam exigindo humano sem expor PII',()=>{
  for(const message of ['Me chamo Ana. Preciso de toalhas no quarto.','Meu nome é Fulano, quero falar com a recepção.','Não quero informar CPF']){
    const {p,r}=turn(message);assert.equal(r.quote_request,'HUMANO');assert.equal(r.can_collect,'NAO');noPrivate({p,r});
  }
});

test('resolvedor reconhece turno digitado sanitizado e mantém a resposta atual',async()=>{
  const message='Me chamo Ana. Qual o cardápio do Reserva Solar?';
  const answer='Cardápio: https://cardapio-reserva-solar.vercel.app/';
  const {r}=turn(message,initial,answer);
  let status,result;
  await resolver({method:'POST',body:{user_message:message,state:r.state},query:{}},{status(code){status=code;return this;},json(value){result=value;return value;}});
  assert.equal(status,200);assert.match(result.conversation_text,/cardapio-reserva-solar/);noPrivate(result);
});

test('áudio e texto preservam a mesma ocupação sem reaproveitar identidades',async()=>{
  const message='Me chamo Ana. Somos 2 adultos, entrada 20/09 e saída 22/09.';
  const typed=turn(message);
  const audio='https://media.example.test/voice.ogg';
  const p=await handleConversation({operation:'prepare',user_message:audio,state:initial},'',async()=>message,now);
  const r=control({operation:'route',user_message:audio,state:p.state,proposed:'NOQUOTE'},now);
  assert.deepEqual(JSON.parse(r.state).facts,typed.state.facts);noPrivate({p,r});
});

test('resolver mantém informação de piscina após recusa de humano, por texto e áudio',async()=>{
  const message='Não quero falar com atendente, só saber o horário da piscina.';
  const answer='A piscina principal funciona das 10h às 22h.';
  for(const audio of [false,true]){
    const user_message=audio?'https://media.example.test/voice.ogg':message;
    const p=await handleConversation({operation:'prepare',user_message,state:initial},'',async()=>message,now);
    const r=control({operation:'route',user_message,state:p.state,proposed:'HUMANO',ai_response:answer},now);
    assert.equal(JSON.parse(p.context).recusa_atendimento_humano,true);
    assert.equal(r.quote_request,'NOQUOTE');
    let result;
    await resolver({method:'POST',body:{user_message,state:r.state},query:{}},{status(code){assert.equal(code,200);return this;},json(value){result=value;return value;}});
    assert.equal(result.match_type,'human_refusal_information');
    assert.equal(result.conversation_text,r.answer);
    assert.equal(result.quote_request,'ROOM_LIST');
    assert.equal(result.availability_checked,false);
  }
});

test('recusa de conversa humana não oculta defeito operacional relatado na mesma mensagem',async()=>{
  const message='Não quero falar com atendente, meu ar condicionado do quarto não funciona.';
  for(const audio of [false,true]){
    const user_message=audio?'https://media.example.test/voice.ogg':message;
    const p=await handleConversation({operation:'prepare',user_message,state:initial},'',async()=>message,now);
    const r=control({operation:'route',user_message,state:p.state,proposed:'NOQUOTE',ai_response:'Posso ajudar?'},now);
    assert.equal(r.quote_request,'HUMANO');
    assert.match(r.answer,/recepção/);
    let result;
    await resolver({method:'POST',body:{user_message,state:r.state},query:{}},{status(code){assert.equal(code,200);return this;},json(value){result=value;return value;}});
    assert.equal(result.quote_request,'HUMANO');
  }
});
test.after(()=>{Date.now=realNow;});
