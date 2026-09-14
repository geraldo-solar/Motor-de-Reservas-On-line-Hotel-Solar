import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

const bundle=await build({stdin:{contents:`export {control,handleConversation} from './api/conversation-control.ts';
  export {multiRoomGuidanceRequest,multiRoomGuidanceText} from './utils/multiRoomHandoff.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm'});
const {control,handleConversation,multiRoomGuidanceRequest,multiRoomGuidanceText}=await import(
  'data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const now=Date.parse('2026-09-14T15:53:00-03:00');
const initial={version:2,history:[],facts:{extras:[]},greeted:true,
  assistant_disclosure:{version:1,show:false,rendered:true}};
function turn(message,state=initial,time=now){
  const prepared=control({operation:'prepare',user_message:message,state},time);
  const routed=control({operation:'route',user_message:message,state:prepared.state,
    proposed:'QUOTE|2026-09-18|2026-09-20|5|NONE',ai_response:'Já reservei os dois apartamentos por R$100.'},time);
  return {prepared,routed,state:JSON.parse(routed.state)};
}
function family(youngest=8){
  return turn(`Quero hospedagem de 18/09 a 20/09 para cinco pessoas: um casal e três filhos de ${youngest}, 10 e 16 anos.`).state;
}
function guidance(result){
  assert.equal(result.routed.quote_request,'NOQUOTE');
  assert.equal(result.routed.can_collect,'NAO');
  assert.equal(result.routed.confirmation_text,'');
  assert.match(result.routed.answer,/Casal.*2 pessoas.*Triplo.*3 pessoas/s);
  assert.match(result.routed.answer,/recepção.*confirmar.*camas.*disponibilidade.*valores/s);
  assert.doesNotMatch(result.routed.answer,/Já reservei|R\$|Posso chamar|Vou chamar|Encaminhei/);
  assert.equal(result.state.pending,undefined);
  assert.equal(result.state.multi_room,undefined);
  assert.equal(result.state.facts.guests,5);
  assert.deepEqual(result.state.family_party.ages_months,[96,120,192]);
}

test('perguntas de distribuição são respondidas antes do encaminhamento, sem repetir o convite',()=>{
  for(const message of ['O que você me indica distribuir?','Vc indica como?',
    'O que você me indicaria para comportar todos nós?',
    'Como podemos dividir a família nos apartamentos?',
    'Pode ser um apto de casal e um triplo?','Poderia ser um duplo e um triplo']){
    const previous=family();assert.equal(previous.multi_room.status,'offered');
    const result=turn(message,previous);guidance(result);
    assert.equal(result.state.facts.check_in,'2026-09-18');
    assert.equal(result.state.facts.check_out,'2026-09-20');
  }
});

test('a orientação sobre capacidade não depende de escolher datas nem consulta preço',()=>{
  const state=family();delete state.facts.check_in;delete state.facts.check_out;delete state.multi_room;
  const result=turn('Pode ser um apto de casal e um triplo?',state);guidance(result);
  assert.equal(result.state.facts.check_in,undefined);
  assert.equal(result.state.facts.check_out,undefined);
});

test('áudio de recomendação conserva a resposta informativa e não converte orientação em consentimento',async()=>{
  const source='https://fixture.invalid/distribution.ogg';
  const message='O que você me indicaria para comportar todos nós?';
  const prepared=await handleConversation({operation:'prepare',user_message:source,state:family()},'',async()=>message,now);
  const routed=control({operation:'route',user_message:source,state:prepared.state,proposed:'HUMANO',ai_response:'Vou chamar.'},now);
  guidance({routed,state:JSON.parse(routed.state)});
  const next=turn('Sim',routed.state);
  assert.notEqual(next.routed.quote_request,'HUMANO');
  assert.notEqual(next.state.multi_room?.status,'accepted');
});

test('orientação mantém o pacote corrente, mas não uma antiga autorização de encaminhamento',()=>{
  const state=family();state.package_context={id:'reveillon',name:'Réveillon Solar 2027',
    start_date:'2026-12-31',end_date:'2027-01-03',updated_at:now};
  state.topic='package_info';state.topic_at=now;
  const result=turn('Pode ser um apto de casal e um triplo?',state);guidance(result);
  assert.equal(result.state.package_context.id,'reveillon');
  const confirmation=control({operation:'confirm',state:result.state,
    user_message:'Pode ser um apto de casal e um triplo?'},now);
  assert.equal(confirmation.can_collect,'NAO');assert.equal(confirmation.quote_request,'NOQUOTE');
});

test('criança elegível não obriga dividir; idade desconhecida não permite afirmar a configuração',()=>{
  const optional=turn('Pode ser um apto de casal e um triplo?',family(6));
  assert.equal(optional.routed.quote_request,'NOQUOTE');
  assert.match(optional.routed.answer,/Dividir é opcional.*4 pessoas mais 1 criança/s);
  assert.equal(optional.state.multi_room,undefined);
  const unknown=family();unknown.family_party.ages_months=[120,192];unknown.facts.children_pending=true;
  const pending=turn('Pode ser um apto de casal e um triplo?',unknown);
  assert.match(pending.routed.answer,/idades/);
  assert.doesNotMatch(pending.routed.answer,/Sim, em termos de capacidade/);
  assert.equal(pending.routed.can_collect,'NAO');
});

test('Sim só aceita a oferta fresca: pergunta informativa, expiração e dados novos não são aceite',()=>{
  const offer=family();assert.equal(offer.multi_room.status,'offered');
  assert.equal(turn('Sim',offer).routed.quote_request,'HUMANO');
  assert.notEqual(turn('Sim',offer,now+31*60000).routed.quote_request,'HUMANO');
  const changed=structuredClone(offer);changed.family_party.ages_months=[84,120,192];
  assert.notEqual(turn('Sim',changed).routed.quote_request,'HUMANO');
  for(const message of ['Vc indica como?','Pode ser um apto de casal e um triplo?',
    'Qual o telefone do hotel?','Pode mandar fotos?','Não precisa chamar']){
    const info=turn(message,offer);
    assert.notEqual(info.routed.quote_request,'HUMANO',message);
    assert.notEqual(turn('Sim',info.state).routed.quote_request,'HUMANO',message);
  }
});

test('pergunta nova sobre feriado não herda encaminhamento nem datas, mesmo sem prepare',()=>{
  const message='Qual é o próximo feriado que vai ter que vai ter algum pacote especial de hospedagem?';
  for(const operation of ['route','confirm']){
    const result=control({operation,user_message:message,state:family(),proposed:'COLETAR',ai_response:'Dois apartamentos.'},now);
    const state=JSON.parse(result.state);
    assert.equal(result.quote_request,'NOQUOTE');assert.equal(result.can_collect,'NAO');
    assert.equal(state.facts.check_in,undefined);assert.equal(state.facts.check_out,undefined);
    assert.equal(state.multi_room,undefined);assert.equal(state.facts.guests,5);
    assert.deepEqual(state.family_party.ages_months,[96,120,192]);
    assert.doesNotMatch(result.answer,/dois apartamentos/i);
  }
});

test('pedido explícito de recepção ainda chama humano depois da orientação',()=>{
  const info=turn('Vc indica como?',family());
  const accepted=turn('Pode chamar a recepção',info.state);
  assert.equal(accepted.routed.quote_request,'HUMANO');
  assert.equal(accepted.routed.can_collect,'NAO');
});

test('outros assuntos e preços não recebem recomendação fixa de quartos',()=>{
  for(const message of ['Qual o próximo pacote de hospedagem?', 'Qual passeio você indica?',
    'Tem fotos do casal e do triplo?', 'Qual o preço de um casal e um triplo?',
    'Quero reservar um casal e um triplo', 'Qual restaurante indica para a família?']){
    assert.equal(multiRoomGuidanceRequest(message),false,message);
    assert.equal(multiRoomGuidanceText(family(),message,now),undefined,message);
  }
});
