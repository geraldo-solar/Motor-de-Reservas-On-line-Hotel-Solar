import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';

const now=Date.parse('2026-09-17T18:27:00-03:00'),realNow=Date.now,realFetch=globalThis.fetch;
Date.now=()=>now;globalThis.fetch=async()=>{throw Error('External network forbidden');};
after(()=>{Date.now=realNow;globalThis.fetch=realFetch;});
const pkg={id:'reveillon',name:'Réveillon Solar 2027',active:true,start_iso_date:'2026-12-31',end_iso_date:'2027-01-03',includes:['Café da manhã incluído','Ceia de Réveillon'],benefits:[],room_prices:[]};
const fixture={packages:[pkg],room_types:[{id:'casal',name:'Suíte Casal',capacity:2,active:true,base_price:410}],extras:[]};
const b=await build({stdin:{contents:`export {control,handleConversation} from './api/conversation-control.ts';export {default as resolver} from './api/resolve-package.ts';export {confirmRelativeCheckout} from './utils/stayDuration.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'fixture-only',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'test'}));
    b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`const data=${JSON.stringify(fixture)};export function createClient(){return {from(table){if(!(table in data))throw Error('Unexpected table');let rows=data[table];const q={select(){return q},eq(k,v){rows=rows.filter(x=>x[k]===v);return q},then(r){return Promise.resolve({data:rows,error:null}).then(r)}};return q}}}`}));}}]});
const {control,handleConversation,resolver,confirmRelativeCheckout}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const fresh=()=>({version:2,history:[],facts:{extras:[]},greeted:true,daily_greeting:{day:'2026-09-17',first:false},assistant_disclosure:{version:1,show:false,rendered:true}});
const literal='Sim, mas eu quero saber o que que está incluso na diária.';
async function resolve(message,state,operation){let out;await resolver({method:'POST',body:{user_message:message,state},query:{transport:'manychat-v1',...(operation?{operation}:{})}},{status(code){assert.equal(code,200);return this},json(v){out=v;return v},setHeader(){}});return out;}
async function turn(message,state=fresh(),audio=false){
  const input=audio?'https://fixture.invalid/confirmation.ogg':message;
  const p=await handleConversation({operation:'prepare',user_message:input,state},'',async()=>message,now);
  const r=control({operation:'route',user_message:input,state:p.state,proposed:'COLETAR',ai_response:'Sua reserva está confirmada. Informe seu CPF.'},now);
  const out=await resolve(input,r.state);
  return {p,r,out,state:JSON.parse(out.state||r.state)};
}
async function pending(){const t=await turn('de hoje para amanhã.');assert.match(t.out.conversation_text,/18\/09\/2026.*responda sim/);return t.state;}
function included(t){
  assert.match(t.out.conversation_text,/café da manhã/i);
  assert.match(t.out.conversation_text,/lazer/i);
  assert.doesNotMatch(t.out.conversation_text,/responda sim|CPF|reserva.*confirmada|quantas pessoas/i);
  assert.equal(t.r.can_collect,'NAO');assert.equal(t.out.availability_checked,false);
  assert.equal(t.out.quote_request,'ROOM_LIST');
}
test('literal texto e áudio: sim confirma somente datas e responde inclusões na mesma mensagem',async()=>{
  for(const audio of [false,true]){
    const t=await turn(literal,await pending(),audio);included(t);
    assert.equal(t.state.facts.check_in,'2026-09-17');assert.equal(t.state.facts.check_out,'2026-09-18');
    assert.equal(t.state.stay_date_pending,undefined);assert.equal(t.state.pending,undefined);
    assert.equal(control({operation:'confirm',state:t.state},now).can_collect,'NAO');
    const p=control({operation:'prepare',user_message:'Somos 2 adultos',state:t.state},now);
    const r=control({operation:'route',user_message:'Somos 2 adultos',state:p.state,proposed:'COLETAR'},now);
    assert.equal(r.quote_request,'QUOTE|2026-09-17|2026-09-18|2|NONE');
  }
});
test('variações afirmativas com pergunta informativa mantêm datas sem consentimento comercial',async()=>{
  for(const message of ['Sim, o que está incluído na diária?','Isso mesmo! O que a diária inclui?',
    'Sim mas quero saber o que está incluso na diária','Sim, o café da manhã está incluso?',
    'Sim, e qual o horário do check-in?','Pode manter. Tem wi-fi?']){
    const t=await turn(message,await pending());
    assert.equal(t.state.facts.check_out,'2026-09-18',message);
    assert.equal(t.r.can_collect,'NAO');assert.notEqual(t.r.quote_request,'COLETAR');
    assert.doesNotMatch(t.out.conversation_text,/responda sim/,message);
  }
});
test('pergunta de inclusões isolada responde sem exigir ou inventar datas',async()=>{
  for(const state of [fresh(),await pending()])for(const message of ['O que está incluso na diária?','O que a diária inclui?','Quais serviços estão incluídos na hospedagem?']){
    const t=await turn(message,state);included(t);assert.equal(t.state.facts.check_out,undefined);
  }
});
test('afirmação ambígua, condicional, recusa ou mudança de datas não confirma candidato',async()=>{
  const state=await pending(),p=state.stay_date_pending;
  for(const message of ['Sim, mas quero mudar a saída','Sim, mas vou sair amanhã','Sim, mas só se tiver café da manhã',
    'Sim, mas não nessas datas','Sim? O que está incluso na diária?','Sim, quero sair sábado',
    'Sim, pode reservar','Sim, mas o que está incluso na diária? Quero sair 20/09',
    'Sim, o que está incluso na diária se eu sair sábado?','Sim, mas quero cancelar a reserva'])
    assert.equal(confirmRelativeCheckout(p,message,true,now),undefined,message);
});
test('sim com pergunta exige candidato válido e pergunta exibida nesta conversa',async()=>{
  const state=await pending();
  for(const variant of [{...state,checkout_question:undefined},{...state,checkout_question:{...state.checkout_question,key:'other'}},
    {...state,stay_date_pending:{...state.stay_date_pending,at:now-31*60000}},fresh()]){
    const t=await turn(literal,variant);included(t);assert.equal(t.state.facts.check_out,undefined);
  }
  const p=state.stay_date_pending;
  assert.equal(confirmRelativeCheckout(p,literal,false,now),undefined);
  assert.equal(confirmRelativeCheckout(p,literal,true,Date.parse('2026-09-18T00:01:00-03:00')),undefined);
});
test('resolvedor direto também responde inclusões e confirma apenas com pergunta exibida',async()=>{
  const out=await resolve(literal,await pending());
  assert.match(out.conversation_text,/café da manhã/);assert.equal(JSON.parse(out.state).facts.check_out,'2026-09-18');
  assert.equal(out.can_collect,'NAO');
});
test('resposta informativa não dispara oferta extra ou mídia no passo seguinte',async()=>{
  const t=await turn(literal,await pending());
  const out=await resolve(t.out.conversation_text,t.state,'offers');
  assert.equal(out.quote_request,'ROOM_DONE');assert.equal(out.conversation_text,'');
});
test('pergunta de inclusões preserva ocupação, datas e extras já informados',async()=>{
  const state={...fresh(),facts:{extras:['MESA'],guests:2,check_in:'2026-09-20',check_out:'2026-09-22'}};
  const t=await turn('O que está incluso na diária?',state);included(t);assert.deepEqual(t.state.facts,state.facts);
});
test('inclusões de pacote atual continuam consultando cadastro do pacote',async()=>{
  const state={...fresh(),topic:'package_info',topic_at:now,package_context:{id:pkg.id,name:pkg.name,start_date:pkg.start_iso_date,end_date:pkg.end_iso_date,updated_at:now}};
  const t=await turn('O que está incluso na diária?',state);
  assert.equal(t.state.package_context?.id,pkg.id);assert.match(t.out.conversation_text,/Ceia de Réveillon/);
  assert.doesNotMatch(t.out.conversation_text,/Na diária comum/);
});
test('humano, pagamento e anexo mantêm suas rotas antes de dúvidas ou confirmações',async()=>{
  const state=await pending();
  for(const message of ['Sim, quero falar com a recepção e saber o que está incluso na diária',
    'Sim, já paguei e quero saber o que está incluso na diária']){
    const t=await turn(message,state);assert.equal(t.r.quote_request,'HUMANO');assert.equal(t.state.facts.check_out,undefined);
  }
  const t=await turn('https://fixture.invalid/comprovante.pdf',state);
  assert.equal(t.r.input_type,'attachment');assert.equal(t.state.facts.check_out,undefined);assert.equal(t.r.can_collect,'NAO');
});
