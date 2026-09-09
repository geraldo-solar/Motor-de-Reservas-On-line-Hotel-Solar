import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const bundle = await build({entryPoints:['api/conversation-control.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {control} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const now = Date.parse('2026-08-12T15:00:00Z');

test('alteração de reserva existente vai à recepção sem mudar datas nem refazer orçamento', () => {
  for (const message of [
    'Ainda conseguimos reagendar p outra data?',
    'Quero alterar minha reserva para 20/09 e 22/09 para 4 pessoas',
    'Podemos trocar a data da minha reserva?',
    'Preciso remarcar minha reserva',
  ]) {
    const prior = control({operation:'prepare',user_message:'Hospedagem para 2 pessoas de 15/08 a 17/08'},now);
    const before = JSON.parse(prior.state).facts;
    const prepared = control({operation:'prepare',user_message:message,state:prior.state},now);
    const routed = control({operation:'route',user_message:message,state:prepared.state,proposed:'QUOTE|2026-09-20|2026-09-22|4|NONE'},now);
    assert.equal(routed.quote_request,'HUMANO',message);
    assert.equal(routed.can_collect,'NAO');
    assert.deepEqual(JSON.parse(routed.state).facts,before,message);
    assert.match(routed.answer,/recepção.*conferir/);
    assert.doesNotMatch(routed.answer,/reserva (?:alterada|confirmada)|pagamento confirmado/);
  }
});

test('desistir de reagendamento ou mudar uma simulação não cria pedido humano', () => {
  for (const message of ['Não vamos reagendar não.', 'Quero mudar as datas da simulação para 20/09 e 22/09', 'Quero uma nova hospedagem para 2 adultos de 20/09 a 22/09']) {
    const prepared = control({operation:'prepare',user_message:message},now);
    const routed = control({operation:'route',user_message:message,state:prepared.state,ai_response:'Entendido.'},now);
    assert.notEqual(routed.quote_request,'HUMANO',message);
  }
});
