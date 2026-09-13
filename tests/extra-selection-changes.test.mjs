import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

const bundle=await build({stdin:{contents:`export {control,handleConversation} from './api/conversation-control.ts';export {extraSelectionActions} from './utils/extraSelection.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {control,handleConversation,extraSelectionActions}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const now=Date.parse('2026-09-13T16:00:00-03:00');
const initial=(extras=['MESA'])=>({version:2,history:[],facts:{guests:2,extras,check_in:'2026-09-20',check_out:'2026-09-22'},greeted:true});
function turn(message,state=initial()){
  const p=control({operation:'prepare',user_message:message,state},now);
  const r=control({operation:'route',user_message:message,state:p.state,proposed:'NOQUOTE',ai_response:'Resposta sintética.'},now);
  return {p,r,state:JSON.parse(r.state)};
}
test('troca de extras aplica a ação a cada item, não à mensagem inteira',()=>{
  for(const message of ['Retire a mesa posta e coloque o kit lua de mel.',
    'Pode remover a mesa posta e adicionar o kit lua de mel?',
    'Quero incluir o kit lua de mel e não quero a mesa posta.',
    'Não quero mesa posta, quero o kit lua de mel.',
    'Remova a mesa posta. Inclua o kit lua de mel.']){
    const result=turn(message);assert.deepEqual(result.state.facts.extras,['LUA'],message);
    assert.equal(result.r.quote_request,'QUOTE|2026-09-20|2026-09-22|2|LUA',message);
    assert.deepEqual(JSON.parse(result.p.context).fatos_informados_pelo_cliente.extras,['LUA']);
  }
});
test('incluir um extra com recusa de outro preserva o escolhido',()=>{
  const result=turn('Quero incluir mesa posta e não quero o kit lua de mel.',initial([]));
  assert.deepEqual(result.state.facts.extras,['MESA']);
  assert.equal(result.r.quote_request,'QUOTE|2026-09-20|2026-09-22|2|MESA');
  assert.deepEqual(turn('Quero incluir o kit lua de mel sem o passeio de barco.',initial([])).state.facts.extras,['LUA']);
});
test('listas, comando repetido e ordem das ações preservam escolhas corretas',()=>{
  assert.deepEqual(turn('Quero incluir mesa posta e o kit lua de mel.',initial([])).state.facts.extras,['MESA','LUA']);
  assert.deepEqual(turn('Remova a mesa posta e o kit lua de mel.',initial(['MESA','LUA'])).state.facts.extras,[]);
  assert.deepEqual(turn('Inclua o kit lua de mel e retire a mesa posta.').state.facts.extras,['LUA']);
  assert.deepEqual(turn('Retire a mesa posta e coloque a mesa posta.').state.facts.extras,['MESA']);
  const first=turn('Retire a mesa posta e coloque o kit lua de mel.');
  assert.deepEqual(turn('Retire a mesa posta e coloque o kit lua de mel.',first.r.state).state.facts.extras,['LUA']);
});
test('negação da retirada, hipóteses, preço e fotos não alteram extras',()=>{
  for(const message of ['Não retire a mesa posta.','Não quero remover a mesa posta.',
    'Quanto custa incluir o kit lua de mel?','Posso incluir o kit lua de mel?',
    'Se eu incluir o kit lua de mel, quanto fica?','Quero fotos do kit lua de mel']){
    const result=turn(message);assert.deepEqual(result.state.facts.extras,['MESA'],message);
  }
  assert.deepEqual(extraSelectionActions('Não retire a mesa posta e inclua o kit lua de mel.'),[{code:'LUA',action:'add'}]);
});
test('perguntas de possibilidade e consulta não autorizam inclusão de extras',()=>{
  for(const message of ['É possível incluir o kit lua de mel?',
    'Pode me dizer se adicionar o kit lua de mel é possível?',
    'Vocês conseguem incluir o kit lua de mel?',
    'Pode ver se conseguem incluir o kit lua de mel?',
    'Dá para incluir o kit lua de mel?',
    'Será que pode incluir o kit lua de mel?',
    'Quero saber se vocês podem adicionar o kit lua de mel']){
    assert.deepEqual(extraSelectionActions(message),[],message);
    for(const extras of [[],['MESA']]){
      const result=turn(message,initial(extras));
      assert.deepEqual(result.state.facts,initial(extras).facts,message);
      assert.equal(result.r.quote_request,'NOQUOTE',message);
      assert.equal(result.r.can_collect,'NAO',message);
      assert.equal(result.r.confirmation_text,'',message);
    }
  }
  const directed=turn('Pode remover a mesa posta e adicionar o kit lua de mel?');
  assert.deepEqual(directed.state.facts.extras,['LUA']);
  assert.equal(directed.r.quote_request,'QUOTE|2026-09-20|2026-09-22|2|LUA');
});
test('recusa de inclusão duplicada preserva extra e não bloqueia outro comando afirmativo',()=>{
  for(const message of ['Não precisa adicionar novamente a mesa posta',
    'Não é para incluir novamente a mesa posta',
    'Não quero adicionar a mesa posta de novo',
    'Não adicione outra mesa posta']){
    assert.deepEqual(extraSelectionActions(message),[],message);
    for(const extras of [[],['MESA']]){
      const result=turn(message,initial(extras));
      assert.deepEqual(result.state.facts,initial(extras).facts,message);
      assert.equal(result.r.quote_request,'NOQUOTE',message);
    }
  }
  const coordinated='Não precisa adicionar novamente a mesa posta e adicione o kit lua de mel';
  assert.deepEqual(extraSelectionActions(coordinated),[{code:'LUA',action:'add'}]);
  assert.deepEqual(turn(coordinated).state.facts.extras,['MESA','LUA']);
  assert.deepEqual(turn('Não quero o kit lua de mel',initial(['MESA','LUA'])).state.facts.extras,['MESA']);
  assert.deepEqual(turn('Não quero mesa posta novamente',initial(['MESA','LUA'])).state.facts.extras,['LUA']);
});
test('troca invalida confirmação anterior e áudio preserva escolhas',async()=>{
  const message='Retire a mesa posta e coloque o kit lua de mel.',audio='https://fixture.invalid/extras.ogg';
  const state={...initial(),pending:{quote_id:'old',option:'LOFT'}};
  const p=await handleConversation({operation:'prepare',user_message:audio,state},'',async()=>message,now);
  const r=control({operation:'route',user_message:audio,state:p.state,proposed:'COLETAR',ai_response:'Confirmado.'},now);
  assert.equal(r.quote_request,'QUOTE|2026-09-20|2026-09-22|2|LUA');
  assert.equal(r.can_collect,'NAO');assert.equal(r.confirmation_text,'');
  assert.equal(JSON.parse(r.state).pending,undefined);
});
