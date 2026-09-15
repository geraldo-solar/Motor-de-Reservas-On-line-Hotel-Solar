import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';

// All inputs and the audio transcription are synthetic. No provider or DB is
// needed to recognize the occupants, and no booking/send operation is called.
const originalFetch=globalThis.fetch;
Reflect.set(globalThis,'fetch',async()=>{throw Error('Unexpected network in family friend test');});
after(()=>Reflect.set(globalThis,'fetch',originalFetch));
const bundle=await build({stdin:{contents:`export {updateFamilyParty,readFamilyParty} from './utils/familyParty.ts';
  export {control,handleConversation} from './api/conversation-control.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm'});
const {updateFamilyParty:update,readFamilyParty,control,handleConversation}=await import(
  'data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const now=Date.parse('2026-09-15T16:00:00-03:00');
const old={adults:2,children:3,total:5,age_subject:'offspring',ages_months:[96,120,192],updated_at:now};
const literal='No caso é eu e uma amiga';

function twoPeople(result){
  assert.equal(result.handled,true);assert.equal(result.guests,2);
  assert.equal(result.party.total,2);assert.equal(result.children_pending,false);
  assert.deepEqual(result.party.ages_months,[]);
  assert.equal(result.party.age_subject,undefined);assert.equal(result.clarification,undefined);
  assert.equal(result.party.adults,undefined);assert.equal(result.party.children,undefined);
  assert.deepEqual(readFamilyParty(result.party,now),result.party);
  assert.deepEqual(Object.keys(result.party).sort(),['ages_months','last_message_hash','total','updated_at']);
}

test('eu e amiga ou amigo declaram duas pessoas sem vínculo romântico ou idade presumida',()=>{
  for(const message of [literal,'No caso, é eu e uma amiga.','Eu e uma amiga','Eu e um amigo',
    'Só eu e uma amiga','Agora somos eu e minha amiga','No nosso caso, seremos eu e o meu amigo',
    'Desta vez, iremos apenas eu e uma amiga.','Eu e a minha amiga somente','Irei eu e uma amiga']){
    for(const previous of [undefined,old,{...old,ages_months:[],clarification:'child_ages'}]){
      const result=update(message,previous,now);twoPeople(result);
      assert.deepEqual(update(message,result.party,now+1000),result,message);
    }
  }
});

test('substituição completa limpa apenas ocupantes anteriores, inclusive quando o contexto expirou',()=>{
  const withHash={...old,applied_increment_hashes:['a'.repeat(64)]};
  twoPeople(update(literal,withHash,now));
  twoPeople(update(literal,{...old,updated_at:now-31*60000},now));
  assert.deepEqual(old.ages_months,[96,120,192]);
});

test('perguntas, hipóteses, relato de terceiros e adições não apagam os demais hóspedes',()=>{
  for(const message of ['No caso é eu e uma amiga?','E se for eu e uma amiga?',
    'Talvez vá eu e uma amiga','No caso seria eu e uma amiga','Se for só eu e uma amiga',
    'Não é eu e uma amiga','Não vamos só eu e uma amiga','Minha irmã disse que é eu e uma amiga',
    'Ela disse: eu e uma amiga','Eu e uma amiga vamos à piscina','Só eu e uma amiga para o jantar',
    'E mais uma amiga','Vai mais uma amiga','Agora vai eu e mais uma amiga',
    'Inclua uma amiga','Eu e uma amiga e nossos filhos','Eu e uma amiga ou meu marido',
    'Eu e uma amiga e uma pessoa']){
    const result=update(message,old,now);
    assert.notEqual(result.guests,2,message);
    // If another existing parser requests clarification, the old people must
    // still not have been replaced by an invented two-person family.
    assert.notEqual(result.party?.total,2,message);
    assert.deepEqual(result.party?.ages_months,old.ages_months,message);
  }
});

test('prepare texto e áudio expõe duas pessoas e invalida o cartão antigo sem escolher categoria',async()=>{
  const state={version:2,history:[],facts:{guests:5,check_in:'2026-09-18',check_out:'2026-09-20',extras:[],children_pending:false},
    family_party:old,pending:{quote_id:'old-quote-fixture',option:'Suíte Triplo'},greeted:true,
    assistant_disclosure:{version:1,show:false,rendered:true}};
  for(const audio of [false,true]){
    const user_message=audio?'https://fixture.invalid/friend.ogg':literal;
    const input={operation:'prepare',user_message,state};
    const prepared=audio?await handleConversation(input,'',async()=>literal,now):control(input,now);
    const current=JSON.parse(prepared.state),context=JSON.parse(prepared.context);
    assert.equal(current.facts.guests,2);assert.equal(current.facts.children_pending,false);
    assert.deepEqual(current.family_party.ages_months,[]);assert.equal(current.family_party.adults,undefined);
    assert.equal(current.family_party.children,undefined);assert.equal(current.family_party.age_subject,undefined);
    assert.equal(current.pending,undefined);assert.equal(current.multi_room,undefined);
    assert.equal(context.fatos_informados_pelo_cliente.guests,2);
    assert.equal(current.facts.check_in,state.facts.check_in);assert.equal(current.facts.check_out,state.facts.check_out);
    assert.deepEqual(current.facts.extras,[]);
    const routed=control({operation:'route',user_message,state:prepared.state,
      proposed:'NOQUOTE',ai_response:'Resposta neutra de fixture.'},now);
    assert.equal(routed.quote_request,'QUOTE|2026-09-18|2026-09-20|2|NONE');
    assert.equal(routed.can_collect,'NAO');assert.equal(routed.confirmation_text,'');
    assert.equal(JSON.parse(routed.state).pending,undefined);
  }
});
