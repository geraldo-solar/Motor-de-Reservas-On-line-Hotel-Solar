import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

const bundled=await build({stdin:{contents:`export * from './utils/packageDateRequest.ts';export {control} from './api/conversation-control.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {packageDateRequest,readPackageDateRequest,control}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const now=Date.parse('2026-09-14T15:40:00Z');
const focus={id:'new-year',name:'Réveillon Solar 2027',start_date:'2026-12-31',end_date:'2027-01-03',updated_at:now};
const initial={version:2,history:[],facts:{extras:[]},greeted:true,topic:'package_info',topic_at:now,package_context:focus};
const message='Tem como abrir excessão para o dia 30 a 02?';
function turn(user_message,state=initial,time=now){
  const prepared=control({operation:'prepare',user_message,state},time);
  const routed=control({operation:'route',user_message,state:prepared.state,ai_response:'Já confirmei a reserva.',proposed:'COLETAR'},time);
  return {...routed,state:JSON.parse(routed.state)};
}

test('pedido natural de exceção conserva texto, nunca datas aprovadas ou coleta',()=>{
  const result=turn(message);
  assert.equal(result.state.package_date_request.text,message);
  assert.equal(result.state.package_context.id,focus.id);
  assert.deepEqual(result.state.facts,{extras:[]});
  assert.equal(result.quote_request,'NOQUOTE');assert.equal(result.can_collect,'NAO');
  assert.equal(result.confirmation_text,'');assert.match(result.answer,/depende de avaliação/);
});

test('faixas de idade e recusas não são pedidos de período excepcional',()=>{
  for(const text of ['Tem exceção para crianças de 8 a 10 anos?',
    'Tem exceção para bebês de 8 a 10 meses?',
    'Não precisa abrir exceção de 30/12 a 02/01',
    'Não aceito exceção de 30/12 a 02/01',
    'Quero outra viagem e uma exceção de 30/12 a 02/01',
    'Tem exceção no Natal de 30/12 a 02/01?'])
    assert.equal(packageDateRequest(text,focus,now),undefined,text);
  const asked=turn(message);
  const refused=turn('Não precisa abrir essa exceção',asked.state);
  assert.equal(refused.state.package_date_request,undefined);
});

test('pedido de exceção expira e não migra para outro pacote',()=>{
  const request=packageDateRequest(message,focus,now);
  assert.ok(readPackageDateRequest(request,focus,now));
  assert.equal(readPackageDateRequest(request,{...focus,id:'other'},now),undefined);
  assert.equal(readPackageDateRequest(request,focus,now+31*60000),undefined);
  assert.equal(readPackageDateRequest({...request,at:now+1},focus,now),undefined);
});

test('aceite de encaminhamento é ligado ao turno e nunca vale para outra pergunta sem prepare',()=>{
  const family=turn('Somos um casal mais 3 filhos de 8, 10 e 16 anos');
  assert.equal(family.state.multi_room.status,'offered');
  const accepted=turn('Sim',family.state);
  assert.equal(accepted.quote_request,'HUMANO');
  const other=control({operation:'route',user_message:'O Reserva abre hoje?',state:accepted.state},now);
  assert.notEqual(other.quote_request,'HUMANO');assert.equal(other.can_collect,'NAO');
  assert.equal(JSON.parse(other.state).multi_room,undefined);
});
