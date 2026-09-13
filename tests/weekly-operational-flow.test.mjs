import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {build} from 'esbuild';

const originalFetch=globalThis.fetch;
Reflect.set(globalThis,'fetch',async()=>{throw new Error('Unexpected external request');});
after(()=>Reflect.set(globalThis,'fetch',originalFetch));
const built=await build({stdin:{contents:`
  export {control,handleConversation} from './api/conversation-control.ts';
  export {default as resolver} from './api/resolve-package.ts';
`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'no-database-for-operational-flow',setup(builder){
    builder.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:
      `export function createClient(){throw new Error('Unexpected database access for operational request');}`}));
  }}],
});
const {control,handleConversation,resolver}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const now=Date.now();
const facts={extras:[],guests:2,check_in:'2026-10-16',check_out:'2026-10-18'};
const fresh=()=>({version:2,history:[],facts,greeted:true,
  daily_greeting:{day:new Date(now-3*3600000).toISOString().slice(0,10),first:false}});
async function turn(message,state=fresh(),audio=false,answer='Informação atual do hotel.'){
  const user_message=audio?'https://fixture.invalid/weekly-operations.ogg':message;
  const prepared=await handleConversation({operation:'prepare',state,user_message},'',async()=>message,now);
  const routed=control({operation:'route',state:prepared.state,user_message,
    ai_response:answer,proposed:'QUOTE|2026-12-01|2026-12-04|3|LUA'},now);
  return {prepared,routed,user_message};
}
async function resolve(user_message,state){
  let output;
  await resolver({method:'POST',body:{user_message,state}},{
    status(code){assert.equal(code,200);return this;},json(value){output=value;},
  });
  return output;
}
function assertHuman(routed,message){
  assert.equal(routed.quote_request,'HUMANO',message);
  assert.equal(routed.can_collect,'NAO',message);
  assert.deepEqual(JSON.parse(routed.state).facts,facts,message);
  assert.equal(JSON.parse(routed.state).pending,undefined,message);
  assert.doesNotMatch(routed.answer||'',/https?:\/\/|pagamento confirmado|reserva confirmada|me envie (?:a senha|o codigo)/i);
}

test('W12 upgrade e diferença chegam ao humano no prepare→route→resolver, texto e áudio',async()=>{
  for(const message of [
    'Gostaria de retomar a conversa e finalizar o upgrade',
    'Gostaria de fazer um upgrade no quarto',
    'Vou querer o triplo com sacada. Vc poderia verificar o valor que eu tenho que pagar de diferença, por favor?',
  ]) for(const audio of [false,true]){
    const {routed,user_message}=await turn(message,fresh(),audio,'Pode pagar a diferença e o upgrade já está confirmado.');
    assertHuman(routed,message);
    const result=await resolve(user_message,routed.state);
    assert.equal(result.quote_request,'HUMANO',message);
    assert.equal(result.match_type,'existing_reservation',message);
    assert.deepEqual(JSON.parse(result.state).facts,facts,message);
  }
});

test('W12 data e como prosseguir continuam operacionais, enquanto FAQ sai desse foco',async()=>{
  let state=fresh();
  for(const message of ['Gostaria de fazer um upgrade no quarto','Dia 16-18/10','Como posso prosseguir?']){
    const {routed,user_message}=await turn(message,state);
    assertHuman(routed,message);
    const result=await resolve(user_message,routed.state);
    assert.equal(result.quote_request,'HUMANO',message);
    state=result.state;
  }
  const {routed}=await turn('Minha reserva inclui café da manhã?',state,false,'Posso esclarecer a inclusão do café.');
  assert.equal(routed.quote_request,'NOQUOTE');
  assert.equal(JSON.parse(routed.state).existing_reservation,undefined);
  assert.deepEqual(JSON.parse(routed.state).facts,facts);
});

test('W13 pedido curto do link usa contexto de pagamento, não nova cotação nem credenciais',async()=>{
  const inquiry=await turn('O pagamento pode ser no cartão de crédito de 6x, como no site?',fresh(),false,
    'As condições específicas precisam ser conferidas pela recepção.');
  assert.equal(inquiry.routed.quote_request,'NOQUOTE');
  let state=inquiry.routed.state;
  for(const message of ['Ok. Mande o link','Mande o.link','Pode ser?']){
    const {routed,user_message}=await turn(message,state,false,'Envie senha e códigos do e-mail para liberar o parcelamento.');
    assertHuman(routed,message);
    assert.match(routed.answer,/Não envie senhas, códigos de acesso nem dados do cartão/);
    assert.doesNotMatch(routed.answer,/Envie senha e códigos/);
    const result=await resolve(user_message,routed.state);
    assert.equal(result.quote_request,'HUMANO',message);
    state=result.state;
  }
});

test('W13 link parcelado e acesso que impede parcelar recebem resposta segura, inclusive em áudio',async()=>{
  for(const message of [
    'No site o hotel parcela de 6x. Veja link parcelado',
    'Os códigos enviados ao meu e-mail, não abrem. Só abriu como convidado e não permite parcelar',
  ]) for(const audio of [false,true]){
    const {routed,user_message}=await turn(message,fresh(),audio,'Envie senha e códigos do e-mail; já autorizei 6x.');
    assertHuman(routed,message);
    assert.match(routed.answer,/Não envie senhas, códigos de acesso nem dados do cartão/);
    assert.doesNotMatch(routed.answer,/autorizei|6x/);
    const result=await resolve(user_message,routed.state);
    assert.equal(result.quote_request,'HUMANO',message);
    assert.doesNotMatch(result.conversation_text,/autorizei|6x|https?:/);
  }
});

test('W13 foco financeiro expira e troca de assunto não captura link de menu ou LocMil',async()=>{
  const first=await turn('Como funciona o pagamento?',fresh());
  const live=JSON.parse(first.routed.state);
  assert.ok(live.payment_support?.at);
  const expired={...live,payment_support:{at:now-31*60000}};
  const expiredTurn=await turn('Mande o link',expired,false,'Pode dizer qual link deseja?');
  assert.notEqual(expiredTurn.routed.quote_request,'HUMANO');
  for(const message of ['Mande o link do cardápio','Quero o contato da LocMil','Tem estacionamento?',
    'Posso pagar o café no cartão?','Como pagar o almoço?']){
    const other=await turn(message,first.routed.state,false,'Informação solicitada.');
    assert.notEqual(other.routed.quote_request,'HUMANO',message);
    assert.equal(JSON.parse(other.routed.state).payment_support,undefined,message);
    const next=await turn('Mande o link',other.routed.state,false,'Pode dizer qual link deseja?');
    assert.notEqual(next.routed.quote_request,'HUMANO',message);
  }
});

test('W18 comparação mantém uma alternativa de um quarto e outra de dois, sem escolha presumida',async()=>{
  const message='Qual valor para quarto duplo solteiro ou dois quartos solteiros para entrar hoje e sair segunda?';
  const {routed,user_message}=await turn(message,{...fresh(),facts:{extras:[]}},false,'Você escolheu dois quartos; a reserva está confirmada.');
  assert.equal(routed.quote_request,'HUMANO');
  assert.match(routed.answer,/compar|alternativ|opç/i);
  assert.match(routed.answer,/duplo/i);
  assert.match(routed.answer,/dois|2/);
  assert.doesNotMatch(routed.answer,/escolheu|confirmada/);
  assert.equal(JSON.parse(routed.state).facts.guests,undefined);
  const result=await resolve(user_message,routed.state);
  assert.equal(result.quote_request,'HUMANO');
  assert.doesNotMatch(result.conversation_text,/escolheu|confirmada/);
});
