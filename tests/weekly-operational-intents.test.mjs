import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

const built=await build({stdin:{contents:`
  export {existingReservationInquiry} from './utils/existingReservation.ts';
  export {reservationModificationInquiry} from './utils/reservationModification.ts';
  export {paymentSupportInquiry,paymentSupportTopic,paymentSupportContext,paymentSupportAnswer} from './utils/paymentSupport.ts';
  export {roomAlternativeComparison,multiRoomRequest} from './utils/lodgingScope.ts';
  export {explicitHumanRequest} from './utils/humanIntent.ts';
`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {existingReservationInquiry:existing,reservationModificationInquiry:modification,
  paymentSupportInquiry:payment,paymentSupportTopic:topic,paymentSupportContext,paymentSupportAnswer,
  roomAlternativeComparison:comparison,multiRoomRequest:multi,explicitHumanRequest:human}=await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

test('W12 literais: retomar, realizar upgrade e conferir diferença são operações, não cotação nova',()=>{
  for(const message of [
    'Gostaria de retomar a conversa e finalizar o upgrade',
    'Gostaria de fazer um upgrade no quarto',
    'Vou querer o triplo com sacada. Vc poderia verificar o valor que eu tenho que pagar de diferença, por favor?',
    'Quero trocar o quarto para um Loft',
    'Não quero falar com atendente, mas preciso fazer um upgrade no quarto',
    'Não quero mais upgrade. Mas agora quero fazer um upgrade no quarto',
  ]) {assert.equal(modification(message),true,message);assert.equal(existing(message),true,message);}
  assert.equal(modification('Pode verificar a diferença desse upgrade?',true),true);
});

test('alterações: FAQ, hipótese, comparação de preço e pedidos retirados não são operações',()=>{
  for(const message of [
    'Como funciona o upgrade?', 'Quanto custa um upgrade?', 'É possível fazer upgrade?',
    'Gostaria de saber como fazer upgrade no quarto', 'Se eu quiser um upgrade, como funciona?',
    'Qual a diferença entre o triplo e o Loft?', 'Pode comparar a diferença de preço entre as categorias?',
    'Não quero fazer upgrade no quarto', 'Não preciso alterar meu quarto', 'Desisti do upgrade',
    'Quero fazer upgrade no voo', 'Quero fazer upgrade do passeio de barco',
  ]) {assert.equal(modification(message,true),false,message);}
});

test('reserva existente mantém datas operacionais e como prosseguir somente no contexto vivo',()=>{
  for(const message of ['Dia 16-18/10','16/10 a 18/10','Dia 16','Para amanhã','sexta-feira','Como posso prosseguir?']) {
    assert.equal(existing(message),false,message);assert.equal(existing(message,true),true,message);
  }
  assert.equal(existing('Minha reserva está no nome de [titular omitido]'),true);
  for(const message of ['2','Sim','Qual horário do check-in?','Tenho uma reserva, pode enviar o cardápio?',
    'Quero uma nova reserva','Posso pagar em Pix?','Quero o contato da LocMil']) assert.equal(existing(message,true),false,message);
});

test('W13: link curto exige assunto financeiro; link parcelado e falha de acesso explícitos são operações',()=>{
  for(const message of ['Ok. Mande o link','Mande o.link','Pode reenviar o link?']) {
    assert.equal(payment(message),false,message);assert.equal(payment(message,true),true,message);
  }
  for(const message of [
    'Mande o link de pagamento',
    'No site o hotel parcela de 6x. Veja link parcelado',
    'Os códigos enviados ao meu e-mail, não abrem. Só abriu como convidado e não permite parcelar',
    'Não consigo abrir o link de pagamento',
    'O link não permite parcelar',
    'Não quero falar com atendente, mas preciso do link de pagamento',
  ]) assert.equal(payment(message),true,message);
  assert.equal(payment('Os códigos do e-mail não abrem',true),true);
  assert.equal(payment('Os códigos do e-mail não abrem'),false);
  for(const message of ['Prefiro pagar logo no pix','Pode ser?','E já deixar tudo certo','Vou tentar mais uma vez']) {
    assert.equal(payment(message,true),true,message);assert.equal(payment(message),false,message);
  }
});

test('pagamento: assuntos de terceiros, cardápio, documento e FAQ não são pedidos operacionais',()=>{
  for(const message of [
    'O pagamento pode ser no cartão de crédito de 6x, como no site?',
    'Como funciona o parcelamento?', 'Como faço para pedir o link de pagamento?',
    'Posso pagar em Pix?', 'Não mande o link de pagamento', 'Não quero o link de pagamento',
    'Se eu precisar do link de pagamento, como solicito?',
    'Mande o link do cardápio', 'Mande o.link do menu', 'Preciso do link do documento',
    'Envie o link da LocMil', 'Quero o contato da LocMil', 'Mande o link do guia',
    'O link do outro hotel não permite parcelar', 'Não consigo abrir o cardápio',
    'Posso pagar o café no cartão?', 'Mande o link para pagar o café avulso',
    'O link do restaurante não permite parcelar', 'Mande link do ingresso',
    'Posso pagar o couvert no cartão?',
  ]) assert.equal(payment(message,true),false,message);
  assert.equal(topic('O pagamento pode ser no cartão de crédito de 6x, como no site?'),true);
  assert.equal(topic('Como funciona o pagamento?'),true);
  assert.equal(topic('Mande o link do cardápio'),false);
  assert.equal(topic('Como posso pagar o passeio da LocMil?'),false);
  for(const message of ['Posso pagar o café no cartão?','Como pagar o almoço?','Mande o link do ingresso',
    'O link do Reserva Solar não permite parcelar']) assert.equal(topic(message),false,message);
  assert.equal(topic('Posso pagar minha hospedagem com café da manhã no cartão?'),true);
  assert.equal(payment(paymentSupportContext),true);
  assert.match(paymentSupportAnswer,/Não envie senhas, códigos de acesso nem dados do cartão/);
  assert.doesNotMatch(paymentSupportAnswer,/https?:|[36]x|chave pix|pagamento confirmado|cobrança emitida/i);
});

test('W18: compara alternativas de quartos sem dizer que dois apartamentos foram escolhidos',()=>{
  for(const message of [
    'Qual valor para quarto duplo solteiro ou dois quartos solteiros para entrar hoje e sair segunda?',
    'Um duplo ou dois individuais', 'Um quarto duplo ou dois quartos individuais',
    'Qual o valor de 2 quartos solteiros ou um quarto duplo?',
  ]) {assert.equal(comparison(message),true,message);assert.equal(multi(message),false,message);}
  for(const message of [
    'Quero um quarto duplo com duas camas individuais',
    'Duas camas de solteiro ou uma cama de casal', 'Quero dois quartos duplos',
    'Não quero um duplo ou dois individuais', 'Mande fotos de um duplo ou dois individuais',
  ]) assert.equal(comparison(message),false,message);
  assert.equal(multi('Quero dois quartos duplos'),true);
  assert.equal(multi('Quero um quarto duplo com duas camas individuais'),false);
});

test('pedido de humano e texto do botão são explícitos; negações e link de terceiro continuam seguros',()=>{
  for(const message of ['Quero falar com alguém','Quero falar com a recepção','Falar com a recepção',
    'Não consigo falar com atendente','Não quero IA, quero atendente']) assert.equal(human(message),true,message);
  for(const message of ['Não quero falar com alguém, só saber o horário da piscina',
    'Não quero falar com a recepção', 'Não me transfira para atendente',
    'Quero o contato da LocMil','Quero duas camas individuais']) assert.equal(human(message),false,message);
});
