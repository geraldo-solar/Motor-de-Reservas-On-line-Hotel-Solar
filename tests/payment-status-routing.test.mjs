import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundled = await build({
  stdin: { contents: "export {control,handleConversation} from './api/conversation-control.ts'; export * from './utils/paymentStatus.ts';", resolveDir:process.cwd() },
  bundle:true, write:false, platform:'node', format:'esm',
});
const {control,handleConversation,paymentStatusInquiry,paymentStatusContext,paymentStatusAnswer} = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const now=Date.parse('2026-09-11T16:00:00Z');
const facts={guests:3,check_in:'2026-10-09',check_out:'2026-10-12',extras:[],children_pending:true};
const previous={version:2,history:[],facts,greeted:true,topic:'package_info',topic_at:now,
  family_party:{adults:2,children:1,total:3,ages_months:[],updated_at:now},
  package_context:{id:'criancas',name:'Dia das Crianças',start_date:'2026-10-09',end_date:'2026-10-12',updated_at:now},
  pending:{quote_id:'old',option:'Loft'}};
const unsafe='Seu pagamento está confirmado e sua reserva foi quitada.';
const messages=['Já fiz o pagamento','Vocês receberam meu pagamento?','Paguei minha reserva via Pix',
  'Já paguei','Efetuei o depósito','Enviei o comprovante','O Pix já caiu?',
  'Minha reserva está quitada?','Podem verificar meu pagamento?','O pagamento já foi efetuado',
  'Quanto falta pagar?','Paguei ontem','Já paguei no cartão','Pix enviado','Pagamento efetuado',
  'Vocês confirmaram meu pagamento?','Meu marido já pagou a reserva','Acabei de pagar'];
function turn(user_message,state=previous) {
  const prepared=control({operation:'prepare',user_message,state},now);
  const routed=control({operation:'route',user_message,state:prepared.state,proposed:'COLETAR',ai_response:unsafe},now);
  return {prepared,routed,state:JSON.parse(routed.state)};
}

test('relato e verificação de pagamento têm prioridade sobre pacote, idades e proposta insegura',()=>{
  for(const message of messages) {
    assert.equal(paymentStatusInquiry(message),true,message);
    const {prepared,routed,state}=turn(message);
    assert.equal(routed.quote_request,'HUMANO',message);
    assert.equal(routed.can_collect,'NAO',message);
    assert.equal(routed.confirmation_text,'',message);
    assert.match(routed.answer,/Somente a equipe pode confirmar o recebimento/);
    assert.doesNotMatch(routed.answer,/Seu pagamento está confirmado|reserva foi quitada|idades|opções do pacote/);
    assert.equal(JSON.parse(prepared.context).solicitacao_conferencia_pagamento,true);
    assert.equal(state.pending,undefined);assert.equal(state.package_context,undefined);
    assert.deepEqual(state.facts,facts);
    assert.deepEqual(state.family_party,previous.family_party);
  }
});

test('política, intenção futura, hipóteses, negativas e compras alheias não afirmam pagamento feito',()=>{
  for(const message of ['Como posso pagar?','Aceitam Pix?','Qual o parcelamento da reserva?',
    'Quero pagar minha reserva','Vou pagar amanhã','Ainda não paguei','Não fiz o pagamento',
    'Se eu fizer o pagamento, recebo confirmação?','Quando eu pagar, como recebo o comprovante?',
    'Quanto tempo demora para confirmar o Pix?','Paguei o táxi','Já paguei o almoço no outro restaurante',
    'Preciso pagar o sinal para confirmar minha reserva?', 'Minha reserva pode ser paga via Pix?',
    'Minha reserva será paga amanhã', 'Vou fazer o Pix amanhã para confirmar a reserva',
    'Já fiz minha reserva, como faço o pagamento?', 'Não enviei o comprovante ainda',
    'O sinal da internet caiu no meu quarto', 'Paguei o táxi por Pix',
    'Minha reserva é paga em quantas parcelas?', 'Se eu tiver pago, como recebo o comprovante?',
    'Como é feito o pagamento?', 'O pagamento é feito no check-in?',
    'Minha reserva é paga antecipadamente?', 'O Pix é enviado para qual chave?',
    'Comprovante a ser enviado', 'O pagamento será efetuado amanhã',
    'O Pix deve ser realizado amanhã', 'O comprovante pode ser enviado depois?',
    'Como o pagamento é confirmado?',
    'Minha reserva inclui café?','Qual é o horário do checkout?']) {
    assert.equal(paymentStatusInquiry(message),false,message);
  }
});

test('intenção futura, sinal de internet e comprovante não enviado não viram conferência financeira',()=>{
  for(const user_message of ['Minha reserva pode ser paga via Pix?', 'Minha reserva será paga amanhã',
    'Preciso pagar o sinal para confirmar minha reserva?', 'O sinal da internet caiu no meu quarto',
    'Não enviei o comprovante ainda', 'Já fiz minha reserva, como faço o pagamento?']) {
    const prepared=control({operation:'prepare',user_message,state:previous},now);
    assert.notEqual(JSON.parse(prepared.context).solicitacao_conferencia_pagamento,true,user_message);
    assert.notEqual(JSON.parse(prepared.state).resolved_message,paymentStatusContext,user_message);
  }
});

test('relato efetivo permanece financeiro quando a mesma mensagem também menciona futuro ou política',()=>{
  for(const message of ['Já paguei o sinal e vou pagar o saldo amanhã',
    'Já fiz o pagamento, quanto tempo demora para confirmar?',
    'Ainda não paguei o saldo, mas paguei o sinal']) assert.equal(paymentStatusInquiry(message),true,message);
});

test('contexto retém somente solicitação de conferência, sem dados do pagamento ou nova estadia',()=>{
  const {prepared,state}=turn('Paguei minha reserva R$900 em 15/09. Meu CPF é 12345678901');
  assert.equal(state.history.at(-1),paymentStatusContext);
  assert.doesNotMatch(prepared.context,/900|12345678901|15\/09/);
  assert.deepEqual(state.facts,facts);
  const confirmed=control({operation:'confirm',user_message:'Já paguei',state:previous,ai_response:unsafe},now);
  assert.equal(confirmed.can_collect,'NAO');assert.equal(confirmed.quote_request,'HUMANO');
});

test('continuação curta pede conferência, mas novo assunto não fica preso no financeiro',()=>{
  const paid=turn('Já fiz o pagamento');
  const followup=turn('E já caiu?',paid.state);
  assert.equal(followup.routed.quote_request,'HUMANO');
  assert.equal(paymentStatusInquiry('E já caiu?'),false);
  const prepared=control({operation:'prepare',user_message:'Qual o cardápio do Reserva Solar?',state:paid.state},now);
  const routed=control({operation:'route',user_message:'Qual o cardápio do Reserva Solar?',state:prepared.state,
    proposed:'NOQUOTE',ai_response:'Confira o cardápio do Reserva Solar.'},now);
  assert.equal(routed.quote_request,'NOQUOTE');assert.match(routed.answer,/cardápio/);
});

test('áudio transcrito segue a mesma proteção sem provedor ou confirmação financeira',async()=>{
  for(const transcript of ['Já fiz o pagamento','Já paguei no cartão']) {
    const user_message='https://example.invalid/synthetic-payment.ogg';
    const prepared=await handleConversation({operation:'prepare',user_message,state:previous},'',async()=>transcript,now);
    const routed=control({operation:'route',user_message,state:prepared.state,proposed:'COLETAR',ai_response:unsafe},now);
    assert.equal(routed.quote_request,'HUMANO');assert.match(routed.answer,/Somente a equipe/);
    assert.deepEqual(JSON.parse(routed.state).facts,facts);
  }
});

test('resolvedor direto e prepare→route→resolver mantêm HUMANO sem consultar catálogo ou executar envio',async()=>{
  const bundle=await build({entryPoints:['api/resolve-package.ts'],bundle:true,write:false,platform:'node',format:'esm',
    plugins:[{name:'no-catalog',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'no-catalog',namespace:'test'}));
      b.onLoad({filter:/.*/,namespace:'test'},()=>({loader:'js',contents:'export function createClient(){throw new Error("Payment must not query a provider")}' }));}}],
  });
  const resolver=(await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)).default;
  for(const message of messages) for(const state of [undefined,turn(message).routed.state]) {
    let status,result;
    await resolver({method:'POST',body:{user_message:message,state},query:{}},
      {status(code){status=code;return this},json(body){result=body;return body}});
    assert.equal(status,200);assert.equal(result.quote_request,'HUMANO');
    assert.equal(result.match_type,'payment_verification');assert.equal(result.can_collect,'NAO');
    assert.ok(result.conversation_text.endsWith(paymentStatusAnswer));
    assert.equal(result.availability_checked,false);
  }
});
