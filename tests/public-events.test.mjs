import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
const bundled = await build({entryPoints:['utils/publicEvents.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {isPrivateEventRequest,publicEventInquiry,publicEventFollowup,publicEventContext,publicEventAnswer} = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const at = value => Date.parse(value);

test('reconhece programação pública sem desviar pedido privado', () => {
  for (const message of ['Que horas Heraldo Ramos toca?', 'Tem música ao vivo no Reserva Solar?', 'Qual show vai ter?', 'Apresentação musical', 'Qual a programação do restaurante?', 'Qual evento tem hoje?', 'Evento amanhã no Reserva Solar', 'Quem toca hoje?', 'Tem música hoje?', 'Tem música no Reserva Solar?', 'Qual a atração de amanhã?', 'Quero reservar um quarto e saber se tem música ao vivo']) assert.equal(publicEventInquiry(message), true, message);
  for (const message of ['Quero contratar Heraldo para meu aniversário', 'Orçamento para organizar um show particular', 'Quero fazer minha festa com música ao vivo', 'Quero realizar um evento empresarial', 'Contratar o músico Heraldo', 'Quero um aniversário para 50 pessoas']) {
    assert.equal(isPrivateEventRequest(message), true, message);
    assert.equal(publicEventInquiry(message), false, message);
  }
  for (const message of ['Quero reservar o Loft', 'Qual o cardápio?', 'Pacote de Réveillon', 'Quanto custa o barco?', 'Quais as atrações do passeio de barco hoje?', 'Quero comemorar meu aniversário a dois']) assert.equal(publicEventInquiry(message),false,message);
  assert.equal(isPrivateEventRequest('Quero comemorar meu aniversário a dois'), false);
  assert.equal(isPrivateEventRequest('Quero comemorar meu aniversário a dois com música ao vivo'), false);
  assert.equal(isPrivateEventRequest('Quero um aniversário a dois'), false);
});

test('followups são estritos e não capturam hospedagem ou confirmações genéricas', () => {
  for (const message of ['E amanhã?', 'Hoje?', 'Qual o horário?', 'Quanto custa?', 'E o couvert?', 'Até que horas?', 'Quanto tempo dura?', 'O repertório?', 'E a apresentação?', 'Precisa reservar mesa?', 'Já começou?', '06/09/2026']) assert.equal(publicEventFollowup(message),true,message);
  for (const message of ['sim', 'ok', 'quero reservar quarto', 'E o Loft?', 'amanhã quero uma diária', 'reservar', 'Quanto custa o barco?', 'Quero organizar meu aniversário', 'Para 2 pessoas', 'Qual o cardápio?']) assert.equal(publicEventFollowup(message),false,message);
});

test('programação de outros pacotes não é substituída pela agenda de setembro', () => {
  for (const message of ['Qual show do Réveillon?', 'Qual programação do pacote de Natal no Reserva Solar?', 'Tem música no pacote de Dia das Crianças?', 'Qual a atração do Carnaval no hotel?']) assert.equal(publicEventInquiry(message),false,message);
  const now=at('2026-09-05T16:00:00-03:00');
  for (const message of ['Heraldo vai tocar no Réveillon?', 'Qual show de Heraldo no Natal?', 'Tem Heraldo no pacote de Carnaval?', 'Heraldo estará no Reserva Solar em outubro?']) {
    assert.equal(publicEventInquiry(message),true,message);
    const answer=publicEventAnswer(message,now);
    assert.match(answer,/Não tenho uma apresentação de Heraldo Ramos confirmada para esse período/);
    assert.doesNotMatch(answer,/31\/12|25\/12|Hoje,|Amanhã,|às 17h|às 12h/);
  }
  assert.match(publicEventAnswer('Heraldo vai tocar em 20 de outubro?',now),/Não tenho apresentação confirmada para 20\/10\/2026/);
});

test('contexto mantém inícios absolutos e fronteiras do fuso de Belém', () => {
  const beforeMidnight=publicEventContext(at('2026-09-06T02:59:59Z'));
  assert.equal(beforeMidnight.data_atual,'2026-09-05');
  assert.equal(beforeMidnight.hora_atual,'23:59:59');
  const midnight=publicEventContext(at('2026-09-06T03:00:00Z'));
  assert.equal(midnight.data_atual,'2026-09-06');
  assert.equal(midnight.hora_atual,'00:00:00');
  assert.equal(midnight.fuso_horario,'America/Belem');
  assert.equal(midnight.programacao[0].inicio,'2026-09-05T17:00:00-03:00');
  assert.equal(midnight.programacao[0].situacao_temporal,'data_passada');
  assert.equal(midnight.programacao[1].situacao_temporal,'programado_para_o_futuro');
});

test('hoje e amanhã selecionam somente as datas solicitadas', () => {
  const now=at('2026-09-05T16:00:00-03:00');
  const today=publicEventAnswer('Tem música ao vivo hoje?',now);
  assert.match(today,/Hoje, 05\/09\/2026, às 17h/);
  assert.doesNotMatch(today,/06\/09|12h/);
  const tomorrow=publicEventAnswer('E amanhã?',now);
  assert.match(tomorrow,/Amanhã, 06\/09\/2026, às 12h/);
  assert.doesNotMatch(tomorrow,/05\/09|17h/);
  assert.match(publicEventAnswer('Heraldo Ramos',now),/05\/09[\s\S]*06\/09/);
  assert.doesNotMatch(publicEventAnswer('Dia 6',now),/05\/09/);
  assert.doesNotMatch(publicEventAnswer('6 de setembro de 2026',now),/05\/09/);
  assert.match(publicEventAnswer('06/09/2026',now),/às 12h/);
  assert.match(publicEventAnswer('2026-09-06',now),/às 12h/);
});

test('mensagem real com hj, emoji e quebra de linha seleciona somente hoje', () => {
  const message='Bom dia ☀️ \nTerá alguma programação hj no hotel?';
  const now=at('2026-09-05T12:00:00-03:00');
  for (const variant of [message,message.replace(/\s+/g,' '),message.replace('hj','HJ')]) {
    assert.equal(publicEventInquiry(variant),true);
    assert.equal(isPrivateEventRequest(variant),false);
    const answer=publicEventAnswer(variant,now);
    assert.match(answer,/Hoje, 05\/09\/2026, às 17h/);
    assert.doesNotMatch(answer,/06\/09\/2026|12h|Luiza|encaminhar|pedido autorizado/);
  }
  assert.equal(publicEventFollowup('E hj?'),true);
});

test('horário inicial atingido não garante show em andamento ou encerrado', () => {
  for (const [date,start] of [['2026-09-05','17:00:00'],['2026-09-06','12:00:00']]) {
    const exact=at(`${date}T${start}-03:00`);
    assert.doesNotMatch(publicEventAnswer('hoje',exact-1),/horários já passados/);
    assert.match(publicEventAnswer('hoje',exact),/não tenho confirmação em tempo real/);
    assert.match(publicEventAnswer('hoje',exact+3*3600000),/não tenho confirmação em tempo real/);
    assert.equal(publicEventContext(exact).programacao.find(event=>event.data===date).situacao_temporal,'horario_inicial_atingido_sem_confirmacao_em_tempo_real');
  }
});

test('datas desconhecidas e passadas não são anunciadas como próximas', () => {
  const after=at('2026-09-07T10:00:00-03:00');
  const answer=publicEventAnswer('Tem Heraldo hoje?',after);
  assert.match(answer,/Não tenho apresentação confirmada para 07\/09\/2026/);
  assert.doesNotMatch(answer,/Hoje,|Amanhã,|às 17h|às 12h/);
  const historical=publicEventAnswer('Quando é Heraldo?',after);
  assert.match(historical,/05\/09\/2026/);
  assert.match(historical,/horários já passados/);
  assert.doesNotMatch(historical,/Hoje,|Amanhã,|se apresenta|vai acontecer/);
  assert.match(publicEventAnswer('E depois de amanhã?',at('2026-09-05T16:00:00-03:00')),/07\/09\/2026/);
  assert.match(publicEventAnswer('6 de setembro de 2027',after),/Não tenho apresentação confirmada para 06\/09\/2027/);
});

test('não inventa custos, término, reserva, repertório ou entrega de foto', () => {
  const now=at('2026-09-05T18:00:00-03:00');
  for (const [message,expected] of [['Quanto custa o couvert?',/cobrança.*não foram informados/],['Até que horas?',/término e a duração não foram informados/],['Qual o repertório?',/repertório não foi informado/],['Precisa reservar mesa?',/precisam ser confirmadas/],['Tem foto?',/Não tenho confirmação de uma imagem disponível/]]) {
    const answer=publicEventAnswer(message,now);
    assert.match(answer,expected,message);
    assert.ok(answer.length<=900,`${message}: ${answer.length} chars`);
    assert.doesNotMatch(answer,/R\$|Luiza|CPF|gratis|gratuito|enviei|reservei|reserva confirmada/i);
  }
});
