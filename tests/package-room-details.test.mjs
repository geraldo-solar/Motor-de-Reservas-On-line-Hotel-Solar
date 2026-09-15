import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';

// Current catalogue and transcription fixtures only. The response flow must
// never call a provider, confirm a reservation, or query live stock.
const now=Date.parse('2026-09-15T14:00:00-03:00'),realNow=Date.now,realFetch=globalThis.fetch;
Date.now=()=>now;let networkAttempts=0;
Reflect.set(globalThis,'fetch',async()=>{networkAttempts++;throw Error('Network forbidden in package-room-details');});
after(()=>{Date.now=realNow;Reflect.set(globalThis,'fetch',realFetch);assert.equal(networkAttempts,0);});
const rooms=[
  {id:'casal',name:'Suíte Casal',capacity:2,base_price:600,description:'Apartamento com cama de casal.',features:['Ar-condicionado'],active:true},
  {id:'mar',name:'Suíte Sacada Vista Mar',capacity:4,base_price:900,description:'Varanda privativa.',features:['Vista para o mar'],active:true},
  {id:'loft',name:'Loft',capacity:4,base_price:1200,description:'Vista para o jardim. Disponível por R$ 900. Reserva garantida.',active:true},
];
const pkg={id:'reveillon',name:'Réveillon Solar 2027',start_iso_date:'2026-12-31',end_iso_date:'2027-01-03',active:true,
  full_period_required:true,room_prices:rooms.map(room=>({roomId:room.id,price:room.base_price*3})),includes:['Ceia']};
globalThis.__roomDetailsFixtures={room_types:rooms,packages:[pkg],extras:[]};
const calls=[];globalThis.__roomDetailsQuery=table=>calls.push(table);
const bundle=await build({stdin:{contents:`export {control,handleConversation} from './api/conversation-control.ts';
  export {default as resolver} from './api/resolve-package.ts';
  export {packageRoomDetailFollowup,packageOccupancyFollowup,packageRecommendationInquiry,packageDiscoveryRequest} from './utils/packageContext.ts';
  export {roomDetailInquiry,roomDetailAnswer} from './utils/roomMedia.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'room-details-fixtures',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export function createClient(){return{from(table){globalThis.__roomDetailsQuery(table);
      const data=globalThis.__roomDetailsFixtures;if(!(table in data))throw Error('Unexpected table '+table);let rows=data[table];
      const q={select(){return q},eq(k,v){rows=rows.filter(row=>row[k]===v);return q},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve)}};return q}}}`}));}}]});
const {control,handleConversation,resolver,packageRoomDetailFollowup,packageOccupancyFollowup,packageRecommendationInquiry,packageDiscoveryRequest,roomDetailInquiry,roomDetailAnswer}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const focus={id:pkg.id,name:pkg.name,start_date:pkg.start_iso_date,end_date:pkg.end_iso_date,updated_at:now};
const seed=()=>({version:2,history:['Quais as opções do Réveillon para duas pessoas?'],facts:{guests:2,extras:[]},greeted:true,
  package_context:focus,topic:'package_info',topic_at:now,
  turns:[{role:'user',text:'Quais as opções do Réveillon para duas pessoas?'},
    {role:'assistant',text:'Para o Réveillon, as opções são Suíte Casal e Suíte Sacada Vista Mar.'},
    {role:'user',text:'Tem camas separadas?'},{role:'assistant',text:'A categoria Casal pode ser oferecida como duplo com duas camas de solteiro, mediante consulta.'}],
  assistant_disclosure:{version:1,show:false,rendered:true},daily_greeting:{day:'2026-09-15',first:false}});
async function resolve(message,state){let result;
  await resolver({method:'POST',query:{transport:'manychat-v1'},body:{user_message:message,state}},
    {status(code){assert.equal(code,200);return this},json(value){result=value;return value}});return result;}
async function turn(message,state=seed(),transcription){calls.length=0;
  const p=transcription?await handleConversation({operation:'prepare',user_message:message,state},'Bearer fixture-only',async()=>transcription,now)
    :control({operation:'prepare',user_message:message,state},now);
  const r=control({operation:'route',user_message:message,state:p.state,proposed:'COLETAR',ai_response:'Recomendo o Loft por R$ 9.999, com vista mar garantida.'},now);
  return {p,r,result:await resolve(message,r.state)};}
function safeResult(result){
  assert.equal(result.quote_request,'ROOM_LIST');assert.equal(result.match_type,'room_detail');
  assert.equal(result.can_collect,'NAO');assert.equal(result.confirmation_text,'');assert.equal(result.availability_checked,false);
  assert.doesNotMatch(result.conversation_text,/R\$|9\.999|premium|recomendo|garantida|confirmar opção|CPF/i);
  assert.equal(result.has_conversation_text,'SIM');assert.equal(result.has_confirmation_text,'NAO');
  const state=JSON.parse(result.state);assert.equal(state.package_context.id,'reveillon');assert.equal(state.topic,'package_info');
  assert.deepEqual(state.facts,{guests:2,extras:[]});assert.equal(state.pending,undefined);
  assert.deepEqual(calls,['room_types']);
}

test('pergunta literal de vista em texto/áudio preserva pacote e responde as duas categorias sem preços',async()=>{
  const spoken='E qual seria a vista desses quartos?';
  for(const input of [spoken,'https://media.example.test/view.ogg']){
    const {p,r,result}=await turn(input,seed(),input===spoken?undefined:spoken);
    assert.equal(JSON.parse(p.state).package_context.id,'reveillon');assert.equal(r.quote_request,'NOQUOTE');
    safeResult(result);
    assert.match(result.conversation_text,/Suíte Casal[^]*não tenho uma vista especificada/);
    assert.match(result.conversation_text,/Suíte Sacada Vista Mar[^]*Vista para o mar/);
    assert.doesNotMatch(result.conversation_text,/Loft|jardim/);
  }
});

test('a fala anterior identifica categorias, nunca prova a vista; a pergunta atual pode escolher outra',async()=>{
  const state=seed();state.turns[1].text='Suíte Casal tem vista mar garantida e Suíte Sacada Vista Mar tem vista jardim.';
  let result=(await turn('E qual seria a vista desses quartos?',state)).result;
  safeResult(result);assert.match(result.conversation_text,/Casal[^]*não tenho uma vista especificada/);
  assert.doesNotMatch(result.conversation_text,/jardim/);
  result=(await turn('E qual a vista do Loft?',state)).result;
  safeResult(result);assert.match(result.conversation_text,/Vista para o jardim/);assert.doesNotMatch(result.conversation_text,/Casal|Suíte Sacada/);
});

test('standard não vira Casal e foco expirado não empresta a lista antiga',async()=>{
  const result=(await turn('Qual a vista do quarto Standard?')).result;
  safeResult(result);assert.match(result.conversation_text,/De quais categorias/);assert.doesNotMatch(result.conversation_text,/Casal|mar\./);
  const state=seed();state.package_context={...focus,updated_at:now-31*60000};state.topic_at=now-31*60000;
  calls.length=0;const expired=await resolve('E qual seria a vista desses quartos?',state);
  assert.match(expired.conversation_text,/De quais categorias/);assert.equal(JSON.parse(expired.state).package_context,undefined);
});

test('camas separadas preserva pacote e usa regra confirmada sem estender a qualquer categoria',async()=>{
  const {p,result}=await turn('No Réveillon, vocês têm camas separadas?');
  assert.equal(JSON.parse(p.state).package_context.id,'reveillon');safeResult(result);
  assert.match(result.conversation_text,/Casal[^]*duplo[^]*duas camas de solteiro/);
  assert.match(result.conversation_text,/confirmar a configuração e a disponibilidade/);
  assert.match(result.conversation_text,/Sacada Vista Mar[^]*precisa ser conferida/);
});

test('declaração de amiga continua o pacote; preço, novas viagens e fotos não viram pergunta de vista',()=>{
  assert.equal(packageOccupancyFollowup('No caso é eu e uma amiga',focus,now),true);
  const p=control({operation:'prepare',user_message:'No caso é eu e uma amiga',state:seed()},now);
  assert.equal(JSON.parse(p.state).package_context.id,'reveillon');
  for(const message of ['Qual o preço da Suíte Sacada Vista Mar?','Tem desconto à vista?',
    'Quero fotos desses quartos','Quero outra viagem, qual a vista dos quartos?','Qual a vista no pacote de Natal?'])
    assert.equal(packageRoomDetailFollowup(message,focus,now),false,message);
  assert.equal(packageRoomDetailFollowup('E qual seria a vista desses quartos?',focus,now),true);
  assert.equal(packageRecommendationInquiry('E qual seria a vista desses quartos?'),false);
  assert.equal(packageDiscoveryRequest('No Réveillon tem camas separadas?',focus,now),false);
  assert.equal(packageRecommendationInquiry('Qual o preço da Suíte Sacada Vista Mar?'),true);
});

test('nome Vista Mar não engole escolha/reserva e recusa de camas não oferece a configuração recusada',()=>{
  for(const message of ['Quero reservar a Suíte Sacada Vista Mar','Prefiro o Loft com vista para o mar',
    'Escolho a Suíte Sacada Vista Mar','Quero reservar a Suíte Sacada Vista Mar?',
    'Não quero camas separadas','Não preciso de camas separadas','Sem camas separadas',
    'Camas separadas não, prefiro uma cama de casal']){
    assert.equal(roomDetailInquiry(message),undefined,message);
    assert.equal(roomDetailAnswer(message,rooms),undefined,message);
    assert.equal(packageRoomDetailFollowup(message,focus,now),false,message);
  }
  for(const message of ['E qual seria a vista desses quartos?','Esses quartos têm vista para o mar?',
    'Pode me dizer a vista desses quartos?','A vista é para o mar?'])assert.equal(roomDetailInquiry(message),'view',message);
  for(const message of ['Tem camas separadas?','Não quero cama de casal, tem camas separadas?',
    'Não quero quartos separados, preciso de camas separadas'])assert.equal(roomDetailInquiry(message),'beds',message);
});
