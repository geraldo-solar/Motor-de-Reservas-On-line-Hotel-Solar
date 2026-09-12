import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
const b=await build({entryPoints:['utils/existingReservation.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {existingReservationInquiry:inquiry,existingReservationContext:context,existingReservationAnswer:answer}=
  await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));

test('relatos exatos de solicitação anterior e pagamento esquecido não dependem da memória',()=>{
  for(const message of ['Eu solicitei uma reserva com vocês','Me desculpem, esqueci de realizar o pagamento',
    'E acabei não fazendo o pagamento','Já fiz uma reserva','Tenho uma reserva',
    'Fiz minha reserva, mas esqueci de pagar','Solicitamos uma reserva de hospedagem',
    'Quero conferir minha reserva','Minha reserva está confirmada?',
    'Me desculpem, esqueci de realizar o pagamento. Eu solicitei uma reserva com vocês. E acabei não fazendo o pagamento']) {
    assert.equal(inquiry(message),true,message);assert.equal(inquiry(message,true),true,message);
  }
});

test('prazo ou link explicitamente financeiro perdido pede conferência, não afirma status',()=>{
  for(const message of ['Perdi o prazo de pagamento','O prazo para pagar venceu','Meu link de pagamento expirou',
    'O boleto está vencido','Esquecemos de efetuar o sinal','Acabamos sem pagar','Esqueci de pagar, aceitam Pix?']) {
    assert.equal(inquiry(message),true,message);
  }
  assert.equal(inquiry(context),true);
  assert.equal(answer,'Vou chamar a recepção para localizar sua solicitação, conferir a situação e orientar como prosseguir.');
  assert.doesNotMatch(answer,/reserva (?:confirmada|ativa|encontrada)|pagamento pendente|pagamento recebido|quitad|cancelei|link|https?:|\d/);
});

test('continuações operacionais curtas só usam contexto explicitamente fornecido pelo chamador',()=>{
  for(const message of ['Ainda não paguei','Eu ainda não paguei','Link expirou','O meu link expirou',
    'E agora?','Como posso prosseguir?','Qual o próximo passo?','Posso pagar agora?',
    'Posso usar o mesmo link?','Ainda consigo pagar?','O prazo passou','Perdi o prazo']) {
    assert.equal(inquiry(message),false,message);assert.equal(inquiry(message,true),true,message);
  }
  for(const message of ['Sim','Bom dia','2','Recebi a mensagem','É mesmo valor?','Qual o Pix?','Qual o prazo?'])
    assert.equal(inquiry(message,true),false,message);
});

test('reservas novas, hipóteses e negações não representam solicitação anterior',()=>{
  for(const message of ['Quero fazer uma reserva','Gostaria de solicitar uma reserva','Vou fazer uma reserva',
    'Quero uma nova reserva','Gostaria de reservar um quarto','Pretendo reservar',
    'Não tenho reserva','Não fiz uma reserva','Nunca solicitei uma reserva',
    'Não esqueci de pagar','Nunca perdi o prazo de pagamento',
    'Se eu tiver uma reserva e esquecer de pagar?','Caso eu esqueça de realizar o pagamento, o que acontece?',
    'Quando eu fizer uma reserva, como pago?','Por exemplo, eu fiz uma reserva e esqueci de pagar']) {
    assert.equal(inquiry(message),false,message);assert.equal(inquiry(message,true),false,message);
  }
});

test('FAQ continua informativa mesmo se mencionar reserva ou existir contexto recente',()=>{
  for(const message of ['Tenho uma reserva, qual é o horário do check-in?','Já fiz uma reserva, o café está incluso?',
    'Tenho reserva, aceitam Pix?','Quais as formas de pagamento?','Posso pagar em Pix?',
    'Tenho uma reserva, posso parcelar?','Qual é o valor da hospedagem?','Quanto custa o quarto?',
    'Que horas posso entrar?','Qual a senha do Wi-Fi?','Tem piscina?','Vocês aceitam pets?',
    'Minha reserva inclui estacionamento?','Qual é o preço?']) {
    assert.equal(inquiry(message),false,message);assert.equal(inquiry(message,true),false,message);
  }
});

test('menção incidental à reserva não transfere fotos, estrutura, pets, endereço ou passeios',()=>{
  for(const message of ['Tenho uma reserva, pode me enviar fotos do quarto?',
    'Já fiz uma reserva, posso levar meu cachorro?','Tenho uma reserva, vocês têm berço?',
    'Fiz uma reserva, qual o endereço do hotel?','Tenho uma reserva, onde fica o hotel?',
    'Tenho uma reserva, me envia a localização do hotel?',
    'Tenho uma reserva, como funciona o passeio de barco?',
    'Já fiz uma reserva, vocês têm passeio de quadriciclo?',
    'Tenho uma reserva, quero ver imagens do Loft','Tenho uma reserva, pode mandar um vídeo do quarto?']) {
    assert.equal(inquiry(message),false,message);assert.equal(inquiry(message,true),false,message);
  }
});

test('pedido efetivo de conferência e pagamento esquecido têm prioridade sobre informação incidental',()=>{
  for(const message of ['Esqueci de realizar o pagamento, pode mandar fotos do quarto?',
    'Tenho uma reserva, esqueci de pagar e gostaria de fotos',
    'Minha reserva está confirmada? Também queria fotos do quarto',
    'Pode localizar minha reserva? Quero depois o endereço do hotel',
    'Quero conferir minha reserva e saber se tem berço',
    'Qual o status da minha reserva?','Preciso da localização da minha reserva no sistema']) {
    assert.equal(inquiry(message),true,message);assert.equal(inquiry(message,true),true,message);
  }
});

test('restaurante, mesas, eventos e compras externas não viram hospedagem existente',()=>{
  for(const message of ['Eu solicitei uma reserva no Reserva Solar','Fiz uma reserva de mesa',
    'Quero uma reserva para jantar','Solicitei uma reserva para um evento',
    'Esqueci de pagar o supermercado','Esqueci de realizar o pagamento do outro hotel',
    'Tenho uma reserva no restaurante, o link expirou','Quero orçamento de casamento']) {
    assert.equal(inquiry(message),false,message);assert.equal(inquiry(message,true),false,message);
  }
});

test('relato de pagamento feito permanece responsabilidade do classificador financeiro existente',()=>{
  for(const message of ['Já paguei','Fiz o pagamento','Efetuei o Pix','Receberam o pagamento?',
    'Meu pagamento está confirmado?','Quanto falta pagar?']) {
    assert.equal(inquiry(message),false,message);assert.equal(inquiry(message,true),false,message);
  }
});
