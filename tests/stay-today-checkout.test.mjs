import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

// Date helpers only: no controller writes, providers, booking or payment calls.
const bundle=await build({entryPoints:['utils/stayDuration.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {relativeStayDateMention,todayStayDatePending,readStayDatePending,stayDateClarification,
  confirmRelativeCheckout,stayDurationRequest,conflictingStayDuration}=await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const now=Date.parse('2026-09-12T11:20:00-03:00');
const pending={at:now,reason:'relative_checkout',check_in:'2026-09-12',suggested_check_out:'2026-09-14'};

test('hj normaliza somente a palavra relativa, preservando hoje e amanhã',()=>{
  for(const message of ['hj','HJ!','Qual o valor da diária para hj?','Hoje','Amanhã','Depois de amanhã'])
    assert.equal(relativeStayDateMention(message),true,message);
  for(const message of ['hjj','hojes','13/09','Qual a diária?'])
    assert.equal(relativeStayDateMention(message),false,message);
});

test('consulta de diária para hoje usa o relógio de Belém e não confirma a saída antiga',()=>{
  for(const message of ['Qual o valor da diária para hj?','Quanto está a diária para hoje?',
    'Tem quarto para hj?','Quero hospedagem para hoje','Preciso de uma suíte pra hj',
    'Quero me hospedar hoje','Quero check-in hoje']){
    const result=todayStayDatePending(message,'2026-09-14',now);
    assert.deepEqual(result,pending,message);
    assert.equal(result.check_out,undefined,message);
  }
  const utcNextDay=Date.parse('2026-09-13T01:20:00Z');
  assert.equal(todayStayDatePending('Tem quarto para hj?','2026-09-14',utcNextDay).check_in,'2026-09-12');
});

test('saída anterior só vira candidata com data real, depois da entrada e até 30 noites',()=>{
  for(const candidate of [undefined,'','2026-02-30','2026-09-11','2026-09-12','2026-10-13','14/09','2026-9-14']){
    const result=todayStayDatePending('Qual o valor da diária para hj?',candidate,now);
    assert.equal(result.reason,'relative_checkout');
    assert.equal(result.check_in,'2026-09-12');
    assert.equal(result.suggested_check_out,undefined,String(candidate));
    assert.equal(result.check_out,undefined);
  }
  assert.equal(todayStayDatePending('Tem quarto para hoje?','2026-10-12',now).suggested_check_out,'2026-10-12');
});

test('FAQ, refeições, execução, hipótese e datas/quantidades explícitas ficam fora do helper de entrada hoje',()=>{
  for(const message of ['O Reserva vai funcionar hj?','Qual o café da manhã para hj?',
    'Qual valor do Day Use para hj?','Quero fotos do quarto para hj','Qual o horário do check-in hoje?',
    'A diária de hoje inclui café?','Não quero hospedagem para hoje','Se eu quiser hospedagem para hoje?',
    'Quero hospedagem de hoje até amanhã','Quero hospedagem por duas noites para hj',
    'Quero uma diária para hoje','Quero entrada hoje e saída 14/09','Quero entrar hoje e sair amanhã',
    'Hoje quero cotar hospedagem para o mês que vem','Quero hospedagem para amanhã',
    'Qual o valor da diária?','Vou fazer o pagamento da diária de hoje']){
    assert.equal(todayStayDatePending(message,'2026-09-14',now),undefined,message);
  }
});

test('leitor valida TTL de 30 minutos, dia local e estrutura, sem promover check_out injetado',()=>{
  assert.deepEqual(readStayDatePending(pending,now),pending);
  assert.deepEqual(readStayDatePending(pending,now+30*60000),pending);
  assert.equal(readStayDatePending(pending,now+30*60000+1),undefined);
  for(const at of [now+1,0,-1,'2026-09-12',NaN,Infinity])
    assert.equal(readStayDatePending({...pending,at},now),undefined,String(at));
  for(const check_in of ['2026-09-11','2026-09-13','2026-02-30','12/09',undefined])
    assert.equal(readStayDatePending({...pending,check_in},now),undefined,String(check_in));
  for(const suggested_check_out of ['2026-09-12','2026-02-30','2026-10-13','14/09'])
    assert.equal(readStayDatePending({...pending,suggested_check_out},now),undefined,suggested_check_out);
  assert.equal(readStayDatePending({...pending,check_out:'2026-09-14'},now).check_out,undefined);
  const beforeMidnight=Date.parse('2026-09-12T23:55:00-03:00');
  assert.equal(readStayDatePending({...pending,at:beforeMidnight},beforeMidnight+10*60000),undefined);
});

test('pergunta distingue candidato de ausência de saída, sem assumir uma diária',()=>{
  const question=stayDateClarification(pending);
  assert.match(question,/Entrada hoje, 12\/09\/2026/);
  assert.match(question,/Mantém a saída em 14\/09\/2026\?/);
  assert.match(question,/outra data.*dia\/mês/);
  assert.doesNotMatch(question,/confirmad|reservad|disponibilidade|13\/09/);
  const withoutCandidate=todayStayDatePending('Quero hospedagem para hoje',undefined,now);
  assert.match(stayDateClarification(withoutCandidate),/Qual será a data de saída\?/);
  assert.doesNotMatch(stayDateClarification(withoutCandidate),/Mantém|amanhã|13\/09/);
});

test('sim aceita somente a saída candidata de pergunta determinística realmente exibida',()=>{
  for(const answer of ['Sim','sim!','Sim, por favor','Isso mesmo','Pode manter','Mantenha']){
    assert.equal(confirmRelativeCheckout(pending,answer,false,now),undefined,answer);
    assert.equal(confirmRelativeCheckout(pending,answer,'true',now),undefined,answer);
    assert.deepEqual(confirmRelativeCheckout(pending,answer,true,now),{
      check_in:'2026-09-12',check_out:'2026-09-14',
    },answer);
  }
  for(const answer of ['Não','Sim?','2','14','Não, saída 13/09','Sim, mas vou sair amanhã',
    'Quero reservar','Confirmar opção','Pode manter o preço'])
    assert.equal(confirmRelativeCheckout(pending,answer,true,now),undefined,answer);
  assert.equal(confirmRelativeCheckout({...pending,suggested_check_out:undefined},'Sim',true,now),undefined);
  assert.equal(confirmRelativeCheckout(pending,'Sim',true,now+31*60000),undefined);
  assert.equal(confirmRelativeCheckout({at:now,reason:'relative_dates'},'Sim',true,now),undefined);
});

test('contratos de outras datas relativas e de duração permanecem inalterados',()=>{
  for(const reason of ['relative_dates','unparsed_dates'])
    assert.deepEqual(readStayDatePending({at:now,reason},now),{at:now,reason});
  const duration=stayDurationRequest('Quero duas noites',now);
  assert.deepEqual(duration,{at:now,count:2,unit:'nights'});
  const conflict=conflictingStayDuration(duration,'2026-09-12','2026-09-13','12/09 a 13/09',now);
  assert.equal(conflict.reason,'duration_conflict');
  assert.equal(conflict.suggested_check_out,'2026-09-14');
  assert.deepEqual(readStayDatePending(conflict,now),conflict);
  assert.equal(confirmRelativeCheckout(conflict,'Sim',true,now),undefined);
});
