import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

process.env.MANYCHAT_API_KEY = 'public-programming-test-only';
const bundle = await build({entryPoints:['api/conversation-control.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {control} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const eventBundle = await build({entryPoints:['utils/eventInquiry.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {signEvent} = await import(`data:text/javascript;base64,${Buffer.from(eventBundle.outputFiles[0].text).toString('base64')}`);
const now = Date.parse('2026-09-05T11:50:00-03:00');
const initial = {version:2,history:[],facts:{guests:2,check_in:'2026-09-20',check_out:'2026-09-25',extras:[]},greeted:true};
function turn(message, state = initial, time = now) {
  const p = control({operation:'prepare',state,user_message:message},time);
  return {p,r:control({operation:'route',state:p.state,user_message:message,ai_response:'Entrada grátis, fale com Luiza.',proposed:'QUOTE|2026-09-05|2026-09-06|50|NONE'},time)};
}

test('contexto publicado contém fonte e dois horários; programação não altera estadia nem coleta',()=>{
  for (const message of ['Qual evento de hoje no Reserva Solar?', 'Heraldo Ramos dia 05/09 e 06/09 para 50 pessoas', 'Tem música ao vivo hoje e amanhã?']) {
    const {p,r}=turn(message);
    assert.equal(JSON.parse(p.context).programacao_musical_confirmada.fuso_horario,'America/Belem');
    assert.equal(JSON.parse(p.context).programacao_musical_confirmada.programacao.length,2);
    assert.deepEqual(JSON.parse(r.state).facts,initial.facts);
    assert.equal(JSON.parse(r.state).topic,'public_events');
    assert.equal(r.quote_request,'NOQUOTE'); assert.equal(r.can_collect,'NAO');
    assert.match(r.answer,/Heraldo Ramos/);
    assert.doesNotMatch(r.answer,/Luiza|grátis|quantas pessoas|CPF|wa\.me/);
  }
});

test('continua amanhã/couvert/horário com proteção temporal e sai para hospedagem',()=>{
  const first=turn('Qual evento de hoje no Reserva Solar?').r;
  const next=turn('E amanhã?',first.state).r;
  assert.match(next.resolved_message,/Heraldo Ramos/);
  assert.match(next.answer,/06\/09\/2026.*12h/);
  assert.doesNotMatch(next.answer,/05\/09\/2026/);
  const price=turn('Quanto custa?',next.state).r;
  assert.match(price.answer,/não foram informados|não foi informado/);
  assert.doesNotMatch(price.answer,/R\$|grátis|Luiza/);
  const room=turn('Quero uma diária para 3 pessoas',price.state).r;
  assert.equal(JSON.parse(room.state).topic,undefined);
  assert.equal(JSON.parse(room.state).facts.guests,3);
  const expired=turn('E amanhã?',first.state,now+31*60000).r;
  assert.equal(JSON.parse(expired.state).topic,undefined);
  assert.doesNotMatch(expired.answer,/Heraldo Ramos/);
});

test('não repete saudação; humano e organização privada mantêm prioridade',()=>{
  const p=control({operation:'prepare',user_message:'Tem música ao vivo hoje?'},now);
  const first=control({operation:'route',state:p.state,user_message:'Tem música ao vivo hoje?'},now);
  assert.match(first.answer,/^Olá!/);
  const next=turn('E amanhã?',first.state).r;
  assert.doesNotMatch(next.answer,/^Olá/);
  assert.equal(turn('Quero falar com a recepção sobre o Heraldo',next.state).r.quote_request,'HUMANO');
  const privateEvent=turn('Quero contratar Heraldo para meu aniversário',next.state).r;
  assert.match(privateEvent.answer,/Luiza/);
  assert.doesNotMatch(privateEvent.answer,/programação informada/);
});

test('pergunta pública não avança lead privado nem converte próximo sim em consentimento',()=>{
  const time=Date.now();
  const p=control({operation:'prepare',subscriber_id:'1713487706',state:initial,user_message:'Quero organizar aniversário para 50 pessoas'},time);
  const old=JSON.parse(p.state).event;
  assert.ok(old);
  const pub=turn('Qual o evento de hoje no Reserva Solar?',p.state,time).r;
  assert.deepEqual(JSON.parse(pub.state).event,old);
  assert.doesNotMatch(pub.answer,/Luiza|data desejada/);
  const after=turn('sim',pub.state,time+1000).r;
  assert.equal(JSON.parse(after.state).event,undefined);
  assert.equal(after.can_collect,'NAO');
});

test('pergunta pública com dados pessoais não persiste o texto no estado',()=>{
  const {p,r}=turn('Heraldo hoje? Meu nome é Fulano CPF 12345678900 email teste@example.com');
  for (const value of [p.state,p.context,r.state]) assert.doesNotMatch(value,/12345678900|teste@example.com|Fulano/);
  assert.equal(r.can_collect,'NAO');
});

test('reprodução hj com newline e evento ready antigo não encaminha pedido privado',()=>{
  const created=Date.now();
  const ready=signEvent({id:'00000000-0000-4000-8000-000000000001',source:'1713487706',created,stage:7,status:'ready',fields:{tipo:'Aniversário de teste'},last:'autorizo',answer:'Vou encaminhar o pedido autorizado e conferir o envio.',consent_at:created});
  const message='Bom dia ☀️ \nTerá alguma programação hj no hotel?';
  const state={...initial,event:ready};
  const p=control({operation:'prepare',subscriber_id:'1713487706',state,user_message:message},now);
  assert.deepEqual(JSON.parse(p.state).event,ready);
  assert.equal(JSON.parse(p.state).topic,'public_events');
  assert.deepEqual(JSON.parse(p.state).facts,initial.facts);
  for (const variant of [message,message.replace(/\s+/g,' ')]) {
    const r=control({operation:'route',state:p.state,user_message:variant,ai_response:ready.answer,proposed:'HUMANO'},now);
    assert.equal(r.quote_request,'NOQUOTE');
    assert.equal(r.can_collect,'NAO');
    assert.match(r.answer,/Hoje, 05\/09\/2026, às 17h/);
    assert.doesNotMatch(r.answer,/06\/09\/2026|Luiza|encaminhar|pedido autorizado/);
    assert.deepEqual(JSON.parse(r.state).event,ready);
  }
});
