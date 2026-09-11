import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
async function moduleAt(path) {
  const bundle=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm'});
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
}
const {updateFamilyParty:update,readFamilyParty:read}=await moduleAt('utils/familyParty.ts');
const {childAgeFollowup,childPolicyQuestion}=await moduleAt('utils/packageChildInquiry.ts');
const {familyAgeQuestionFor,familyAccommodation}=await moduleAt('utils/familyAccommodation.ts');
const now=Date.parse('2026-09-11T15:00:00Z');
const turn=(message,previous,knownTotal)=>update(message,previous?.party||previous,now,knownTotal);

test('F1 real: total cinco permanece depois de casal e filhos e conclui com três idades',()=>{
  const start=turn('Entrando hoje a noite e saindo domingo de manha ( duas diárias) para 5 pessoas');
  const family=turn('Casal e filhos',start);
  assert.equal(family.guests,5);assert.equal(family.party.adults,2);assert.equal(family.party.children,3);
  assert.equal(family.party.total,5);assert.equal(family.party.age_subject,'offspring');
  assert.equal(family.clarification,'child_ages');assert.equal(family.children_pending,true);
  assert.match(familyAgeQuestionFor({family_party:family.party}),/filhos, inclusive se algum já for adulto/);
  for(const message of ['idades 6, 9 e 18 anos','Três filhos de seis, nove e dezoito anos']) {
    const final=turn(message,family);
    assert.equal(final.guests,5,message);assert.equal(final.children_pending,false,message);
    assert.equal(final.clarification,undefined,message);assert.deepEqual(final.party.ages_months,[72,108,216]);
    const accommodation=familyAccommodation({family_party:final.party},5,now);
    assert.equal(accommodation.pending,false);assert.equal(accommodation.eligible,1);
  }
  const legacy=turn('Casal e filhos',undefined,5);
  assert.equal(legacy.guests,5);assert.equal(legacy.party.children,3);
});

test('F1 filhos são pessoas de idade ainda desconhecida, não menores nem ocupantes omitidos',()=>{
  for(const message of ['Quero hospedagem para um casal e dois filhos?', 'Casal com duas filhas',
    'Qual valor da hospedagem para 2 adultos e 2 filhos?']) {
    assert.equal(childPolicyQuestion(message),false,message);
    const family=turn(message);
    assert.equal(family.guests,4,message);assert.equal(family.children_pending,true,message);
    assert.equal(family.party.age_subject,'offspring');assert.equal(family.clarification,'child_ages');
  }
  const adultOffspring=turn('2 adultos e 2 filhos adultos de dezoito e vinte e cinco anos');
  assert.equal(adultOffspring.guests,4);assert.deepEqual(adultOffspring.party.ages_months,[216,300]);
  assert.equal(adultOffspring.children_pending,false);
  assert.equal(familyAccommodation({family_party:adultOffspring.party},4,now).eligible,0);
  for(const message of ['Só adultos','Sem crianças','Não temos crianças']) {
    const clarified=turn(message,adultOffspring);
    assert.equal(clarified.guests,4,message);assert.equal(clarified.children_pending,false,message);
    assert.deepEqual(clarified.party.ages_months,[216,300],message);
  }
  const overlappingAdults=turn('Somos 4 adultos',adultOffspring);
  assert.equal(overlappingAdults.guests,undefined);assert.equal(overlappingAdults.clarification,'party_composition');
  const adultReplacement=turn('Na verdade, 4 adultos e sem crianças',adultOffspring);
  assert.equal(adultReplacement.guests,4);assert.equal(adultReplacement.party.children,0);
  const parents=turn('Casal');
  const later=turn('Dois filhos de 18 e 25 anos',parents,2);
  assert.equal(later.guests,4);assert.equal(later.clarification,undefined);
});

test('quantidade não informada e totais incompatíveis pedem esclarecimento sem inventar filhos',()=>{
  for(const message of ['Casal e filhos','2 adultos e nossos filhos']) {
    const r=turn(message);
    assert.equal(r.guests,undefined,message);assert.equal(r.party.children,undefined,message);
    assert.equal(r.clarification,'party_composition',message);
    assert.deepEqual(read(r.party,now),r.party);
    const completed=turn('Três filhos de 6, 9 e 18 anos',r);
    assert.equal(completed.guests,5);assert.equal(completed.children_pending,false);
  }
  const five=turn('5 pessoas');
  for(const message of ['Casal e dois filhos','Somos 5 pessoas, 2 adultos e 2 filhos']) {
    const conflict=turn(message,five);
    assert.equal(conflict.guests,undefined);assert.equal(conflict.clarification,'party_composition');
  }
  const overlap=turn('4 adultos, incluindo 2 filhos adultos de 18 e 25 anos');
  assert.equal(overlap.guests,undefined);assert.equal(overlap.clarification,'party_composition');
});

test('F2 texto e transcrição: idades por extenso equivalem a números, com unidade obrigatória',()=>{
  const start=turn('2 adultos e 1 criança');
  for(const [message,months] of [['6 anos',72],['seis anos',72],['Ela tem seis anos',72],
    ['um ano e seis meses',18],['Dezoito meses',18],['Minha filha tem vinte e cinco anos',300]]) {
    assert.equal(childAgeFollowup(message),true,message);
    // The audio pipeline gives the same plain transcription to this parser.
    for(const text of [message,String(message)]) {
      const r=turn(text,start);
      assert.equal(r.guests,3,message);assert.deepEqual(r.party.ages_months,[months],message);
      assert.equal(r.children_pending,false,message);assert.equal(r.clarification,undefined,message);
    }
  }
  const partial=turn('Uma tem dois anos',turn('2 adultos e 2 filhos'));
  const done=turn('A outra tem seis anos',partial);
  assert.deepEqual(done.party.ages_months,[24,72]);assert.equal(done.guests,4);
  assert.equal(done.children_pending,false);
  assert.deepEqual(turn('2 adultos e 2 filhos de seis anos e um ano e seis meses').party.ages_months,[72,18]);
});

test('idades dos adultos, números sem unidade, datas e conteúdo externo não viram idade infantil',()=>{
  const start=turn('2 adultos e 1 criança');
  for(const message of ['Eu tenho quarenta anos','Minha esposa tem 40 anos','O adulto tem 40 anos',
    '14/09 a 18/09','seis','Solar tem cinquenta anos','Meu filho quer fotos de seis anos atrás']) {
    assert.equal(childAgeFollowup(message),false,message);
    const r=turn(message,start);
    assert.equal(r.handled,false,message);assert.deepEqual(r.party,start.party,message);
  }
  const parents=turn('2 adultos de quarenta e quarenta e dois anos e 1 criança');
  assert.equal(parents.guests,3);assert.deepEqual(parents.party.ages_months,[]);
  assert.equal(parents.children_pending,true);
  const mixed=turn('2 adultos de 40 e 42 anos e 1 criança de seis anos');
  assert.equal(mixed.guests,3);assert.deepEqual(mixed.party.ages_months,[72]);
  const invalid=turn('um ano e doze meses',start);
  assert.equal(invalid.clarification,'child_ages');assert.equal(invalid.children_pending,true);
});

test('correções de família e idade substituem somente informação explícita e mantêm guardas',()=>{
  const start=turn('Somos 5 pessoas: casal e três filhos de 6, 9 e 18 anos');
  const changed=turn('Na verdade, casal e dois filhos de sete e vinte anos',start);
  assert.equal(changed.guests,4);assert.equal(changed.party.total,undefined);
  assert.deepEqual(changed.party.ages_months,[84,240]);
  const uncertain=turn('Na verdade, casal e filhos',start);
  assert.equal(uncertain.guests,undefined);assert.equal(uncertain.clarification,'party_composition');
  assert.equal(uncertain.party.children,undefined);assert.deepEqual(uncertain.party.ages_months,[]);
  const contrast=turn('Não são dois filhos de 6 e 9 anos, são três filhos de seis, nove e dezoito anos',changed);
  assert.equal(contrast.guests,5);assert.deepEqual(contrast.party.ages_months,[72,108,216]);
  const ageCorrection=turn('Na verdade, ela tem seis anos',changed);
  assert.equal(ageCorrection.clarification,'age_reference');assert.deepEqual(ageCorrection.party.ages_months,[]);
  assert.equal(update('seis anos',turn('2 adultos e 1 criança').party,now+31*60000).handled,false);
  assert.doesNotMatch(JSON.stringify(changed.party),/pagante|minor|nome|tarifa|diagnostico/);
});
