import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {build} from 'esbuild';

const originalFetch=globalThis.fetch;
Reflect.set(globalThis,'fetch',async()=>{throw Error('No network allowed in mixed payment tests');});
after(()=>Reflect.set(globalThis,'fetch',originalFetch));
const b=await build({stdin:{contents:`
  export * from './utils/paymentSupport.ts';
  export {control,handleConversation} from './api/conversation-control.ts';
  export {default as resolver} from './api/resolve-package.ts';
`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'forbid-db',setup(builder){
    builder.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'blocked',namespace:'test'}));
    builder.onLoad({filter:/.*/,namespace:'test'},()=>({loader:'js',contents:
      `export function createClient(){throw Error('No database allowed in mixed payment tests');}`}));
  }}],
});
const {paymentSupportInquiry:request,paymentSupportTopic:topic,paymentSupportSupplementaryTopics:secondary,
  paymentSupportContextFor:safeContext,paymentSupportAnswerFor:safeAnswer,readPaymentSupportTopics:readTopics,
  control,handleConversation,resolver}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
async function resolve(user_message,state){
  let result;
  try{
    await resolver({method:'POST',body:{user_message,state}},
      {status(code){assert.equal(code,200);return this;},json(value){result=value;}});
  }catch(error){throw Error(error.message);}
  return result;
}

test('NC-01: affirmative payment request survives separate guide/menu request in either order',()=>{
  for(const message of [
    'Mande o link de pagamento da hospedagem e o guia do hotel, por favor.',
    'Mande o link de pagamento da hospedagem. E o cardápio do restaurante também, por favor.',
    'Mande o guia do hotel e o link de pagamento da hospedagem.',
    'Quero o cardápio. Mande o link de pagamento da minha reserva.',
    'Mande o link de pagamento da hospedagem e me diga qual é o horário do check-in.',
    'O link de pagamento da hospedagem não abre. Mande o guia do hotel também.',
    'Não quero o guia, mas mande o link de pagamento da hospedagem.',
    'Mande o link de pagamento e o cardápio.',
    'Mande o cardápio e o link de pagamento.',
    'Mande o menu. Preciso do link de pagamento.',
    'Preciso do link de pagamento. Mande o cardápio do restaurante também.',
    'O link de pagamento não abre. Mande o menu também.',
  ]){
    assert.equal(request(message),true,message);
    assert.equal(topic(message),true,message);
  }
});

test('payment is not inferred from links for meals, guides, providers or hypothetical instructions',()=>{
  for(const message of [
    'Mande o link do guia do hotel.',
    'Mande o cardápio e o guia do hotel.',
    'Mande o link para pagar o café avulso e o guia do hotel.',
    'Posso pagar o café no cartão? E mande o cardápio.',
    'Mande o cardápio e posso pagar no cartão?',
    'Mande o menu e aceitam Pix?',
    'Mande o cardápio e o link.',
    'Mande o link de pagamento da LocMil e o guia do hotel.',
    'Mande o guia do hotel e o link de pagamento da LocMil.',
    'Mande o link do documento de pagamento da hospedagem.',
    'Como faço para pedir o link de pagamento da hospedagem? E mande o guia.',
    'Se eu precisar do link de pagamento da hospedagem, como solicito? Mande o guia.',
  ])assert.equal(request(message,true),false,message);
  for(const message of ['Posso pagar o café no cartão? E mande o cardápio.',
    'Mande o cardápio e posso pagar no cartão?',
    'Mande o menu e aceitam Pix?',
    'Mande o link de pagamento da LocMil e o guia do hotel.'])assert.equal(topic(message),false,message);
});

test('explicit refusal scopes over its coordinated objects but later affirmative payment remains valid',()=>{
  for(const message of [
    'Não mande o link de pagamento da hospedagem e o guia do hotel.',
    'Não quero o guia e o link de pagamento da hospedagem.',
    'Quero o guia, mas não o link de pagamento da hospedagem.',
    'Quero o guia e não o link de pagamento da hospedagem.',
    'Não preciso do link de pagamento da hospedagem. Só quero o guia.',
  ]){
    assert.equal(request(message,true),false,message);
    assert.equal(topic(message),false,message);
    assert.deepEqual(secondary(message),[],message);
  }
  assert.equal(request('Não mande o link de pagamento. Mas agora mande o link de pagamento da hospedagem e o guia.'),true);
  assert.equal(request('Não quero falar com atendente, mas preciso do link de pagamento da hospedagem e do guia.'),true);
});

test('safe secondary topics preserve guide/menu only for an actual payment request',()=>{
  assert.deepEqual(secondary('Mande o link de pagamento da hospedagem e o guia do hotel, por favor.'),['guest_guide']);
  assert.deepEqual(secondary('Mande o link de pagamento da hospedagem. E o cardápio do restaurante também, por favor.'),['restaurant_menu']);
  assert.deepEqual(secondary('Mande o link de pagamento da hospedagem e o guia, mas não quero o cardápio.'),['guest_guide']);
  assert.deepEqual(secondary('Não quero o guia, mas mande o link de pagamento da hospedagem.'),[]);
  assert.deepEqual(secondary('Mande o link do guia.'),[]);
});

test('canonical topics and answers contain only fixed safe wording and approved public guide URL',()=>{
  const message='Mande o link de pagamento da hospedagem e o guia do hotel. Meu e-mail é pessoa@fixture.invalid; senha SEGREDO_TESTE; código 123456.';
  const safe=safeContext(message);
  assert.match(safe,/Também quero o guia do hotel/);
  assert.doesNotMatch(safe,/fixture|SEGREDO_TESTE|123456/);
  assert.deepEqual(secondary(safe),['guest_guide']);
  assert.deepEqual(readTopics(['guest_guide','SEGREDO_TESTE','guest_guide',null]),['guest_guide']);
  assert.deepEqual(readTopics('restaurant_menu'),[]);
  assert.match(safeAnswer(['guest_guide']),/https:\/\/www\.hotelsolar\.tur\.br\/guia/);
  const menu=safeAnswer(['restaurant_menu']);
  assert.match(menu,/pedir também à recepção o cardápio/);
  assert.doesNotMatch(menu,/https?:|enviei|enviamos|já enviado/i);
});

test('prepare→route→resolver preserves HUMAN and guide/menu for NC-01 in text and audio fixtures',async()=>{
  const now=Date.now();
  const facts={extras:[],guests:2,check_in:'2026-10-16',check_out:'2026-10-18'};
  for(const message of ['Mande o link de pagamento da hospedagem e o guia do hotel, por favor.',
    'Mande o link de pagamento da hospedagem. E o cardápio do restaurante também, por favor.',
    'Mande o link de pagamento e o cardápio.',
    'Mande o cardápio e o link de pagamento.',
    'Mande o menu. Preciso do link de pagamento.',
    'Preciso do link de pagamento. Mande o cardápio do restaurante também.']){
    for(const audio of [false,true]){
      const user_message=audio?'https://fixture.invalid/payment-support-mixed.ogg':message;
      const state={version:2,history:[],facts,greeted:true,
        assistant_disclosure:{version:1,show:false,rendered:true},
        daily_greeting:{day:new Date(now-3*3600000).toISOString().slice(0,10),first:false}};
      const p=await handleConversation({operation:'prepare',state,user_message},'',async()=>message,now);
      const r=control({operation:'route',state:p.state,user_message,
        proposed:'NOQUOTE',ai_response:'Posso apresentar o guia do hotel.'},now);
      assert.equal(r.quote_request,'HUMANO',message);
      assert.equal(r.can_collect,'NAO');
      assert.match(r.answer,/Não envie senhas, códigos de acesso nem dados do cartão/);
      assert.deepEqual(JSON.parse(r.state).facts,facts);
      const expectedTopic=message.includes('guia')?'guest_guide':'restaurant_menu';
      assert.deepEqual(JSON.parse(p.context).assuntos_complementares_solicitados,[expectedTopic]);
      assert.deepEqual(JSON.parse(r.state).payment_support.topics,[expectedTopic]);
      const result=await resolve(user_message,r.state);
      assert.equal(result.quote_request,'HUMANO');
      assert.equal(result.match_type,'payment_support');
      assert.deepEqual(JSON.parse(result.state).facts,facts);
      if(expectedTopic==='guest_guide')assert.match(result.conversation_text,/https:\/\/www\.hotelsolar\.tur\.br\/guia/);
      else{
        assert.match(result.conversation_text,/pedir também à recepção o cardápio/);
        assert.doesNotMatch(result.conversation_text,/https?:|enviei|enviamos|já enviado/);
      }
    }
  }
});

test('credentials stay out of payment state and context while requested guide survives, including audio',async()=>{
  const now=Date.now();
  const message='Mande o link de pagamento da hospedagem e o guia do hotel. Meu e-mail é pessoa@fixture.invalid; senha SEGREDO_TESTE; código 123456.';
  for(const audio of [false,true]){
    const user_message=audio?'https://fixture.invalid/mixed-credentials.ogg':message;
    const state={version:2,history:[],facts:{extras:[]},greeted:true,
      assistant_disclosure:{version:1,show:false,rendered:true}};
    const p=await handleConversation({operation:'prepare',state,user_message},'',async()=>message,now);
    const r=control({operation:'route',state:p.state,user_message},now);
    const result=await resolve(user_message,r.state);
    assert.equal(result.quote_request,'HUMANO');
    assert.match(result.conversation_text,/hotelsolar\.tur\.br\/guia/);
    for(const value of [p.state,p.context,r.state,result.state,result.conversation_text])
      assert.doesNotMatch(value,/pessoa@|SEGREDO_TESTE|123456/);
    assert.deepEqual(JSON.parse(result.state).payment_support.topics,['guest_guide']);
  }
});

test('negative guide is not returned, and no old complementary topics survive a new subject or expired state',async()=>{
  const now=Date.now();
  const initial={version:2,history:[],facts:{extras:[]},greeted:true,
    assistant_disclosure:{version:1,show:false,rendered:true}};
  const message='Mande o link de pagamento da hospedagem, mas não quero o guia.';
  const p=control({operation:'prepare',state:initial,user_message:message},now);
  const r=control({operation:'route',state:p.state,user_message:message},now);
  const result=await resolve(message,r.state);
  assert.equal(result.quote_request,'HUMANO');
  assert.doesNotMatch(result.conversation_text,/https?:/);
  assert.deepEqual(JSON.parse(result.state).payment_support.topics,[]);
  const existing={...JSON.parse(r.state),payment_support:{at:now,topics:['guest_guide','UNTRUSTED']}};
  const loaded=control({operation:'remember_response',state:existing},now);
  assert.deepEqual(JSON.parse(loaded.state).payment_support.topics,['guest_guide']);
  const expired=control({operation:'remember_response',state:existing},now+31*60000);
  assert.equal(JSON.parse(expired.state).payment_support,undefined);
  const other=control({operation:'prepare',state:existing,user_message:'Qual o horário do check-in?'},now);
  assert.equal(JSON.parse(other.state).payment_support,undefined);
  const newPayment=control({operation:'prepare',state:existing,user_message:'Mande o link de pagamento'},now);
  assert.deepEqual(JSON.parse(newPayment.state).payment_support.topics,[]);
});

test('refusing the payment link keeps only the guide FAQ through the resolver without a handoff',async()=>{
  const now=Date.now();
  const message='Não mande o link de pagamento da hospedagem. Só quero o guia do hotel.';
  const state={version:2,history:[],facts:{extras:[]},greeted:true,
    assistant_disclosure:{version:1,show:false,rendered:true},
    payment_support:{at:now,topics:['restaurant_menu']}};
  const p=control({operation:'prepare',state,user_message:message},now);
  const r=control({operation:'route',state:p.state,user_message:message,
    ai_response:'Guia do hóspede: https://www.hotelsolar.tur.br/guia'},now);
  assert.equal(r.quote_request,'NOQUOTE');
  assert.equal(JSON.parse(r.state).payment_support,undefined);
  const result=await resolve(message,r.state);
  assert.notEqual(result.quote_request,'HUMANO');
  assert.match(result.conversation_text,/hotelsolar\.tur\.br\/guia/);
  assert.doesNotMatch(result.conversation_text,/chamar a recepção|cardápio solicitado/);
});
