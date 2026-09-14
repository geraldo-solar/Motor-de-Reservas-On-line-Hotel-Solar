import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';

// In-memory source of catalog truth. No production/model/WhatsApp calls.
const now=Date.parse('2026-09-14T14:00:00-03:00'),realNow=Date.now;
Date.now=()=>now;after(()=>{Date.now=realNow;});
const calls=[];
const packages=[
  {id:'past',name:'Independência encerrada',start_iso_date:'2026-09-04',end_iso_date:'2026-09-07',active:true},
  {id:'ongoing',name:'Semana Solar em andamento',start_iso_date:'2026-09-12',end_iso_date:'2026-09-16',active:true},
  {id:'inactive',name:'Especial inativo',start_iso_date:'2026-09-18',end_iso_date:'2026-09-20',active:false},
  {id:'invalid',name:'Cadastro com data inválida',start_iso_date:'2026-09-31',end_iso_date:'2026-10-02',active:true},
  {id:'children',name:'Dia das Crianças Solar',start_iso_date:'2026-10-10',end_iso_date:'2026-10-12',active:true},
  {id:'finados',name:'Finados Solar',start_iso_date:'2026-10-30',end_iso_date:'2026-11-02',active:true},
  {id:'reveillon',name:'Réveillon Solar 2027',start_iso_date:'2026-12-31',end_iso_date:'2027-01-03',active:true},
];
const rooms=[{id:'casal',name:'Casal',capacity:2,active:true},{id:'triplo',name:'Triplo',capacity:3,active:true}];
globalThis.__topicSwitchData={packages,room_types:rooms,extras:[]};
globalThis.__topicSwitchQuery=table=>calls.push(table);
const bundle=await build({stdin:{contents:`export {control} from './api/conversation-control.ts';
  export {default as resolver} from './api/resolve-package.ts';
  export {multiRoomKey,multiRoomOfferText} from './utils/multiRoomHandoff.ts';
  export {packageDiscoveryRequest} from './utils/packageContext.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'fixture-only',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export function createClient(){return{from(table){
      globalThis.__topicSwitchQuery(table);const data=globalThis.__topicSwitchData;if(!(table in data))throw Error('Unexpected table '+table);
      return{select(){let rows=data[table];const q={eq(k,v){rows=rows.filter(x=>x[k]===v);return q},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve)}};return q}}}}}`}));
  }}]});
const {control,resolver,multiRoomKey,multiRoomOfferText,packageDiscoveryRequest}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const question='Qual é o próximo feriado que vai ter que vai ter algum pacote especial de hospedagem?';
function seed(){
  const message='Somos 2 adultos e 3 filhos de 10, 8 e 16 anos, de 18/09 a 20/09';
  const state={version:2,history:[message],resolved_message:message,
    facts:{guests:5,children_pending:false,extras:['MESA'],check_in:'2026-09-18',check_out:'2026-09-20'},greeted:true,
    family_party:{adults:2,children:3,total:5,age_subject:'offspring',ages_months:[120,96,192],updated_at:now},
    assistant_disclosure:{version:1,show:false,rendered:true},daily_greeting:{day:'2026-09-14',first:false}};
  state.multi_room={at:now,key:multiRoomKey(state,now),status:'offered'};
  state.turns=[{role:'user',text:message},{role:'assistant',text:multiRoomOfferText(state)}];
  return state;
}
function fixtures(rows=packages){calls.length=0;globalThis.__topicSwitchData={packages:rows,room_types:rooms,extras:[]};}
async function resolve(message,state){let result;
  await resolver({method:'POST',body:{user_message:message,state},query:{}},
    {status(code){assert.equal(code,200);return this},json(value){result=value;return value}});return result;
}
async function turn(message,state=seed()){
  const p=control({operation:'prepare',user_message:message,state},now);
  const r=control({operation:'route',user_message:message,state:p.state,proposed:'NOQUOTE',ai_response:'Vou consultar os pacotes cadastrados.'},now);
  const result=await resolve(message,r.state);return {p,r,result,state:JSON.parse(result.state||r.state)};
}
function cleanTrip(state){
  assert.equal(state.facts.guests,5);assert.deepEqual(state.family_party.ages_months,[120,96,192]);
  assert.equal(state.facts.check_in,undefined);assert.equal(state.facts.check_out,undefined);
  assert.deepEqual(state.facts.extras,[]);assert.equal(state.multi_room,undefined);assert.equal(state.pending,undefined);
}

test('após oferta de dois apartamentos, pergunta atual consulta o próximo pacote cadastrado',async()=>{
  fixtures();const result=await turn(question);
  assert.equal(result.r.quote_request,'NOQUOTE');
  assert.doesNotMatch(result.r.answer,/precisarao de dois|Posso chamar a equipe/i);
  assert.equal(result.result.quote_request,'PACKAGE_ID|children');
  assert.equal(result.result.match_type,'next_package');
  assert.match(result.result.conversation_text,/próximo pacote cadastrado/);
  assert.match(result.result.conversation_text,/Dia das Crianças Solar/);
  assert.doesNotMatch(result.result.conversation_text,/Independência encerrada|Semana Solar em andamento|inativo|inválida|18\/09|20\/09|Posso chamar a equipe/);
  assert.equal(result.state.package_context.id,'children');cleanTrip(result.state);
  assert.ok(calls.includes('packages'));assert.equal(result.result.availability_checked,false);
});

test('resolver direto com handoff antigo não restaura datas nem encobre nova pergunta',async()=>{
  fixtures();const result=await resolve(question,seed());
  assert.equal(result.quote_request,'PACKAGE_ID|children');
  const state=JSON.parse(result.state);assert.equal(state.package_context.id,'children');cleanTrip(state);
  assert.ok(calls.includes('packages'));assert.doesNotMatch(result.conversation_text,/Posso chamar a equipe/);
});

test('lista nova exclui cadastros encerrados/inválidos e não usa a viagem anterior',async()=>{
  fixtures();const result=await turn('Quais pacotes de hospedagem vocês têm?');
  assert.equal(result.result.quote_request,'PACKAGE_LIST');
  assert.match(result.result.conversation_text,/Dia das Crianças Solar/);
  assert.match(result.result.conversation_text,/Finados Solar/);
  assert.doesNotMatch(result.result.conversation_text,/Independência encerrada|inválida|inativo/);
  cleanTrip(result.state);assert.equal(result.state.package_context,undefined);
});

test('próximo é cronológico e empate de início pede escolha em vez de escolher arbitrariamente',async()=>{
  fixtures([...packages,{id:'children-alt',name:'Especial Família Outubro',start_iso_date:'2026-10-10',end_iso_date:'2026-10-13',active:true}]);
  const result=await turn(question);
  assert.equal(result.result.quote_request,'PACKAGE_LIST');assert.equal(result.result.match_type,'next_package_list');
  assert.match(result.result.conversation_text,/Dia das Crianças Solar/);
  assert.match(result.result.conversation_text,/Especial Família Outubro/);
  assert.doesNotMatch(result.result.conversation_text,/Finados Solar|Réveillon Solar/);
  assert.equal(result.state.package_context,undefined);cleanTrip(result.state);
});

test('sem período futuro válido não inventa próximo pacote nem volta ao handoff',async()=>{
  fixtures(packages.filter(pkg=>['past','ongoing','inactive','invalid'].includes(pkg.id)));
  const result=await turn(question);
  assert.equal(result.result.quote_request,'ROOM_LIST');assert.equal(result.result.match_type,'next_package_unavailable');
  assert.match(result.result.conversation_text,/Não encontrei um próximo pacote/);
  assert.doesNotMatch(result.result.conversation_text,/Posso chamar a equipe|precisarão de dois/);
  cleanTrip(result.state);
});

test('orientação casal mais triplo responde distribuição sem catálogo nem autorização de encaminhamento',async()=>{
  fixtures();const result=await turn('Então seria um casal e um triplo?');
  assert.equal(result.result.quote_request,'ROOM_LIST');assert.equal(result.result.match_type,'multi_room_guidance');
  assert.match(result.result.conversation_text,/casal/i);assert.match(result.result.conversation_text,/triplo/i);
  assert.doesNotMatch(result.result.conversation_text,/R\$|Posso chamar|encaminhei|reservad/i);
  assert.equal(result.state.multi_room,undefined);assert.equal(result.result.can_collect,'NAO');
  assert.deepEqual(calls,[]);
});

test('pedido de quartos junto de orientação mantém o encaminhamento autorizado pelo controller',async()=>{
  for(const message of ['Preciso de 2 quartos. Como dividir?',
    'Queria dois apartamentos, como você recomenda distribuir?',
    'Preciso de 2 quartos para o próximo feriado, qual pacote vocês têm?']){
    fixtures();const result=await turn(message);
    assert.equal(result.r.quote_request,'HUMANO',message);
    assert.equal(result.result.quote_request,'HUMANO',message);
    assert.equal(result.result.match_type,'multi_room_handoff',message);
    assert.match(result.result.conversation_text,/vou chamar|encaminh/i,message);
    assert.equal(result.result.availability_checked,false);
    assert.deepEqual(calls,[]);
    fixtures();const direct=await resolve(message,seed());
    assert.equal(direct.quote_request,'HUMANO',message);
    assert.equal(direct.match_type,'multi_room_handoff',message);
    assert.match(direct.conversation_text,/vou chamar|encaminh/i,message);
    assert.deepEqual(calls,[]);
  }
});

test('Sim continua aceitando oferta atual; perguntas de capacidade/fotos/inclusões não são descoberta',async()=>{
  fixtures();const result=await turn('Sim');
  assert.equal(result.result.quote_request,'HUMANO');assert.deepEqual(calls,[]);
  const focus={id:'reveillon',name:'Réveillon Solar 2027',start_date:'2026-12-31',end_date:'2027-01-03',updated_at:now};
  for(const message of ['No Réveillon somos 5 pessoas, cabem em um apartamento?',
    'No Réveillon a ceia está inclusa?','Qual o preço desse pacote?','Quero fotos dos quartos para o próximo feriado',
    'No próximo feriado, qual o cardápio do Reserva Solar?','Não quero outro pacote',
    'Qual o telefone para informações do Réveillon?',
    'Como posso ligar para informações do próximo pacote?',
    'Qual o horário do café no próximo feriado?',
    'Qual o horário de check-in no pacote de Réveillon?',
    'No Réveillon tem Wi-Fi?',
    'Tem estacionamento no próximo feriado?',
    'Tenho uma reserva para o próximo feriado',
    'Quero conferir minha reserva do Réveillon',
    'Quero falar com a recepção sobre o próximo pacote'])
    assert.equal(packageDiscoveryRequest(message,focus,now),false,message);
  for(const message of [question,'Quais pacotes de hospedagem vocês têm?','Quero conhecer outros pacotes','E o pacote de Natal?'])
    assert.equal(packageDiscoveryRequest(message,focus,now),true,message);
});
