import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

// Local deterministic code only; audio uses a synthetic transcription callback.
const bundle=await build({stdin:{contents:`export {updateFamilyParty,readFamilyParty} from './utils/familyParty.ts';
  export {familyAccommodation} from './utils/familyAccommodation.ts';
  export {control,handleConversation} from './api/conversation-control.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm'});
const {updateFamilyParty:update,readFamilyParty:read,familyAccommodation,control,handleConversation}=
  await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const now=Date.parse('2026-09-15T09:00:00-03:00');
const previous={adults:2,children:3,total:5,age_subject:'offspring',ages_months:[120,96,192],updated_at:now};
const literal='No caso, irá apenas eu e minha esposa.';
const seed=(party=previous)=>({version:2,history:['Somos cinco: um casal e três filhos de 10, 8 e 16 anos'],
  facts:{guests:5,children_pending:!!party.clarification,extras:[],check_in:'2026-09-18',check_out:'2026-09-20'},
  family_party:party,family_clarification:party.clarification,greeted:true,
  assistant_disclosure:{version:1,show:false,rendered:true},daily_greeting:{day:'2026-09-15',first:false},
  pending:{quote_id:'old-fixture-quote',option:'Loft'}});
function checkTwo(r,{adultPair=true}={}){
  assert.equal(r.handled,true);assert.equal(r.guests,2);assert.equal(r.party.total,2);
  assert.deepEqual(r.party.ages_months,[]);assert.equal(r.party.age_subject,undefined);
  assert.equal(r.children_pending,false);assert.equal(r.clarification,undefined);
  assert.equal(r.party.adults,adultPair?2:undefined);assert.equal(r.party.children,adultPair?0:undefined);
  assert.deepEqual(read(r.party,now),r.party);
}

test('15/09: só o cliente e o cônjuge substituem a família anterior integralmente',()=>{
  for(const message of [literal,'Só eu e meu marido','Apenas eu e minha esposa',
    'Agora somos só eu e minha esposa.','No nosso caso, vai somente eu e meu esposo.',
    'Iremos apenas eu e minha companheira','Eu e meu marido somente']){
    for(const old of [undefined,previous,{...previous,ages_months:[],clarification:'child_ages'}]){
      const r=update(message,old,now);checkTwo(r);
      assert.deepEqual(update(message,r.party,now+1000),r,message);
    }
  }
});

test('retirada explícita dos filhos preserva só os demais ocupantes conhecidos',()=>{
  for(const message of ['As crianças não vão','As crianças não irão mais.','No caso, as crianças não vão conosco.',
    'Os nossos filhos não vão','As nossas filhas não irão nesta viagem']){
    const r=update(message,previous,now);checkTwo(r);
    assert.deepEqual(update(message,r.party,now+1000),r,message);
  }
  const fourParents={...previous,adults:4,total:7};
  const r=update('As crianças não vão',fourParents,now);
  assert.equal(r.guests,4);assert.equal(r.party.adults,4);assert.equal(r.party.children,0);
  assert.deepEqual(r.party.ages_months,[]);
  const noAdultCount=update('Os filhos não vão',{...previous,adults:undefined},now);
  assert.equal(noAdultCount.guests,2);assert.equal(noAdultCount.party.adults,undefined);
  assert.equal(noAdultCount.party.children,0);assert.deepEqual(noAdultCount.party.ages_months,[]);
});

test('correção positiva de total elimina contagens e idades incompatíveis, sem inventar adultos',()=>{
  for(const message of ['No caso são 2 pessoas não 5','São duas pessoas, não cinco.',
    'Somos 2 hóspedes e não 5 hóspedes','Não somos cinco pessoas, somos duas pessoas']){
    const r=update(message,previous,now);checkTwo(r,{adultPair:false});
    assert.deepEqual(update(message,r.party,now+1000),r,message);
  }
  const reaffirmed=update('São 5 pessoas, não 2',previous,now);
  assert.equal(reaffirmed.guests,5);assert.deepEqual(reaffirmed.party.ages_months,previous.ages_months);
  assert.equal(reaffirmed.party.adults,2);assert.equal(reaffirmed.party.children,3);
  const changed=update('São 3 pessoas não 5',previous,now);
  assert.equal(changed.guests,3);assert.deepEqual(changed.party.ages_months,[]);
  assert.equal(changed.party.adults,undefined);assert.equal(changed.party.children,undefined);
  for(const message of ['São 0 pessoas não 5','São 99 pessoas não 5']){
    const invalid=update(message,previous,now);
    assert.equal(invalid.guests,undefined);assert.equal(invalid.clarification,'party_composition');
  }
});

test('perguntas, hipóteses, terceiros e negação oposta não substituem o grupo',()=>{
  for(const message of ['E se for só eu e minha esposa?','Talvez vá apenas eu e minha esposa',
    'Não irá apenas eu e minha esposa','Não é só eu e minha esposa',
    'Minha irmã disse que vai só eu e minha esposa','Só eu e minha esposa vamos à piscina',
    'Só eu e minha esposa e nossos filhos','Só eu e minha filha','As crianças não vão?',
    'Se as crianças não vão','As crianças não vão para a piscina','Minha irmã disse que as crianças não vão',
    'Não é verdade que as crianças não vão','As crianças vão',
    'São 2 pessoas não 5?','Talvez sejam 2 pessoas não 5','Se somos 2 pessoas não 5',
    'Minha irmã disse que são 2 pessoas não 5','Não são 2 pessoas não 5','Não são 2 pessoas',
    'São 2 pessoas não 2']){
    const r=update(message,previous,now);
    assert.notEqual(r.guests,2,message);assert.deepEqual(r.party,previous,message);
  }
});

test('retirada sem referência suficiente ou com filhos adultos exige esclarecer, sem adivinhar quem fica',()=>{
  for(const old of [undefined,{...previous,children:undefined,ages_months:[]},
    {...previous,total:4,clarification:'party_composition'},
    {...previous,ages_months:[],clarification:'child_ages'},
    {...previous,ages_months:[120,96,240]}]){
    const r=update('As crianças não vão',old,now);
    assert.equal(r.guests,undefined);assert.equal(r.clarification,'party_composition');
  }
  const offspring=update('Os filhos não vão',{...previous,ages_months:[120,96,240]},now);
  checkTwo(offspring);
  const expired=update('As crianças não vão',{...previous,updated_at:now-31*60000},now);
  assert.equal(expired.guests,undefined);assert.equal(expired.clarification,'party_composition');
});

test('mudança só de datas mantém filhos, idades e política de ocupação',()=>{
  const r=update('Quero outro período de 23/09 a 25/09',previous,now);
  assert.equal(r.handled,false);assert.deepEqual(r.party,previous);
  const before=familyAccommodation(seed(),5,now);assert.equal(before.eligible,0);
  const changed=update(literal,previous,now);
  const policy=familyAccommodation({family_party:changed.party,facts:{guests:2,children_pending:false}},2,now);
  assert.equal(policy.eligible,0);assert.equal(policy.pending,false);
});

test('texto e áudio atualizam fatos antes de roteamento, limpam cartão antigo e pedem nova cotação para 2',async()=>{
  for(const message of [literal,'Só eu e meu marido','As crianças não vão','No caso são 2 pessoas não 5']){
    for(const audio of [false,true]){
      const url='https://fixture.invalid/family-replacement.ogg',token='Bearer fixture-only';
      let calls=0;
      const p=audio?await handleConversation({operation:'prepare',user_message:url,state:seed()},token,
        async(input,authorization)=>{calls++;assert.equal(input,url);assert.equal(authorization,token);return message;},now)
        :control({operation:'prepare',user_message:message,state:seed()},now);
      assert.equal(calls,audio?1:0);
      const prepared=JSON.parse(p.state),context=JSON.parse(p.context);
      assert.equal(prepared.facts.guests,2,message);assert.equal(prepared.facts.children_pending,false,message);
      assert.deepEqual(prepared.family_party.ages_months,[],message);
      assert.equal(prepared.pending,undefined,message);assert.equal(prepared.family_clarification,undefined,message);
      assert.equal(context.fatos_informados_pelo_cliente.guests,2,message);
      const r=control({operation:'route',user_message:audio?url:message,state:p.state,
        proposed:'NOQUOTE',ai_response:'Resposta sintética neutra.'},now);
      assert.equal(r.quote_request,'QUOTE|2026-09-18|2026-09-20|2|NONE',message);
      assert.equal(r.can_collect,'NAO',message);assert.equal(r.confirmation_text,'',message);
      assert.equal(JSON.parse(r.state).multi_room,undefined,message);
    }
  }
});
