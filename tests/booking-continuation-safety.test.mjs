import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';

// Written phrases only. No real customer, provider, outbound message or booking.
const now=Date.parse('2026-09-15T12:31:00-03:00'),oldNow=Date.now,oldFetch=globalThis.fetch;
Date.now=()=>now;let calls=0;Reflect.set(globalThis,'fetch',async()=>{calls++;throw Error('Network forbidden');});
after(()=>{Date.now=oldNow;Reflect.set(globalThis,'fetch',oldFetch);assert.equal(calls,0);});
const b=await build({stdin:{contents:`export {control,handleConversation} from './api/conversation-control.ts';
  export {default as resolver} from './api/resolve-package.ts';
  export * from './utils/conversationContinuation.ts';export * from './utils/hotelContact.ts';
  export * from './utils/existingReservation.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'""','process.env.VITE_SUPABASE_ANON_KEY':'""'},
  plugins:[{name:'no-catalog',setup(build){build.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
    build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function createClient(){throw Error("No catalogue or reservations in this path")}'}));}}]});
const {control,handleConversation,resolver,bookingDeferral,bookingDeferralAnswer,hotelCallDifficulty,hotelCallDifficultyAnswer,existingReservationInquiry}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const focus={id:'synthetic-reveillon',name:'Réveillon 2027',start_date:'2026-12-31',end_date:'2027-01-03',updated_at:now};
const facts={check_in:focus.start_date,check_out:focus.end_date,guests:2,extras:[]};
const quote={version:1,id:'old-confirmation',created_at:now,...facts,options:[{name:'Loft',capacity:2,total:1000}]};
const initial={version:2,history:[],facts,greeted:true,assistant_disclosure:{version:1,show:false,rendered:true},
  topic:'package_info',topic_at:now,package_context:focus,pending:{quote_id:quote.id,option:'Loft'},awaiting:'guests'};
async function turn(message,{state=initial,audio=false}={}){
  const input=audio?'https://fixture.invalid/synthetic.ogg':message;
  const body={operation:'prepare',user_message:input,state,quote_state:quote};
  const p=audio?await handleConversation(body,'',async()=>message,now):control(body,now);
  const r=control({operation:'route',user_message:input,state:p.state,quote_state:quote,
    proposed:'COLETAR',ai_response:'Reserva confirmada. Vou te ligar depois do almoço. Pode pagar o valor anterior.'},now);
  let result;await resolver({method:'POST',body:{user_message:input,state:r.state},query:{}},
    {status(code){assert.equal(code,200);return this},json(value){result=value;return value}});
  return {p,r,result,state:JSON.parse(result.state||r.state)};
}

test('adiamento explícito reconhecido sem confundir horários da estadia e hipóteses',()=>{
  for(const s of ['Tá depois do almoço a gente faz isso','Depois eu faço isso','Mais tarde continuamos','Retomo amanhã','Eu fecho depois do almoço'])assert.equal(bookingDeferral(s),true,s);
  for(const s of ['Não, depois do almoço a gente faz isso','Depois do almoço a gente faz check-in','Chego depois do almoço',
    'Depois do almoço tem passeio?','Depois do almoço a gente faz isso?','Se der, depois eu fecho','A cliente disse que volta amanhã','Quero fechar agora'])assert.equal(bookingDeferral(s),false,s);
});

test('dificuldade de ligação não significa ligar equipamento, hipótese ou telefone de terceiros',()=>{
  for(const s of ['Não to conseguindo ligar','Não consigo falar por telefone','Tentei ligar, ninguém atende','Tentei telefonar sem sucesso'])assert.equal(hotelCallDifficulty(s),true,s);
  for(const s of ['Não consigo ligar o ar condicionado','Não consigo ligar para outro hotel','Não consigo ligar para minha amiga',
    'Não consigo ligar o telefone do quarto','Se não conseguir ligar, o que faço?','Não tentei ligar','Não consigo ligar meu celular'])assert.equal(hotelCallDifficulty(s),false,s);
});

test('texto/áudio de pausa e dificuldade bloqueiam coleta, preservam pacote e não consultam banco',async()=>{
  for(const [message,answer,type] of [['Tá depois do almoço a gente faz isso',bookingDeferralAnswer,'booking_deferral'],
    ['Não to conseguindo ligar',hotelCallDifficultyAnswer,'hotel_call_difficulty']])for(const audio of [false,true]){
    const t=await turn(message,{audio});
    assert.equal(t.r.quote_request,'NOQUOTE');assert.equal(t.r.can_collect,'NAO');assert.ok(t.r.answer.endsWith(answer));
    assert.equal(t.result.match_type,type);assert.equal(t.result.availability_checked,false);assert.equal(t.result.can_collect,'NAO');
    assert.equal(t.state.pending,undefined);assert.equal(t.state.awaiting,undefined);
    assert.deepEqual(t.state.facts,facts);assert.equal(t.state.package_context.id,focus.id);
    assert.doesNotMatch(t.result.conversation_text,/te ligar|entraremos em contato|retornaremos|R\$|confirmada|pode pagar/);
    const remembered=control({operation:'remember_response',state:t.r.state,response_text:'Escolha Loft por R$ 1.000',package_context:{...focus,id:'wrong'}},now);
    assert.equal(JSON.parse(remembered.state).package_context.id,focus.id);
    assert.equal(control({operation:'confirm',state:remembered.state,quote_state:quote},now).can_collect,'NAO');
    const direct=control({operation:'confirm',user_message:message,state:initial,quote_state:quote},now);
    assert.equal(direct.can_collect,'NAO');assert.equal(direct.confirmation_text,'');
  }
});

test('retomar negociação humana exige recepção, não reaplica tabela nem aprova condições relatadas',async()=>{
  for(const message of ['A recepção me passou uma cotação, quero fechar','Quero fechar o valor que combinei com a recepção',
    'Quero fazer uma reserva nas condições negociadas com a recepção',
    'O atendente me informou o preço para 30/12 a 04/01, podemos continuar?',
    'Vamos retomar a proposta informada pela equipe'])for(const audio of [false,true]){
    assert.equal(existingReservationInquiry(message),true,message);
    const t=await turn(message,{audio});
    assert.equal(t.r.quote_request,'HUMANO');assert.equal(t.result.quote_request,'HUMANO');
    assert.equal(t.r.can_collect,'NAO');assert.equal(t.state.pending,undefined);
    assert.match(t.result.conversation_text,/recepção/);assert.match(t.result.conversation_text,/condições já informadas/);
    assert.doesNotMatch(t.result.conversation_text,/R\$|confirmada|pode pagar|31\/12 a 03\/01/);
  }
  for(const s of ['Quero uma nova reserva','Qual o valor do pacote de Réveillon?',
    'Nunca combinei valor com a recepção','Se eu fizer uma reserva, posso negociar com a recepção?',
    'Não quero retomar a proposta informada pela equipe, quero uma nova reserva.',
    'Se eu aceitar a proposta informada pela equipe, posso pagar no cartão?',
    'A recepção me passou o valor do café. Criança de 6 anos paga?'])assert.equal(existingReservationInquiry(s),false,s);
});

test('falha de telefone com pedido humano explícito continua encaminhando',async()=>{
  const s='Não to conseguindo ligar, quero falar com um atendente';
  const p=control({operation:'prepare',user_message:s,state:initial},now);
  const r=control({operation:'route',user_message:s,state:p.state,proposed:'COLETAR'},now);
  assert.equal(r.quote_request,'HUMANO');assert.equal(r.can_collect,'NAO');
});
