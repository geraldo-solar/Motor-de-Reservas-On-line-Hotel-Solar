import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

// Anonymized phrases only; no customer identifiers, real links or providers.
const now=Date.parse('2026-09-12T08:17:00-03:00');
const realNow=Date.now;
Date.now=()=>now;
const bundle=await build({stdin:{contents:`export {control,handleConversation} from './api/conversation-control.ts';
  export {default as resolver} from './api/resolve-package.ts'; export * from './utils/existingReservation.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'""','process.env.VITE_SUPABASE_ANON_KEY':'""',
    'process.env.SUPABASE_URL':'""','process.env.SUPABASE_ANON_KEY':'""'},
  plugins:[{name:'no-provider',setup(b){
    b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'no-provider',namespace:'test'}));
    b.onLoad({filter:/.*/,namespace:'test'},()=>({loader:'js',contents:'export function createClient(){throw Error("Must not query bookings, catalogue or payments")}'}));
  }}]});
const {control,handleConversation,resolver,existingReservationAnswer,existingReservationContext}=await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const facts={guests:2,check_in:'2026-09-13',check_out:'2026-09-16',extras:[]};
const quote={version:1,id:'synthetic-old-quote',created_at:now,check_in:facts.check_in,check_out:facts.check_out,
  guests:2,extras:[],options:[{name:'Loft',capacity:2,total:900}]};
const initial={version:2,history:[],facts,greeted:true,pending:{quote_id:quote.id,option:'Loft'},
  topic:'package_info',topic_at:now,package_context:{id:'synthetic',name:'Pacote de teste',start_date:'2026-10-09',end_date:'2026-10-12',updated_at:now},
  extra_photo_requests:['BARCO'],awaiting:'guests'};
const phrases=['Me desculpem, esqueci de realizar o pagamento','Eu solicitei uma reserva com vocês',
  'E acabei não fazendo o pagamento','Já solicitei uma reserva e esqueci de pagar. Qual o telefone do hotel?'];
const unsafe='Use o link anterior para pagar. Sua reserva está confirmada e o pagamento foi recebido.';
const input=(user_message,state=initial,operation='prepare')=>({operation,user_message,state,quote_state:quote});
function turn(user_message,state=initial,proposed='QUOTE|2026-09-13|2026-09-16|2|NONE'){
  const p=control(input(user_message,state),now);
  const r=control({...input(user_message,p.state,'route'),ai_response:unsafe,proposed},now);
  return {p,r,state:JSON.parse(r.state)};
}
async function resolve(user_message,state){
  let status,result;
  await resolver({method:'POST',body:{user_message,state},query:{}},
    {status(code){status=code;return this},json(value){result=value;return value}});
  assert.equal(status,200);
  return result;
}
function assertHuman(result){
  assert.equal(result.quote_request,'HUMANO');
  assert.equal(result.can_collect,'NAO');
  assert.equal(result.confirmation_text,'');
  assert.ok((result.conversation_text||result.answer).endsWith(existingReservationAnswer));
  assert.doesNotMatch(result.conversation_text||result.answer,/quantas pessoas|idades|R\$|reserva está confirmada|Use o link|foi recebido/);
}

test('três frases reais anonimizadas interrompem nova cotação e ignoram resposta insegura',()=>{
  for(const message of phrases) for(const proposed of ['NOQUOTE','HUMANO','COLETAR','QUOTE|2026-09-13|2026-09-16|2|NONE']){
    const {p,r,state}=turn(message,initial,proposed);
    assertHuman(r);
    const context=JSON.parse(p.context);
    assert.equal(context.solicitacao_reserva_anterior,true);
    assert.equal(context.reserva_localizada,false);
    assert.equal(context.cotacao_valida_para_estes_dados,null);
    assert.deepEqual(state.facts,facts);
    for(const key of ['pending','package_context','topic','awaiting','extra_photo_requests']) assert.equal(state[key],undefined,key);
    assert.deepEqual(state.existing_reservation,{at:now});
  }
});

test('sequência de hoje, com ou sem histórico antigo, mantém solicitação anterior no humano',()=>{
  for(const withHistory of [false,true]){
    let state=withHistory?{...initial,history:['Quero fechar a hospedagem de 13 a 16/09'],
      turns:[{role:'user',text:'Quero fechar a hospedagem de 13 a 16/09'},
        {role:'assistant',text:'O pagamento deveria ocorrer em até 48h.'}]}:undefined;
    for(const message of ['Bom dia!',...phrases]){
      const result=turn(message,state);
      state=result.r.state;
      if(message!=='Bom dia!')assertHuman(result.r);
    }
  }
  assertHuman(turn(phrases.join('. ')).r);
});

test('route e confirm diretos não consomem uma escolha antiga nem autorizam coleta',()=>{
  for(const operation of ['route','confirm']) for(const message of phrases){
    const result=control({...input(message,initial,operation),proposed:'COLETAR',ai_response:unsafe},now);
    assertHuman(result);
    assert.equal(JSON.parse(result.state).pending,undefined);
  }
  const existing=JSON.parse(turn(phrases[1]).r.state);
  existing.pending={quote_id:quote.id,option:'Loft'};
  for(const message of ['', 'Confirmar opção']){
    const result=control({...input(message,existing,'confirm')},now);
    assertHuman(result);
  }
});

test('resposta final preserva HUMANO, inclusive em chamada direta, sem banco/configuração',async()=>{
  for(const message of phrases){
    for(const state of [undefined,initial,turn(message).r.state]){
      const result=await resolve(message,state);
      assertHuman(result);
      assert.equal(result.match_type,'existing_reservation');
      assert.equal(result.availability_checked,false);
    }
  }
});

test('áudio com transcrição fixture mantém a intenção e a proteção até o resolvedor',async()=>{
  for(const transcript of phrases){
    const user_message='https://media.example.test/voice.ogg?signature=synthetic-private';
    const p=await handleConversation(input(user_message), '',async()=>transcript,now);
    const r=control({...input(user_message,p.state,'route'),proposed:'COLETAR',ai_response:unsafe},now);
    assertHuman(r);
    const result=await resolve(user_message,r.state);
    assertHuman(result);
    assert.equal(result.match_type,'existing_reservation');
    assert.doesNotMatch(p.context+r.state,/signature|media\.example/);
  }
});

test('dados pessoais e link da fala não são persistidos nem usados como fatos de hospedagem',()=>{
  const message='Eu solicitei uma reserva com vocês. Meu nome é Pessoa Exemplo, CPF 12345678901. Email teste@example.com. Link https://payment.example.test/secret-123. Entrada 20/09.';
  const {p,r,state}=turn(message);
  assertHuman(r);
  assert.deepEqual(state.facts,facts);
  assert.equal(state.history.at(-1),existingReservationContext);
  assert.doesNotMatch(p.state+p.context+r.state,/12345678901|Pessoa Exemplo|teste@example|secret-123|20\/09/);
});

test('continuidade operacional depende de contexto recente, não apenas de histórico ou resposta da IA',()=>{
  const first=turn(phrases[1]);
  for(const message of ['Ainda não paguei','E agora?','O link expirou']) assertHuman(turn(message,first.r.state).r);
  const expired=control(input('E agora?',first.r.state),now+31*60000);
  assert.equal(JSON.parse(expired.state).existing_reservation,undefined);
  assert.notEqual(JSON.parse(expired.context).solicitacao_reserva_anterior,true);
  for(const at of [now+1000,0,'hoje',now-31*60000]){
    const p=control(input('E agora?',{...initial,existing_reservation:{at}}),now);
    assert.equal(JSON.parse(p.state).existing_reservation,undefined);
  }
  const remembered=control({operation:'remember_response',state:initial,response_text:existingReservationAnswer},now);
  assert.equal(JSON.parse(remembered.state).existing_reservation,undefined);
});

test('passos internos não renovam validade nem reabrem pacote, perguntas ou consentimento',()=>{
  const first=turn(phrases[1]);
  const internal=control({...input(phrases[1],first.r.state,'route')},now+60000);
  assert.equal(JSON.parse(internal.state).existing_reservation.at,now);
  const response=control({operation:'remember_response',state:internal.state,
    response_text:'Para quantas pessoas será a hospedagem?',package_context:initial.package_context,
    extra_photo_requests:['BARCO']},now+120000);
  const state=JSON.parse(response.state);
  assert.equal(state.existing_reservation.at,now);
  for(const key of ['pending','awaiting','package_context','topic','extra_photo_requests']) assert.equal(state[key],undefined,key);
  assert.deepEqual(state.facts,facts);
});

test('novo assunto e FAQ saem da pendência sem encaminhamento repetido',()=>{
  const first=turn(phrases[1]);
  for(const message of ['Qual o cardápio do Reserva Solar?','Qual o horário de check-in?',
    'Minha reserva inclui café?','Aceitam Pix?','Quero uma nova hospedagem para duas pessoas',
    'Tenho uma reserva, vocês têm berço?','Já fiz uma reserva, posso levar meu cachorro?',
    'Fiz uma reserva, qual o endereço do hotel?','Tenho uma reserva, pode me enviar fotos do quarto?',
    'Tenho uma reserva, como funciona o passeio de barco?']){
    const p=control(input(message,first.r.state),now);
    const r=control({...input(message,p.state,'route'),proposed:'NOQUOTE',ai_response:'Resposta informativa.'},now);
    assert.equal(JSON.parse(p.state).existing_reservation,undefined,message);
    assert.notEqual(r.quote_request,'HUMANO',message);
  }
});

test('pagamento já efetuado, anexos, telefone e manutenção preservam suas prioridades',()=>{
  const first=turn(phrases[1]);
  for(const [message,expected] of [['Já fiz o pagamento','Somente a equipe pode confirmar o recebimento'],
    ['Preciso de limpeza no meu quarto','Vou chamar a recepção para ajudar'],
    ['Qual o telefone do hotel?','Hotel Solar']]){
    const result=turn(message,first.r.state).r;
    assert.ok(result.answer.includes(expected),message);
    assert.equal(JSON.parse(result.state).existing_reservation,undefined,message);
  }
  const attachment=control(input('https://media.example.test/comprovante.pdf',first.r.state,'route'),now);
  assert.equal(JSON.parse(attachment.state).existing_reservation,undefined);
  assert.notEqual(attachment.quote_request,'QUOTE');
});

test.after(()=>{Date.now=realNow;});
