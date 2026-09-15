import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';

// Real handlers, synthetic catalogue/transcriptions only. No customer, model,
// database, availability, outbound WhatsApp or booking operation is called.
const now=Date.parse('2026-09-15T11:00:00-03:00'),oldNow=Date.now,oldFetch=globalThis.fetch;
Date.now=()=>now;let network=0;Reflect.set(globalThis,'fetch',async()=>{network++;throw Error('Network forbidden');});
after(()=>{Date.now=oldNow;Reflect.set(globalThis,'fetch',oldFetch);assert.equal(network,0);});
const rooms=[['loft','LOFT',4,1450],['casal','Suíte Casal',2,610],['triplo','Suíte Triplo',3,710]]
  .map(([id,name,capacity,base_price])=>({id,name,capacity,base_price,active:true,overrides:[],
    description:id==='loft'?'43 m², cama King e sacada com vista para o mar.':'Uma acomodação confortável.',
    images:[`https://fixture.invalid/${id}.jpg`]}));
const data={room_types:rooms,packages:[],extras:[
  {id:'mesa',name:'Mesa Posta',price:180,active:true,image_url:'https://fixture.invalid/mesa.jpg'},
  {id:'lua',name:'Kit Lua de Mel',price:350,active:true,image_url:'https://fixture.invalid/lua.jpg'}]};
const calls=[];globalThis.__coupleQuery=table=>calls.push(table);
const bundle=await build({stdin:{contents:`export {control,handleConversation} from './api/conversation-control.ts';
  export {default as prices} from './api/get-prices.ts';export {default as resolver} from './api/resolve-package.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'couple-local-only',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const data=${JSON.stringify(data)};
    export function createClient(){return{from(table){globalThis.__coupleQuery(table);
      if(!(table in data))throw Error('Unexpected table');let rows=data[table];
      const q={select(){return q},eq(k,v){rows=rows.filter(x=>x[k]===v);return q},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve)}};return q}}}`}));}}]});
const {control,handleConversation,prices,resolver}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const base=()=>({version:2,history:[],facts:{guests:5,check_in:'2026-09-18',check_out:'2026-09-20',extras:[],children_pending:false},greeted:true,
  daily_greeting:{day:'2026-09-14',first:false},assistant_disclosure:{version:1,show:false,rendered:true},
  family_party:{adults:2,children:3,total:5,ages_months:[120,96,192],updated_at:now-24*3600000},
  turns:[{role:'assistant',text:'Para acomodar vocês cinco, duas suítes por R$ 2.640.'},
    {role:'assistant',text:'O café da manhã é das 7h às 10h.'}]});
async function request(handler,body,query={}){let status,result;
  await handler({method:'POST',body,query},{status(code){status=code;return this},json(value){result=value;return value}});
  assert.equal(status,200);return result;
}
function chat(){return {state:base(),quote:undefined,async say(message,{audio=false,answer='Resposta sintética.',proposed='NOQUOTE'}={}){
  const input=audio?'https://fixture.invalid/latest-couple.ogg':message;
  const body={operation:'prepare',user_message:input,state:this.state,quote_state:this.quote};
  const prepared=audio?await handleConversation(body,'',async()=>message,now):control(body,now);
  const routed=control({operation:'route',user_message:input,state:prepared.state,quote_state:this.quote,ai_response:answer,proposed},now);
  let result=routed;
  if(routed.quote_request.startsWith('QUOTE|')){result=await request(prices,{quote_request:routed.quote_request,state:routed.state});this.quote=result.quote_state;}
  else if(routed.quote_request==='NOQUOTE')result=await request(resolver,{user_message:input,state:routed.state});
  this.state=result.state||routed.state;
  return {prepared,routed,result,state:JSON.parse(this.state),text:result.conversation_text||result.answer||''};
}};}

test('15/09: troca para casal, comparação/fotos e escolha explícita do Loft sem repetir categoria',async()=>{
  for(const audio of [false,true]){
    const c=chat();
    const first=await c.say('Olá, bom dia. Gostaria de saber se vocês têm disponibilidade para esse final de semana.',{audio});
    assert.equal(JSON.parse(c.quote).guests,5);assert.match(first.text,/Bom dia!/);
    const changed=await c.say('No caso, irá apenas eu e minha esposa.',{audio,answer:'Para acomodar vocês cinco, duas suítes por R$ 2.640.'});
    assert.equal(changed.state.facts.guests,2);assert.equal(changed.state.family_party.children,0);
    assert.deepEqual(changed.state.family_party.ages_months,[]);assert.equal(changed.state.facts.children_pending,false);
    assert.equal(changed.routed.quote_request,'QUOTE|2026-09-18|2026-09-20|2|NONE');
    assert.equal(JSON.parse(c.quote).guests,2);assert.doesNotMatch(changed.text,/vocês cinco|Combinações para 5/);
    assert.ok(changed.state.turns.every(t=>t.role!=='assistant'||!/vocês cinco|R\$ 2\.640/.test(t.text)));
    assert.ok(changed.state.turns.some(t=>t.text==='O café da manhã é das 7h às 10h.'));
    const quote=c.quote;
    const compared=await c.say('Qual você acha que você me indicaria que seria melhor? O apartamento loft ou de casal? E você tem foto desses dois apartamentos? Você pode me mandar para eu poder decidir?',{audio});
    assert.match(compared.result.quote_request,/^ROOM_ID\|(?:loft\|casal|casal\|loft)$/);
    assert.match(compared.text,/LOFT/i);assert.match(compared.text,/Casal/);
    assert.doesNotMatch(compared.text,/De qual acomodação|R\$|reservei/);
    assert.equal(compared.state.pending,undefined);assert.equal(c.quote,quote);assert.equal(compared.routed.can_collect,'NAO');
    const next=await request(resolver,{user_message:compared.result.quote_request,state:c.state},{operation:'next'});
    assert.match(next.quote_request,/^ROOM_ID\|/);
    const done=await request(resolver,{user_message:next.quote_request,state:c.state},{operation:'next'});
    assert.equal(done.quote_request,'ROOM_DONE');
    const chosen=await c.say('Legal, quero reservar o loft.',{audio,answer:'Para acomodar vocês cinco, escolha duas suítes.',proposed:'NOQUOTE'});
    assert.equal(chosen.routed.quote_request,'COLETAR');assert.equal(chosen.routed.can_collect,'NAO');
    assert.equal(chosen.state.pending.option,'LOFT');
    assert.match(chosen.routed.confirmation_text,/LOFT\n18\/09\/2026 a 20\/09\/2026 · 2 hóspedes/);
    assert.doesNotMatch(chosen.routed.answer,/cinco|Qual acomodação/);
    assert.equal(chosen.routed.answer,chosen.routed.confirmation_text);
    const confirm=control({operation:'confirm',state:c.state,quote_state:c.quote},now);
    assert.equal(confirm.can_collect,'SIM');
    assert.equal(control({operation:'confirm',state:confirm.state,quote_state:c.quote},now).can_collect,'NAO');
  }
});

test('resposta livre não contradiz hóspedes atuais nem conserva valores da família anterior',async()=>{
  for(const answer of ['Para acomodar vocês cinco, a melhor opção são duas suítes por R$ 2.640.',
    'Entendi, são cinco hóspedes. Posso esclarecer mais alguma coisa?','A cotação considera cinco hóspedes.']){
    const c=chat();await c.say('Só eu e minha esposa');
    const result=await c.say('Entendi',{answer});
    assert.match(result.text,/considerando 2 hóspedes/);assert.doesNotMatch(result.text,/quantas pessoas|cinco|R\$|duas suítes/);
    assert.equal(result.state.facts.guests,2);assert.equal(result.routed.can_collect,'NAO');assert.equal(result.state.pending,undefined);
  }
});

test('cotação textual não dispara sequência automática de fotos de extras',async()=>{
  const c=chat();const quote=await c.say('Só eu e minha esposa');
  assert.match(quote.text,/Mesa Posta/);calls.length=0;
  const offers=await request(resolver,{user_message:quote.text,state:c.state},{operation:'offers'});
  assert.equal(offers.quote_request,'ROOM_DONE');assert.equal(offers.conversation_text,'');assert.deepEqual(calls,[]);
  const explicit=await c.say('Quero fotos da Mesa Posta');
  assert.match(explicit.result.quote_request,/^EXTRA_ID\|MESA/);assert.equal(explicit.routed.can_collect,'NAO');
});

test('token de cotação antigo não passa com hóspedes, datas ou extras diferentes, mesmo sem crianças',async()=>{
  const c=chat();await c.say('Só eu e minha esposa');calls.length=0;
  for(const token of ['QUOTE|2026-09-18|2026-09-20|5|NONE','QUOTE|2026-09-19|2026-09-21|2|NONE',
    'QUOTE|2026-09-18|2026-09-20|2|MESA']){
    const response=await request(prices,{quote_request:token,state:c.state});
    assert.equal(response.quote_request,'NOQUOTE');assert.equal(response.quote_state,'');assert.equal(response.can_collect,'NAO');
    assert.doesNotMatch(response.conversation_text,/R\$/);assert.equal(response.availability_checked,false);
  }
  assert.deepEqual(calls,[]);
});

test('extras atuais são comparados como conjunto, sem alterar escolhas válidas',async()=>{
  const c=chat();await c.say('Só eu e minha esposa');
  const state=JSON.parse(c.state);state.facts.extras=['LUA','MESA'];
  const response=await request(prices,{quote_request:'QUOTE|2026-09-18|2026-09-20|2|MESA,LUA,MESA',state});
  assert.equal(response.extras_total,530);
  assert.deepEqual([...response.selected_extras].sort(),['LUA','MESA']);
  assert.deepEqual(JSON.parse(response.quote_state).extras.sort(),['LUA','MESA']);
  assert.notEqual(response.can_collect,'SIM');
});
