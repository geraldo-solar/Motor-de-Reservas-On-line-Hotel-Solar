import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
const b=await build({stdin:{contents:`export {updateFamilyParty,readFamilyParty} from './utils/familyParty.ts';export {control} from './api/conversation-control.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {updateFamilyParty:update,readFamilyParty:read,control}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const now=Date.parse('2026-09-13T09:00:00-03:00');
const turn=(message,previous,at=now)=>update(message,previous?.party||previous,at);
const initial={version:2,history:[],facts:{extras:[],check_in:'2026-09-20',check_out:'2026-09-22'},greeted:true};
function route(message,state=initial) {
  const p=control({operation:'prepare',user_message:message,state},now);
  const r=control({operation:'route',user_message:message,state:p.state,proposed:'NOQUOTE',ai_response:'Resposta neutra.'},now);
  return {...r,parsed:JSON.parse(r.state)};
}

test('bebê adicional preserva duas crianças e solicita cotação para cinco, não três',()=>{
  const first=route('Somos um casal e 2 crianças de 10 e 8 anos');
  const added=route('Vai mais um bebê de 1 ano',first.state);
  assert.equal(added.parsed.facts.guests,5);
  assert.equal(added.parsed.family_party.adults,2);
  assert.equal(added.parsed.family_party.children,3);
  assert.deepEqual(added.parsed.family_party.ages_months,[120,96,12]);
  assert.equal(added.parsed.facts.children_pending,false);
  assert.equal(added.quote_request,'QUOTE|2026-09-20|2026-09-22|5|NONE');
});

test('delta ajusta total explícito sem confundir com composição substituta',()=>{
  const first=turn('Somos 4 pessoas, 2 adultos e 2 crianças de 10 e 8 anos');
  for(const message of ['Vai mais uma criança de 5 anos','Inclua uma criança de 5 anos','Acrescenta uma criança de 5 anos']) {
    const added=turn(message,first);
    assert.equal(added.guests,5,message);assert.equal(added.party.total,5,message);
    assert.deepEqual(added.party.ages_months,[120,96,60],message);
  }
  const replaced=turn('Na verdade, somos um casal e uma criança de 5 anos',first);
  assert.equal(replaced.guests,3);assert.equal(replaced.party.total,undefined);
  assert.deepEqual(replaced.party.ages_months,[60]);
  const contradicted=turn('Vai mais uma criança de 5 anos, somos 4 pessoas',first);
  assert.equal(contradicted.guests,undefined);assert.equal(contradicted.clarification,'party_composition');
});

test('adição com idade faltante preserva idades conhecidas e impede concluir ocupação',()=>{
  const first=turn('Somos um casal e 2 crianças de 10 e 8 anos');
  const added=turn('Vai mais um bebê',first);
  assert.equal(added.guests,5);assert.equal(added.children_pending,true);
  assert.deepEqual(added.party.ages_months,[120,96]);
  const completed=turn('O outro bebê tem 1 ano',added);
  assert.equal(completed.guests,5);assert.equal(completed.children_pending,false);
  assert.deepEqual(completed.party.ages_months,[120,96,12]);
});

test('idade de três crianças chega em mensagens individuais sem repetir a coleta inteira',()=>{
  let r=route('Somos um casal e 3 crianças');
  for(const message of ['Uma tem 16 anos','A outra tem 10 anos','E a outra tem 8 anos'])r=route(message,r.state);
  assert.equal(r.parsed.facts.guests,5);assert.equal(r.parsed.facts.children_pending,false);
  assert.deepEqual(r.parsed.family_party.ages_months,[192,120,96]);
  assert.equal(r.parsed.family_clarification,undefined);
  assert.match(r.answer,/dois apartamentos/);
  assert.doesNotMatch(r.answer,/Quais são as idades/);
});

test('replay consecutivo é idempotente; intercalado pede esclarecimento sem duplicar pessoas',()=>{
  const first=turn('Somos um casal e 2 crianças de 10 e 8 anos');
  const added=turn('Vai mais um bebê de 1 ano',first);
  assert.deepEqual(turn('Vai mais um bebê de 1 ano',added,now+1000),added);
  const total=turn('Nós 5',added);
  const uncertain=turn('Vai mais um bebê de 1 ano',total,now+1000);
  assert.equal(uncertain.clarification,'party_composition');assert.equal(uncertain.guests,undefined);
  assert.equal(uncertain.party.children,3);assert.deepEqual(uncertain.party.ages_months,[120,96,12]);
  const start=turn('Somos um casal e 3 crianças');
  const a=turn('Uma tem 16 anos',start);
  const b=turn('A outra tem 10 anos',a);
  const uncertainFirst=turn('Uma tem 16 anos',b,now+1000);
  assert.equal(uncertainFirst.clarification,'age_reference');assert.deepEqual(uncertainFirst.party.ages_months,[192,120]);
  const c=turn('E a outra tem 8 anos',b);
  const uncertainAge=turn('A outra tem 10 anos',c,now+1000);
  assert.equal(uncertainAge.clarification,'age_reference');assert.deepEqual(uncertainAge.party.ages_months,[192,120,96]);
  assert.deepEqual(read(c.party,now),c.party);
});

test('adição após remoção não é ignorada como replay nem cota o grupo antigo',()=>{
  let r=route('Somos um casal e 2 crianças de 10 e 8 anos');
  r=route('Vai mais um bebê de 1 ano',r.state);
  assert.equal(r.parsed.facts.guests,5);
  r=route('Um bebê de 1 ano não vai mais',r.state);
  assert.equal(r.parsed.facts.guests,4);
  r=route('Vai mais um bebê de 1 ano',r.state);
  assert.equal(r.quote_request,'NOQUOTE');assert.equal(r.parsed.facts.guests,undefined);
  assert.equal(r.parsed.family_clarification,'party_composition');
  assert.match(r.answer,/quantos adultos e quantas crianças/);
  const clarified=route('Agora somos um casal e 3 crianças de 10, 8 e 1 anos',r.state);
  assert.equal(clarified.parsed.facts.guests,5);assert.equal(clarified.parsed.facts.children_pending,false);
  assert.equal(clarified.quote_request,'QUOTE|2026-09-20|2026-09-22|5|NONE');
});

test('idade antiga reapresentada após outra idade bloqueia decisão até esclarecimento',()=>{
  let r=route('Somos um casal e 3 crianças');
  for(const message of ['Uma tem 16 anos','A outra tem 10 anos','E a outra tem 8 anos'])r=route(message,r.state);
  r=route('A outra tem 10 anos',r.state);
  assert.equal(r.quote_request,'NOQUOTE');assert.equal(r.parsed.facts.children_pending,true);
  assert.equal(r.parsed.family_clarification,'age_reference');
  assert.deepEqual(r.parsed.family_party.ages_months,[192,120,96]);
  assert.match(r.answer,/idades das crianças/);
  const clarified=route('As idades são 16, 10 e 8 anos',r.state);
  assert.equal(clarified.parsed.facts.children_pending,false);
  assert.equal(clarified.parsed.family_clarification,undefined);
  assert.match(clarified.answer,/dois apartamentos/);
});

test('idades iguais só preenchem outra criança com referência explícita, não repetição',()=>{
  const start=turn('2 adultos e 3 crianças');
  const a=turn('Uma tem 5 anos',start);
  const repeated=turn('5 anos',a);
  assert.deepEqual(repeated.party.ages_months,[60]);assert.equal(repeated.children_pending,true);
  const b=turn('A outra tem 5 anos',a);
  assert.deepEqual(b.party.ages_months,[60,60]);assert.equal(b.children_pending,true);
  assert.deepEqual(turn('A outra tem 5 anos',b,now+1000),b);
  const c=turn('5, 5 e 5 anos',b);
  assert.deepEqual(c.party.ages_months,[60,60,60]);assert.equal(c.children_pending,false);
});

test('remoção reduz quantidade, mas não adivinha as idades de quem permanece',()=>{
  const first=turn('Somos 5 pessoas, um casal e 3 crianças de 16, 10 e 8 anos');
  const removed=turn('Uma criança não vai mais',first);
  assert.equal(removed.guests,4);assert.equal(removed.party.total,4);
  assert.equal(removed.party.children,2);assert.equal(removed.children_pending,true);
  assert.deepEqual(removed.party.ages_months,[]);
  const exact=turn('Uma criança de 8 anos não vai mais',first);
  assert.equal(exact.guests,4);assert.deepEqual(exact.party.ages_months,[192,120]);
  assert.equal(exact.children_pending,false);
  const after=turn('Nós 4',exact);
  const replay=turn('Uma criança de 8 anos não vai mais',after,now+1000);
  assert.equal(replay.guests,undefined);assert.equal(replay.clarification,'party_composition');
  assert.equal(replay.party.children,2);assert.deepEqual(replay.party.ages_months,[192,120]);
});

test('deltas hipotéticos, sem referência ou excessivos nunca substituem por uma criança',()=>{
  const first=turn('Somos um casal e 2 crianças de 10 e 8 anos');
  for(const message of ['Talvez vai mais um bebê de 1 ano','Vai mais um bebê de 1 ano?',
    'Se vai mais um bebê de 1 ano','Menos 3 crianças']) {
    const r=turn(message,first);
    assert.equal(r.guests,undefined,message);assert.equal(r.clarification,'party_composition',message);
    assert.equal(r.party.children,2,message);assert.deepEqual(r.party.ages_months,[120,96],message);
  }
  const unknown=turn('Vai mais um bebê de 1 ano');
  assert.equal(unknown.guests,undefined);assert.equal(unknown.clarification,'party_composition');
});

test('adulto adicional preserva crianças, total e idades, sem contar parente duas vezes',()=>{
  const first=turn('Somos 4 pessoas, 2 adultos e 2 crianças de 10 e 8 anos');
  const added=turn('Vai mais um adulto',first);
  assert.equal(added.guests,5);assert.equal(added.party.adults,3);
  assert.equal(added.party.children,2);assert.deepEqual(added.party.ages_months,[120,96]);
  assert.equal(added.party.total,5);
});
