import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
const b=await build({stdin:{contents:`export {control} from './api/conversation-control.ts';export * from './utils/conversationalStayDates.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {control,declaredRelativeStay,readSplitStayDates,readArrivalTime}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const sep13=Date.parse('2026-09-13T09:00:00-03:00');
const sep12=Date.parse('2026-09-12T12:51:00-03:00');
const sep11=Date.parse('2026-09-11T16:28:00-03:00');
const empty={version:2,history:[],facts:{extras:[]},greeted:true};
const old={...empty,facts:{extras:[],guests:2,check_in:'2026-10-10',check_out:'2026-10-12'}};
const morning='Valor de ir amanhã de manhã até segunda de manhã';
function turn(message,state=empty,now=sep13,proposed='NOQUOTE'){
  const p=control({operation:'prepare',user_message:message,state},now);
  const r=control({operation:'route',user_message:message,state:p.state,proposed,ai_response:'Resposta sintética sem preço nem disponibilidade.'},now);
  return {p,r,state:JSON.parse(r.state),context:JSON.parse(p.context)};
}
const noQuote=t=>{assert.equal(t.r.quote_request,'NOQUOTE');assert.equal(t.r.can_collect,'NAO');};

test('W03 literal: dias, mês, idade, saudações e uma diária acumulam sem inventar noites',()=>{
  let state=empty;
  for(const message of ['18 e 19','2 adultos 1 criança','18 e 19','De setembro','Oi','Bom dia','3 anos','Sexta a sábado']){
    const t=turn(message,state,sep13,'QUOTE|2026-09-18|2026-09-20|3|NONE');state=t.state;
    noQuote(t);assert.equal(state.facts.check_out,undefined,message);assert.equal(state.facts.check_in,undefined,message);
    assert.equal(state.stay_date_pending.reason,'split_dates',message);
  }
  assert.equal(state.facts.guests,3);assert.deepEqual(state.family_party.ages_months,[36]);
  const confirmed=turn('1 diária',state,sep13,'QUOTE|2026-09-18|2026-09-20|3|NONE');
  assert.equal(confirmed.r.quote_request,'QUOTE|2026-09-18|2026-09-19|3|NONE');
  assert.equal(confirmed.state.stay_date_pending,undefined);assert.equal(confirmed.state.facts.guests,3);
  const repeat=turn('Isso?',confirmed.state);assert.deepEqual(repeat.state.facts,confirmed.state.facts);
});

test('par sem mês não vira cotação antiga, e dias não significam noites',()=>{
  const pair=turn('18 e 19',old,sep13,'QUOTE|2026-10-10|2026-10-12|2|NONE');noQuote(pair);
  assert.deepEqual(pair.state.stay_date_pending.days,[18,19]);assert.equal(pair.state.stay_date_pending.month,undefined);
  assert.match(pair.r.answer,/qual mês/i);
  const month=turn('De setembro',pair.state);noQuote(month);
  const days=turn('2 dias',month.state);noQuote(days);assert.equal(days.state.facts.check_out,undefined);
  const nights=turn('2 diárias',month.state);noQuote(nights);assert.equal(nights.state.facts.check_out,undefined);
  const one=turn('1 diária',month.state);assert.equal(one.r.quote_request,'QUOTE|2026-09-18|2026-09-19|2|NONE');
});

test('mês inválido, dia impossível, weekday divergente e TTL não produzem datas',()=>{
  const pair=turn('30 e 31');const invalid=turn('De fevereiro',pair.state);noQuote(invalid);assert.equal(invalid.state.facts.check_out,undefined);
  const first=turn('18 e 19');const month=turn('De setembro',first.state);
  const mismatch=turn('Sábado a domingo',month.state);assert.match(mismatch.r.answer,/não correspondem/);
  noQuote(turn('1 diária',mismatch.state));
  const expired=turn('De setembro',first.state,sep13+31*60000,'QUOTE|2026-09-18|2026-09-19|2|NONE');
  noQuote(expired);assert.equal(expired.state.facts.check_in,undefined);assert.equal(expired.state.facts.check_out,undefined);
  assert.equal(readSplitStayDates({...first.state.stay_date_pending,at:sep13+1},sep13),undefined);
});

test('mês sozinho, idade, restaurante, FAQ e fotografia não inventam datas divididas',()=>{
  const alone=turn('De setembro',old);assert.deepEqual(alone.state.facts,old.facts);
  const family=turn('Dois adultos e duas crianças');const ages=turn('18 e 19 anos',family.state);assert.equal(ages.state.stay_date_pending,undefined);
  for(const message of ['Qual o cardápio do Reserva Solar?','Quero fotos das piscinas','Qual horário do check-in?']){
    const first=turn('18 e 19');const interruption=turn(message,first.state);
    assert.equal(interruption.state.stay_date_pending,undefined,message);
    const month=turn('De setembro',interruption.state);assert.equal(month.state.facts.check_out,undefined,message);
  }
});

test('W05 literal mantém amanhã/segunda no relógio original e casal sem garantir manhã',()=>{
  let t=turn('Boa tarde',empty,sep12);t=turn('Gostaria de saber',t.state,sep12);t=turn(morning,t.state,sep12);
  assert.equal(t.state.facts.check_in,'2026-09-13');assert.equal(t.state.facts.check_out,'2026-09-14');
  assert.equal(t.state.arrival_time.status,'time_needed');noQuote(t);
  assert.match(t.r.answer,/14h/);assert.match(t.r.answer,/R\$250/);assert.match(t.r.answer,/disponibilidade/);assert.match(t.r.answer,/horário previsto/);
  t=turn('Casal',t.state,sep12,'QUOTE|2026-09-13|2026-09-14|2|NONE');noQuote(t);
  assert.equal(t.state.facts.guests,2);assert.equal(t.state.facts.check_in,'2026-09-13');assert.equal(t.state.facts.check_out,'2026-09-14');
  assert.equal(t.context.cotacao_valida_para_estes_dados,null);
  assert.doesNotMatch(t.r.answer,/reserva confirmada|quarto liberado|apartamento liberado/);
});

test('horário explícito antes das14 ou desconhecido chama recepção;14+prossegue sem somar taxa',()=>{
  const first=turn(morning,empty,sep12);const party=turn('Casal',first.state,sep12);
  for(const reply of ['8','8h','às 08:30','Chego 5h','Não sei','Ainda não sei']){
    const t=turn(reply,party.state,sep12);assert.equal(t.r.quote_request,'HUMANO',reply);assert.equal(t.r.can_collect,'NAO');
    assert.equal(t.state.facts.guests,2,reply);assert.equal(t.state.facts.check_in,'2026-09-13');
    assert.match(t.r.answer,/recepção.*conferir/);assert.doesNotMatch(t.r.answer,/confirmada|já.*liberado/);
  }
  for(const reply of ['14h','15:00','3 da tarde']){
    const t=turn(reply,party.state,sep12);assert.equal(t.state.arrival_time,undefined,reply);
    assert.equal(t.r.quote_request,'QUOTE|2026-09-13|2026-09-14|2|NONE',reply);
  }
  const beforeOccupancy=turn('8',first.state,sep12);assert.equal(beforeOccupancy.state.facts.guests,undefined);
});

test('horários inválidos e marcador expirado não liberam cotação antiga',()=>{
  const first=turn(morning,old,sep12);const party=turn('Casal',first.state,sep12);
  for(const message of ['25h','8:99']){const t=turn(message,party.state,sep12,'QUOTE|2026-09-13|2026-09-14|2|NONE');noQuote(t);assert.ok(t.state.arrival_time);}
  const expired=turn('8h',party.state,sep12+31*60000,'QUOTE|2026-09-13|2026-09-14|2|NONE');noQuote(expired);assert.equal(expired.state.facts.check_out,undefined);
  assert.equal(readArrivalTime({...party.state.arrival_time,at:sep12+1},party.state.facts,sep12),undefined);
});

test('W18 sexta hoje até segunda propõe11–14/9, sem confirmar saída, hóspedes ou alternativa',()=>{
  const message='Qual valor para quarto duplo solteiro ou dois quartos solteiros para entrar hoje e sair segunda?';
  const t=turn(message,empty,sep11);
  assert.equal(t.state.facts.check_in,'2026-09-11');assert.equal(t.state.facts.check_out,undefined);
  assert.equal(t.state.stay_date_pending.reason,'relative_checkout');
  assert.equal(t.state.stay_date_pending.suggested_check_out,'2026-09-14');
  assert.equal(t.state.facts.guests,undefined);assert.equal(t.r.can_collect,'NAO');
  assert.equal(t.state.arrival_time,undefined);
});

test('relativo não vem de menu, passeio, evento, foto, regra, negação ou proposta antiga',()=>{
  for(const message of ['Não quero ir amanhã de manhã até segunda','Se eu quiser ir amanhã de manhã até segunda?',
    'Qual valor do café para ir amanhã de manhã até segunda?','Quero fotos do quarto para entrar hoje e sair segunda',
    'Qual o horário para entrar hoje e sair segunda?','Qual valor do evento para entrar hoje e sair segunda?',
    'Qual o cardápio do restaurante para ir amanhã até segunda?','Quero passeio de barco para ir amanhã até segunda']){
    assert.equal(declaredRelativeStay(message,sep12),undefined,message);
    const t=turn(message,old,sep12);assert.equal(t.state.arrival_time,undefined,message);
    assert.notEqual(t.state.facts.check_in,'2026-09-13',message);
  }
  const hello=turn('Bom dia',old,sep13,'QUOTE|2026-09-13|2026-09-14|2|NONE');assert.deepEqual(hello.state.facts,old.facts);
});

test('W06 conserva10–12/10 e duas pessoas após89min e retomada doisdias depois',()=>{
  let t=turn('Boa tarde! Qual o valor da diária? Tem disponibilidade para 10/10 a 12/10?',empty,Date.parse('2026-09-11T13:52:00-03:00'));
  t=turn('Duas',t.state,Date.parse('2026-09-11T15:21:00-03:00'));
  assert.equal(t.r.quote_request,'QUOTE|2026-10-10|2026-10-12|2|NONE');
  const resumed=turn('Bom dia!',t.state,Date.parse('2026-09-13T10:26:00-03:00'));
  assert.deepEqual(resumed.state.facts,t.state.facts);assert.match(resumed.r.answer,/^Bom dia!/);
});
