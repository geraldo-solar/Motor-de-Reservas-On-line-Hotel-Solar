import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
const b=await build({entryPoints:['api/conversation-control.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {control}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const now=Date.parse('2026-09-12T11:19:00-03:00');
const facts={guests:5,extras:[],check_in:'2026-09-12',check_out:'2026-09-14',children_pending:true};
const initial={version:2,history:[],facts,greeted:true,family_party:{adults:2,children:3,total:5,ages_months:[],updated_at:now}};
function turn(message,state=initial,ai_response='Quais são as idades das crianças?'){
  const p=control({operation:'prepare',user_message:message,state},now);
  const r=control({operation:'route',user_message:message,state:p.state,ai_response,proposed:'QUOTE|2026-09-12|2026-09-14|5|NONE'},now);
  return {p,r};
}
test('o Reserva funcionando hoje é restaurante mesmo com família pendente e resposta errada do modelo',()=>{
  for(const message of ['O Reserva vai funcionar hj?','O Reserva abre hoje?','Qual o horário do Reserva?']){
    const {p,r}=turn(message);
    assert.equal(JSON.parse(p.state).guest_inquiry.kind,'dining');
    assert.equal(r.quote_request,'NOQUOTE');
    assert.deepEqual(JSON.parse(r.state).facts,facts);
    assert.match(r.answer,/Restaurante Reserva Solar/);
    assert.match(r.answer,/10h.*18h/);
    assert.doesNotMatch(r.answer,/idades|quantas pessoas|reserva confirmada|está aberto/);
  }
});
test('cardápio e foto do nome abreviado são resolvidos como restaurante, sem inventar entrega',()=>{
  for(const message of ['Cardápio do Reserva','Tem fotos do Reserva?']){
    const {p,r}=turn(message,initial,'Vou consultar a informação solicitada.');
    assert.match(JSON.parse(p.state).resolved_message,/Reserva Solar/i);
    assert.equal(r.quote_request,'NOQUOTE');
    assert.deepEqual(JSON.parse(r.state).facts,facts);
  }
});
test('minha reserva, nova hospedagem e pagamento não são abreviação do restaurante',()=>{
  const existing=turn('Eu solicitei uma reserva com vocês');
  assert.equal(existing.r.quote_request,'HUMANO');
  const lodging=turn('Quero uma reserva para 2 adultos');
  assert.notEqual(JSON.parse(lodging.p.state).guest_inquiry?.kind,'dining');
  const payment=turn('Já paguei minha reserva');
  assert.equal(payment.r.quote_request,'HUMANO');
});
