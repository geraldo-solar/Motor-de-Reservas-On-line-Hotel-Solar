import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

const now=Date.now();
const oldFacts={guests:3,check_in:'2026-09-04',check_out:'2026-09-06',extras:['MESA']};
const initial={version:2,history:[],facts:oldFacts,greeted:true};
const rooms=[
  {id:'loft',name:'Loft',capacity:4,base_price:333,overrides:[],active:true},
  {id:'tripla',name:'Suíte Tripla',capacity:3,base_price:222,overrides:[],active:true},
  {id:'casal',name:'Suíte Casal',capacity:2,base_price:111,overrides:[],active:true},
];
const packages=[
  {id:'reveillon',name:'Réveillon Solar 2027',start_iso_date:'2026-12-31',end_iso_date:'2027-01-03',
    description:'Celebração de Ano-Novo.',image_url:'https://fixture.invalid/reveillon.jpg',includes:['Ceia de Réveillon'],benefits:[],
    room_prices:[{roomId:'loft',price:8400},{roomId:'tripla',price:6300},{roomId:'casal',price:4500}],full_period_required:true,active:true},
  {id:'natal',name:'Natal Solar 2026',start_iso_date:'2026-12-24',end_iso_date:'2026-12-26',
    description:'Celebração natalina.',image_url:'https://fixture.invalid/natal.jpg',includes:['Ceia de Natal'],benefits:[],
    room_prices:[{roomId:'loft',price:5200},{roomId:'tripla',price:3900},{roomId:'casal',price:2700}],active:true},
];
const oldQuote={version:1,id:'old-september-quote',created_at:now,...oldFacts,options:[{name:'Loft',capacity:4,total:1777}]};

async function load(file,fixture=false) {
  const result=await build({entryPoints:[file],bundle:true,write:false,platform:'node',format:'esm',
    define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
    plugins:fixture ? [{name:'package-context-readonly',setup(builder) {
      builder.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'catalog',namespace:'test'}));
      builder.onLoad({filter:/.*/,namespace:'test'},()=>({loader:'js',contents:`
        const data=${JSON.stringify({packages,room_types:rooms,extras:[]})};
        export function createClient() {return {from(table) {
          if (!(table in data)) throw Error('Unexpected table: '+table);
          return {select() {let rows=data[table];const query={
            eq(key,value) {if (key==='id') rows=rows.filter(row=>row.id===value);return query;},
            then(resolve) {return Promise.resolve({data:rows,error:null}).then(resolve);}
          };return query;}};
        }}};
      `}));
    }}] : [],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const {control,handleConversation}=await load('api/conversation-control.ts');
const {default:resolver}=await load('api/resolve-package.ts',true);
const prepare=(message,state=initial,time=Date.now())=>control({operation:'prepare',user_message:message,state,quote_state:oldQuote},time);
const route=(message,state,time=Date.now(),answer='Recomendo o Loft por R$ 1.777,00, de 04/09/2026 a 06/09/2026.')=>
  control({operation:'route',user_message:message,state,quote_state:oldQuote,proposed:'QUOTE|2026-09-04|2026-09-06|1|MESA',ai_response:answer},time);

async function resolve(message,state) {
  let status,payload;
  await resolver({method:'POST',query:{},body:{user_message:message,state}},
    {status(code){status=code;return this;},json(value){payload=value;return value;}});
  assert.equal(status,200);
  return payload;
}

function noConsent(result) {
  assert.notEqual(result.quote_request,'COLETAR');
  if ('can_collect' in result) assert.equal(result.can_collect,'NAO');
  if ('confirmation_text' in result) assert.equal(result.confirmation_text,'');
  if (result.state) assert.equal(JSON.parse(result.state).pending,undefined);
}

function catalogIsNotClientDates(state) {
  const {facts}=typeof state==='string' ? JSON.parse(state) : state;
  assert.equal(facts.check_in,undefined);
  assert.equal(facts.check_out,undefined);
  assert.deepEqual(facts.extras,[]);
}

async function openPackage(message='Quero informações do pacote Réveillon',state=initial) {
  const p=prepare(message,state);
  const r=route(message,p.state,Date.now(),'Vou consultar o pacote solicitado.');
  assert.equal(r.quote_request,'NOQUOTE',message);
  noConsent(r);
  const result=await resolve(message,r.state);
  assert.match(result.quote_request,/^PACKAGE_ID\|/);
  noConsent(result);
  catalogIsNotClientDates(result.state);
  return result;
}

async function followup(message,state,id='reveillon') {
  const p=prepare(message,state);
  const r=route(message,p.state);
  assert.equal(r.quote_request,'NOQUOTE',message);
  noConsent(r);
  assert.doesNotMatch(r.answer,/04\/09|06\/09|1\.777|datas de entrada e saída|quantas pessoas/i,message);
  const result=await resolve(message,r.state);
  assert.equal(result.quote_request,'ROOM_LIST',message);
  assert.doesNotMatch(result.quote_request,/^(?:QUOTE|PACKAGE_ID|ROOM_ID|EXTRA_ID)\|/);
  assert.ok(!result.package_image_url,message);
  assert.equal(JSON.parse(result.state).package_context.id,id,message);
  assert.equal(JSON.parse(result.state).topic,'package_info',message);
  assert.match(result.conversation_text,id==='reveillon' ? /Réveillon/i : /Natal/i,message);
  assert.doesNotMatch(result.conversation_text,/04\/09|06\/09|1\.777|datas de entrada e saída|quantas pessoas|nome completo|CPF/i,message);
  assert.match(result.conversation_text,/não confirmam? disponibilidade|sujeit[oa].*disponibilidade|informativ/i,message);
  noConsent(result);
  catalogIsNotClientDates(result.state);
  return result;
}

test('pacote consultado grava contexto estruturado sem converter catálogo em datas ou aceite',async()=>{
  const result=await openPackage();
  const state=JSON.parse(result.state);
  assert.equal(state.topic,'package_info');
  assert.equal(state.package_context.id,'reveillon');
  assert.equal(state.package_context.name,'Réveillon Solar 2027');
  assert.equal(state.package_context.start_date,'2026-12-31');
  assert.equal(state.package_context.end_date,'2027-01-03');
  assert.ok(state.package_context.updated_at>=now && state.package_context.updated_at<=Date.now());
  assert.equal(state.facts.guests,3);
  assert.match(result.conversation_text,/31\/12\/2026.*03\/01\/2027/s);
  assert.match(result.conversation_text,/8\.400,00/);
  const remembered=control({operation:'remember_response',state:result.state,response_text:'Pode perguntar sobre esse pacote.'});
  assert.deepEqual(JSON.parse(remembered.state).package_context,state.package_context);
  assert.deepEqual(JSON.parse(remembered.state).facts,state.facts);
});

test('datas e ocupação declaradas pelo cliente no próprio turno de pacote não são apagadas nem viram aceite',async()=>{
  const message='Quero informações do pacote Réveillon, de 31/12/2026 a 03/01/2027 para 4 pessoas';
  const p=prepare(message);
  const r=route(message,p.state,Date.now(),'Vou consultar esse pacote.');
  assert.equal(r.quote_request,'NOQUOTE');
  const result=await resolve(message,r.state);
  const {facts}=JSON.parse(result.state);
  assert.equal(facts.guests,4);
  assert.equal(facts.check_in,'2026-12-31');
  assert.equal(facts.check_out,'2027-01-03');
  assert.deepEqual(facts.extras,[]);
  noConsent(r);
  noConsent(result);
});

test('reprodução Réveillon: indicação para três → casal e criança de cinco mantém pacote e três hóspedes',async()=>{
  const opened=await openPackage();
  const recommended=await followup('oq vc me indica para tres pessoas?',opened.state);
  assert.match(recommended.conversation_text,/Loft/);
  assert.match(recommended.conversation_text,/8\.400,00/);
  assert.doesNotMatch(recommended.conversation_text,/Suíte Casal/);
  const result=await followup('somos um casal e uma criança de 5 anos',recommended.state);
  const {facts}=JSON.parse(result.state);
  assert.equal(facts.guests,3);
  assert.equal(facts.children_pending,false);
  if (Array.isArray(facts.children_ages)) assert.deepEqual(facts.children_ages,[5]);
  if (Array.isArray(facts.child_ages)) assert.deepEqual(facts.child_ages,[5]);
  assert.match(result.conversation_text,/8\.400,00|6\.300,00/);
  assert.doesNotMatch(result.conversation_text,/1 hóspede|1 hospede|1 pessoa|Suíte Casal/);
});

test('troca explícita para Natal substitui contexto e valores nos acompanhamentos',async()=>{
  const opened=await openPackage();
  const natal=await openPackage('E o pacote de Natal?',opened.state);
  assert.equal(JSON.parse(natal.state).package_context.id,'natal');
  assert.equal(JSON.parse(natal.state).package_context.start_date,'2026-12-24');
  const result=await followup('Quais são os valores?',natal.state,'natal');
  assert.match(result.conversation_text,/5\.200,00|3\.900,00/);
  assert.doesNotMatch(result.conversation_text,/Réveillon|8\.400,00|6\.300,00|31\/12\/2026/);
});

test('pergunta Criança paga não afirma presença de criança nem cria pendência de idade',async()=>{
  const opened=await openPackage();
  const p=prepare('Criança paga?',opened.state);
  assert.deepEqual(JSON.parse(p.state).facts,JSON.parse(opened.state).facts);
  assert.notEqual(JSON.parse(p.state).facts.children_pending,true);
  const result=await followup('Criança paga?',opened.state);
  assert.doesNotMatch(result.conversation_text,/idades das crianças|gratuit[oa]|não paga/i);
});

test('contagem de casal soma crianças; composição explícita consistente respeita o total',()=>{
  for (const [message,expected] of [
    ['somos um casal e uma criança de 5 anos',3],
    ['um casal e uma criança de 5 anos',3],
    ['somos um casal',2],
    ['um casal e duas crianças de 5 e 8 anos',4],
    ['Somos 3 pessoas: um casal e uma criança de 5 anos',3],
    ['São 3 adultos e uma criança de 5 anos, incluindo um casal',4],
    ['Somos dois adultos e uma criança de 5 anos',3],
  ]) {
    const p=prepare(message,initial);
    const state=JSON.parse(p.state);
    assert.equal(state.facts.guests,expected,message);
    assert.deepEqual(state.facts.extras,['MESA'],message);
    assert.equal(state.pending,undefined,message);
    assert.equal(p.can_collect,'NAO',message);
  }
});

test('total que diverge da composição exige esclarecimento antes de cotar',()=>{
  const p=prepare('Somos 4 pessoas: um casal e uma criança de 5 anos',initial);
  const state=JSON.parse(p.state);
  assert.equal(state.facts.guests,undefined);
  assert.equal(state.family_clarification,'party_composition');
  assert.equal(state.facts.children_pending,true);
  const r=control({operation:'route',user_message:'Somos 4 pessoas: um casal e uma criança de 5 anos',state:p.state,proposed:'QUOTE|2026-10-20|2026-10-25|4|NONE'},now);
  assert.equal(r.quote_request,'NOQUOTE');
  assert.equal(r.can_collect,'NAO');
});

test('contexto de pacote expira em 30 minutos e não aceita timestamp inválido ou futuro',async()=>{
  const opened=await openPackage();
  const state=JSON.parse(opened.state);
  const current=Date.now();
  const valid={...state,topic_at:current-30*60000,package_context:{...state.package_context,updated_at:current-30*60000}};
  const p=prepare('Qual você me indica?',valid,current);
  assert.equal(JSON.parse(p.state).package_context.id,'reveillon');
  for (const stamp of [current-30*60000-1,current+1000,0,'inválido',null]) {
    const stale={...state,topic_at:stamp,package_context:{...state.package_context,updated_at:stamp}};
    const next=prepare('Qual você me indica?',stale,current);
    assert.equal(JSON.parse(next.state).package_context,undefined,String(stamp));
    assert.notEqual(JSON.parse(next.state).topic,'package_info',String(stamp));
    assert.doesNotMatch(JSON.parse(next.state).resolved_message,/Réveillon|2026-12-31/);
  }
});

test('fotos, humano e novo assunto limpam pacote sem confundir informações posteriores',async()=>{
  const opened=await openPackage();
  for (const message of ['Fotos da hidromassagem','Quero falar com a recepção','Qual o cardápio do Reserva Solar?']) {
    const p=prepare(message,opened.state);
    assert.equal(JSON.parse(p.state).package_context,undefined,message);
    assert.notEqual(JSON.parse(p.state).topic,'package_info',message);
    const r=route(message,p.state,Date.now(),'A equipe pode ajudar.');
    if (message.includes('recepção')) assert.equal(r.quote_request,'HUMANO');
    if (message.includes('Fotos')) {
      const result=await resolve(message,r.state);
      assert.match(result.quote_request,/^EXTRA_ID\|HIDRO\|/);
      assert.doesNotMatch(result.conversation_text,/Réveillon|Natal/);
    }
    noConsent(r);
  }
});

test('comprovante cancela foco de pacote e segue financeiro sem pagar, reservar ou usar datas do catálogo',async()=>{
  const opened=await openPackage();
  const message='https://media.example.test/payment.pdf';
  const p=await handleConversation({operation:'prepare',user_message:message,state:opened.state},'',
    async()=>{throw Error('No transcription expected');},Date.now(),async()=>({kind:'payment_receipt',summary:''}));
  const r=route(message,p.state,Date.now(),'Pagamento e reserva confirmados.');
  assert.equal(r.quote_request,'ANEXO_FINANCEIRO');
  assert.equal(JSON.parse(r.state).package_context,undefined);
  assert.notEqual(JSON.parse(r.state).topic,'package_info');
  assert.doesNotMatch(r.answer,/pagamento confirmado|reserva confirmada|8\.400|31\/12/);
  assert.deepEqual(JSON.parse(r.state).facts,JSON.parse(opened.state).facts);
  noConsent(r);
});

test('escolha explícita com cotação válida do pacote preserva o cartão e a confirmação independente',async()=>{
  const opened=await openPackage();
  const state=JSON.parse(opened.state);
  state.facts={guests:3,extras:[],check_in:'2026-12-31',check_out:'2027-01-03'};
  const quote={version:1,id:'current-package-quote',created_at:Date.now(),...state.facts,options:[{name:'Loft',capacity:4,total:8400}]};
  const message='Quero o Loft';
  const p=control({operation:'prepare',user_message:message,state,quote_state:quote});
  const r=control({operation:'route',user_message:message,state:p.state,quote_state:quote,proposed:'COLETAR'});
  assert.equal(r.quote_request,'COLETAR');
  assert.equal(r.can_collect,'NAO');
  assert.match(r.confirmation_text,/31\/12\/2026.*03\/01\/2027/s);
  assert.equal(JSON.parse(r.state).pending.quote_id,quote.id);
  const confirmed=control({operation:'confirm',state:r.state,quote_state:quote});
  assert.equal(confirmed.can_collect,'SIM');
  assert.equal(JSON.parse(confirmed.state).pending,undefined);
});

test('datas numéricas diferentes continuam no pacote e pedem esclarecimento sem cotar outro período',async()=>{
  const opened=await openPackage();
  for (const message of ['de 01/01/2027 a 03/01/2027','Qual valor de 04/09/2026 a 06/09/2026?']) {
    const p=prepare(message,opened.state);
    const r=route(message,p.state);
    assert.equal(r.quote_request,'NOQUOTE');
    const result=await resolve(message,r.state);
    const {facts,package_context}=JSON.parse(result.state);
    assert.equal(package_context.id,'reveillon');
    assert.match(result.conversation_text,/Réveillon.*31\/12\/2026.*03\/01\/2027/s);
    assert.match(result.conversation_text,/datas.*diferentes.*exige o período completo/s);
    assert.doesNotMatch(result.conversation_text,/R\$|8\.400|6\.300/);
    assert.equal(facts.check_in,message.includes('04/09') ? '2026-09-04' : '2027-01-01');
    noConsent(r);
    noConsent(result);
  }
});

test('pedido de reserva sem cotação não confirma nem reutiliza simulação de setembro',async()=>{
  const opened=await openPackage();
  const p=prepare('Quero reservar o Loft',opened.state);
  const r=route('Quero reservar o Loft',p.state);
  const result=await resolve('Quero reservar o Loft',r.state);
  assert.equal(r.quote_request,'NOQUOTE');
  assert.equal(result.quote_request,'ROOM_LIST');
  assert.match(result.conversation_text,/Réveillon.*recepção.*Ainda não há reserva confirmada/s);
  assert.doesNotMatch(result.conversation_text,/04\/09|06\/09|1\.777|CPF/);
  noConsent(r);
  noConsent(result);
  catalogIsNotClientDates(result.state);
});

test('quero saber valores continua informativo e nova viagem abandona as datas anteriores',async()=>{
  const opened=await openPackage();
  const info=await followup('Quero saber os valores',opened.state);
  assert.match(info.conversation_text,/8\.400,00/);
  const state=JSON.parse(opened.state);
  state.facts={guests:3,extras:[],check_in:'2026-12-31',check_out:'2027-01-03'};
  const quote={version:1,id:'current-package-quote',created_at:Date.now(),...state.facts,options:[{name:'Loft',capacity:4,total:8400}]};
  const message='Quero reservar para outro período';
  const p=control({operation:'prepare',user_message:message,state,quote_state:quote});
  catalogIsNotClientDates(p.state);
  assert.equal(JSON.parse(p.state).package_context,undefined);
  const r=control({operation:'route',user_message:message,state:p.state,quote_state:quote,proposed:'COLETAR'});
  assert.equal(r.quote_request,'NOQUOTE');
  assert.match(r.answer,/datas de entrada e saída/);
  noConsent(r);
});

test('conhecer Loft não é escolha e comprovante não é consulta dos valores do pacote',async()=>{
  const opened=await openPackage();
  const state=JSON.parse(opened.state);
  state.facts={guests:3,extras:[],check_in:'2026-12-31',check_out:'2027-01-03'};
  const quote={version:1,id:'current-package-quote',created_at:Date.now(),...state.facts,options:[{name:'Loft',capacity:4,total:8400}]};
  const message='Quero conhecer o Loft';
  const p=control({operation:'prepare',user_message:message,state,quote_state:quote});
  const r=control({operation:'route',user_message:message,state:p.state,quote_state:quote,proposed:'COLETAR'});
  assert.equal(r.quote_request,'NOQUOTE');
  noConsent(r);
  for (const message of ['Preciso enviar comprovante de pagamento','Meu pagamento já foi confirmado?']) {
    const next=prepare(message,opened.state);
    assert.equal(JSON.parse(next.state).package_context,undefined,message);
    assert.notEqual(JSON.parse(next.state).topic,'package_info',message);
  }
});
