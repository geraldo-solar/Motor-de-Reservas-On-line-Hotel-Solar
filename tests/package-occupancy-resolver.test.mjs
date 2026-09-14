import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';

// Synthetic conversation only: no model, live database, media or handoff.
const now=Date.parse('2026-09-14T16:00:00-03:00'),realNow=Date.now;
Date.now=()=>now;after(()=>{Date.now=realNow;});
const calls=[];globalThis.__packageOccupancyQuery=table=>calls.push(table);
const pkg={id:'reveillon',name:'Réveillon Solar 2027',start_iso_date:'2026-12-31',end_iso_date:'2027-01-03',
  includes:['Café da manhã'],benefits:[],room_prices:[],full_period_required:true,active:true};
const rooms=[{id:'casal',name:'Suíte Casal',capacity:2,active:true},{id:'quadruplo',name:'Suíte Família',capacity:4,active:true}];
const bundle=await build({stdin:{contents:`export {control} from './api/conversation-control.ts';
  export {default as resolver} from './api/resolve-package.ts';
  export {packageOccupancyFollowup} from './utils/packageContext.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'occupancy-fixture',setup(b){
    b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const data=${JSON.stringify({packages:[pkg],room_types:rooms,extras:[]})};
      export function createClient(){return{from(table){globalThis.__packageOccupancyQuery(table);if(!(table in data))throw Error('Unexpected table');return{select(){let rows=data[table];const q={eq(k,v){rows=rows.filter(x=>x[k]===v);return q},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve)}};return q}}}}}`}));
  }}]});
const {control,resolver,packageOccupancyFollowup}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const focus={id:pkg.id,name:pkg.name,start_date:pkg.start_iso_date,end_date:pkg.end_iso_date,updated_at:now};
const initial={version:2,history:[],facts:{extras:[]},greeted:true,topic:'package_info',topic_at:now,package_context:focus,
  assistant_disclosure:{version:1,show:false,rendered:true},daily_greeting:{day:'2026-09-14',first:false}};
async function resolve(message,state,operation){
  let result;await resolver({method:'POST',body:{user_message:message,state},query:operation?{operation}:{}},
    {status(code){assert.equal(code,200);return this},json(value){result=value;return value}});
  return result;
}
async function turn(message,state=initial){
  const p=control({operation:'prepare',user_message:message,state},now);
  const r=control({operation:'route',user_message:message,state:p.state,proposed:'NOQUOTE',ai_response:'Informação genérica sintética do pacote.'},now);
  const result=await resolve(message,r.state);
  return {p,r,result,state:JSON.parse(result.state||r.state)};
}

test('nome do Réveillon não transforma pergunta específica de família em novo catálogo',async()=>{
  calls.length=0;
  const message='No meu caso para o réveillon somos 5 pessoas, eu, minha esposa e 3 filhos. Dão todos em um apto?';
  const result=await turn(message);
  assert.equal(result.result.quote_request,'ROOM_LIST');
  assert.equal(result.result.match_type,'package_followup');
  assert.match(result.result.conversation_text,/idades/);
  assert.doesNotMatch(result.result.conversation_text,/R\$|PACKAGE_ID|de 31\/12\/2026 a 03\/01\/2027/);
  assert.equal(result.state.package_context.id,'reveillon');
  assert.equal(result.state.facts.check_in,undefined);
  assert.equal(result.state.facts.check_out,undefined);
  assert.equal(result.result.can_collect,'NAO');
  assert.deepEqual(calls,[]);
});

test('continuação curta de idades preserva foco e usa a oferta multi-apartamentos do controller',async()=>{
  calls.length=0;
  const first=await turn('No Réveillon somos 5 pessoas: 2 adultos e 3 crianças. Cabem em um apartamento?');
  const next=await turn('8, 10 e 16',first.state);
  assert.equal(next.result.quote_request,'ROOM_LIST');
  assert.match(next.result.conversation_text,/dois apartamentos|dividir o grupo/);
  assert.match(next.result.conversation_text,/Posso chamar/);
  assert.equal(next.state.package_context.id,'reveillon');
  assert.equal(next.state.multi_room.status,'offered');
  assert.equal(next.state.facts.guests,5);
  assert.equal(next.state.facts.check_in,undefined);
  assert.equal(next.state.facts.check_out,undefined);
  assert.equal(next.result.can_collect,'NAO');
  assert.deepEqual(calls,[]);
});

test('pedido de exceção fica separado de datas confirmadas e não aciona catálogo',async()=>{
  calls.length=0;
  const message='Teria uma exceção de 30/12 a 02/01?';
  const result=await turn(message);
  assert.equal(result.result.quote_request,'ROOM_LIST');
  assert.equal(result.result.match_type,'package_date_request');
  assert.match(result.result.conversation_text,/31\/12 a 03\/01/);
  assert.match(result.result.conversation_text,/sem confirmar as datas, valores ou uma reserva/);
  assert.equal(result.state.package_date_request.text,message);
  assert.equal(result.state.package_context.id,'reveillon');
  assert.equal(result.state.facts.check_in,undefined);
  assert.equal(result.state.facts.check_out,undefined);
  const offers=await resolve(result.result.conversation_text,result.state,'offers');
  assert.equal(offers.quote_request,'ROOM_DONE');
  assert.deepEqual(calls,[]);
});

test('pergunta de capacidade mantém pedido anterior de exceção sem confirmar período',async()=>{
  const request=await turn('Teria uma exceção de 30/12 a 02/01?');
  calls.length=0;
  const family=await turn('No meu caso para o réveillon somos 5 pessoas, eu, minha esposa e 3 filhos. Dão todos em um apto?',request.state);
  assert.equal(family.result.match_type,'package_followup');
  assert.match(family.result.conversation_text,/idades/);
  assert.equal(family.state.package_date_request.text,'Teria uma exceção de 30/12 a 02/01?');
  assert.equal(family.state.facts.check_in,undefined);
  assert.equal(family.state.facts.check_out,undefined);
  assert.deepEqual(calls,[]);
});

test('predicado de ocupação não absorve preço, novo pacote, fotos ou contexto expirado',()=>{
  for(const message of ['Quanto custa o pacote de Réveillon para 2 adultos?',
    'Qual o preço para 2 adultos e 3 crianças?',
    'oq vc me indica para tres pessoas?',
    'No Natal somos 5 pessoas, cabe em um apartamento?',
    'No Réveillon de 2028 somos 5 pessoas, cabe em um apartamento?',
    'Quero fotos para minha família de 5 pessoas',
    'Tenho 3 filhos, pode mandar fotos dos quartos?',
    'Mostre uma imagem do apartamento para 5 pessoas',
    'Quero o álbum dos quartos para uma família de 5 pessoas',
    'No Réveillon somos 5 pessoas, a ceia está inclusa?',
    'No Reserva Solar somos 5 pessoas',
    'Day use para 2 adultos e 3 crianças',
    'Quero outra viagem, somos 5 pessoas'])
    assert.equal(packageOccupancyFollowup(message,focus,now),false,message);
  assert.equal(packageOccupancyFollowup('8, 10 e 16',focus,now),true);
  assert.equal(packageOccupancyFollowup('No ano novo somos 5 pessoas',focus,now),true);
  assert.equal(packageOccupancyFollowup('8, 10 e 16',undefined,now),false);
  assert.equal(packageOccupancyFollowup('8, 10 e 16',{...focus,updated_at:now-31*60000},now),false);
});

test('pergunta explícita de preço ainda consulta o catálogo em vez de responder só capacidade',async()=>{
  calls.length=0;
  const result=await turn('Quanto custa o pacote de Réveillon para 2 adultos?');
  assert.notEqual(result.result.match_type,'package_occupancy');
  assert.ok(calls.includes('packages'));
});
