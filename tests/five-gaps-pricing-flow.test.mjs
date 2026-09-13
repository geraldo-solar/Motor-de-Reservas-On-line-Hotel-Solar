import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

// Controller -> quotation API -> returned options. The catalog below is
// entirely synthetic; these tests do not check stock or create a reservation.
const catalog={room_types:[{id:'casal',name:'Suíte Casal',capacity:2,base_price:500,overrides:[]}],packages:[],
  extras:[{id:'mesa',name:'Mesa Posta',price:180},{id:'lua',name:'Kit Lua de Mel',price:350}]};
const b=await build({stdin:{contents:`export {control} from './api/conversation-control.ts';export {default as prices} from './api/get-prices.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'synthetic-readonly-catalog',setup(builder){
    builder.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:`
      const data=${JSON.stringify(catalog)};
      export function createClient(){return {from(table){
        if(!(table in data))throw Error('Unexpected table '+table);
        const q={select(){return q},eq(){return q},then(fn){return Promise.resolve({data:data[table],error:null}).then(fn)}};return q;
      }}};
    `}));
  }}]});
const {control,prices}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const now=Date.parse('2026-09-13T16:00:00-03:00');
function turn(message,state={version:2,history:[],facts:{extras:[]},greeted:true}){
  const p=control({operation:'prepare',user_message:message,state},now);
  return control({operation:'route',user_message:message,state:p.state,proposed:'NOQUOTE'},now);
}
async function quote(route){
  assert.match(route.quote_request,/^QUOTE\|/);
  let response;
  await prices({method:'POST',body:{quote_request:route.quote_request,state:route.state}},
    {status(code){assert.equal(code,200);return this},json(value){response=value}});
  assert.equal(response.availability_checked,false);
  assert.equal(response.requires_human_confirmation,true);
  return response;
}
test('troca de mesa por kit chega ao preço e às opções somente com o extra escolhido',async()=>{
  const start=turn('Quero hospedagem para 2 adultos de 20/09 a 22/09');
  const mesa=turn('Quero incluir mesa posta',start.state);
  const swapped=turn('Retire a mesa posta e coloque o kit lua de mel.',mesa.state);
  const response=await quote(swapped);
  assert.deepEqual(response.selected_extras,['LUA']);assert.equal(response.extras_total,350);
  const state=JSON.parse(response.quote_state);
  assert.deepEqual(state.extras,['LUA']);assert.equal(state.options[0].total,1350);
  assert.match(response.conversation_text,/Lua de Mel/);
});
test('nova viagem individual chega ao cálculo sem criança/cortesia herdada',async()=>{
  const family=turn('Quero hospedagem para 2 adultos e 1 criança de 5 anos, de 20/09 a 22/09');
  const solo=turn('Quero outra viagem para minha mãe sozinha, só uma pessoa, de 23/09 a 25/09',family.state);
  const response=await quote(solo);
  assert.equal(response.guests,1);assert.equal(response.check_in,'2026-09-23');assert.equal(response.check_out,'2026-09-25');
  const state=JSON.parse(response.quote_state);
  assert.equal(state.guests,1);assert.equal(state.options[0].total,1000);
  assert.equal(state.options[0].child_allowance,undefined);
  assert.doesNotMatch(response.conversation_text,/criança.*cortesia/i);
});
