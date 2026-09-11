import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
async function load(path) {
  const bundle=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm'});
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
}
const {control,handleConversation}=await load('api/conversation-control.ts');
const {belemClock,dailyGreetingText,withDailyGreeting}=await load('utils/dailyGreeting.ts');
const {photoClarificationQuestion}=await load('utils/photoIntent.ts');
const stamp=s=>Date.parse(`2026-09-${s}-03:00`);
const initial={version:2,history:['Quero informações da viagem'],facts:{guests:2,extras:[]},greeted:true};
function turn(time,state=initial,message='Tem estacionamento?',answer='O assunto continua aqui.') {
  const p=control({operation:'prepare',state,user_message:message},time);
  const r=control({operation:'route',state:p.state,user_message:message,ai_response:answer},time);
  return {p,r};
}
test('horário de Belém e limites de manhã, tarde, noite e meia-noite',()=>{
  for(const [hour,expected] of [['00:00:00','Boa noite'],['04:59:59','Boa noite'],['05:00:00','Bom dia'],['11:59:59','Bom dia'],['12:00:00','Boa tarde'],['17:59:59','Boa tarde'],['18:00:00','Boa noite'],['23:59:59','Boa noite']]) {
    const now=stamp('11T'+hour);
    assert.equal(belemClock(now).day,'2026-09-11');
    assert.equal(belemClock(now).greeting,expected);
    assert.ok(turn(now).r.answer.startsWith(expected+'!\n\n'));
  }
});
test('primeiro contato diário migra conversa antiga sem apagar fatos e não repete à tarde',()=>{
  const first=turn(stamp('11T08:00:00'));
  assert.match(first.r.answer,/^Bom dia!/);
  assert.equal(JSON.parse(first.p.context).primeira_resposta,false);
  assert.equal(JSON.parse(first.p.context).primeira_resposta_do_dia,true);
  const second=turn(stamp('11T15:00:00'),first.r.state,undefined,'Boa tarde! O assunto continua aqui.');
  assert.equal(second.r.answer,'O assunto continua aqui.');
  assert.deepEqual(JSON.parse(second.r.state).facts,initial.facts);
  const nextDay=turn(stamp('12T19:00:00'),second.r.state);
  assert.match(nextDay.r.answer,/^Boa noite!/);
  assert.deepEqual(JSON.parse(nextDay.r.state).facts,initial.facts);
});
test('virada diária local não é virada UTC nem janela móvel de 24 horas',()=>{
  const evening=turn(stamp('11T20:59:00'));
  const utcMidnight=turn(stamp('11T21:01:00'),evening.r.state);
  assert.equal(utcMidnight.r.answer,'O assunto continua aqui.');
  assert.match(turn(stamp('12T00:01:00'),utcMidnight.r.state).r.answer,/^Boa noite!/);
});
test('saudação no início é normalizada uma vez, preservando texto e palavras no corpo',()=>{
  const now=stamp('11T08:00:00'),daily={day:'2026-09-11',first:true};
  for(const prefix of ['Olá! ','Oi! ','Boa noite! ','Olá! Que bom receber seu contato no Hotel Solar. ☀️\n\n']) {
    const text=dailyGreetingText(prefix+'O restaurante se chama Reserva Solar.',daily,now);
    assert.equal(text,'Bom dia!\n\nO restaurante se chama Reserva Solar.');
    assert.equal(dailyGreetingText(text,daily,now),text);
  }
  assert.equal(dailyGreetingText('A expressão bom dia aparece no texto.',daily,now),'Bom dia!\n\nA expressão bom dia aparece no texto.');
  assert.equal(dailyGreetingText('',daily,now),'');
  assert.equal(dailyGreetingText('Oito pessoas.',daily,now),'Bom dia!\n\nOito pessoas.');
});
test('passagens internas e retry do roteamento preservam decisão, contexto e tokens',()=>{
  const now=stamp('11T08:00:00'),{r}=turn(now);
  const remember=control({operation:'remember_response',state:r.state,response_text:r.answer},now);
  assert.deepEqual(JSON.parse(remember.state).daily_greeting,{day:'2026-09-11',first:true});
  const response={state:remember.state,conversation_text:'Confira as opções.',quote_text:'Confira as opções.',quote_request:'PACKAGE_ID|reveillon',package_image_url:'https://fixture.invalid/image'};
  const final=withDailyGreeting(response,null,now);
  assert.equal(final.conversation_text,'Bom dia!\n\nConfira as opções.');
  assert.equal(final.quote_request,response.quote_request);
  assert.equal(final.package_image_url,response.package_image_url);
  assert.deepEqual(withDailyGreeting(final,null,now),final);
  assert.equal(photoClarificationQuestion('Bom dia!\n\nDe qual espaço do hotel você gostaria de ver fotos?'),true);
});
test('pedido de fotos mantém continuação no mesmo espaço após a saudação',()=>{
  const now=Date.now();
  const p=control({operation:'prepare',state:initial,user_message:'Pode reenviar as fotos?'},now);
  const r=control({operation:'route',state:p.state,user_message:'Pode reenviar as fotos?'},now);
  assert.equal(photoClarificationQuestion(r.answer),true);
  const next=control({operation:'prepare',state:r.state,user_message:'das hidromassagens'},now+1000);
  assert.equal(JSON.parse(next.state).topic,'extra_photos');
  assert.deepEqual(JSON.parse(next.state).extra_photo_subjects,['HIDRO']);
  assert.equal(JSON.parse(next.context).primeira_resposta_do_dia,false);
});
test('áudio, telefone e anexos usam a mesma regra sem disparos ou confirmação de pagamento',async()=>{
  const now=Date.now(),url='https://media.example.com/synthetic.ogg';
  const p=await handleConversation({operation:'prepare',state:initial,user_message:url},'',async()=> 'Qual o telefone do hotel?',now);
  assert.equal(JSON.parse(p.context).primeira_resposta_do_dia,true);
  const r=control({operation:'route',state:p.state,user_message:url},now);
  assert.ok(r.answer.startsWith(belemClock(now).greeting+'!'));
  assert.equal(r.can_collect,'NAO');
  const file='https://media.example.com/synthetic.pdf';
  const doc=await handleConversation({operation:'prepare',state:initial,user_message:file},'',async()=>{throw Error('No audio');},now,async()=>({kind:'payment_receipt'}));
  const receipt=control({operation:'route',state:doc.state,user_message:file},now);
  assert.equal(receipt.quote_request,'ANEXO_FINANCEIRO');
  assert.ok(receipt.answer.startsWith(belemClock(now).greeting+'!'));
  assert.match(receipt.answer,/após confirmação/);
  const service=turn(now,initial,'Preciso de toalhas no quarto').r;
  assert.equal(service.quote_request,'HUMANO');
  assert.ok(service.answer.startsWith(belemClock(now).greeting+'!'));
});
test('estado inválido não injeta saudação arbitrária nem erros viram mensagens',()=>{
  assert.equal(dailyGreetingText('Resposta',{day:'invalid',first:true},Date.now()),'Resposta');
  assert.deepEqual(withDailyGreeting({error:'Unavailable'},initial),{error:'Unavailable'});
  const p=turn(stamp('11T08:00:00'),{...initial,daily_greeting:{day:'2026-09-12',first:true}});
  assert.match(p.r.answer,/^Bom dia!/);
});
