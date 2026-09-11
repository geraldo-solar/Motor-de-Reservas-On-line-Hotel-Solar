import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

const queries = [];
globalThis.__guestInquiryResolverQuery = table => queries.push(table);
const source = `
  const data = {
    extras: [],
    room_types: [{id:'11111111-1111-4111-8111-111111111111',name:'Loft',capacity:4,base_price:500,active:true,images:['https://fixture.invalid/loft.jpg']}],
    packages: [{id:'22222222-2222-4222-8222-222222222222',name:'Réveillon Solar',active:true,start_iso_date:'2026-12-31',end_iso_date:'2027-01-03'}],
  };
  export function createClient() {
    return {from(table) {
      globalThis.__guestInquiryResolverQuery(table);
      return {select() {
        let rows=data[table]||[];
        const query={eq(key,value){rows=rows.filter(row=>row[key]===value);return query;},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve);}};
        return query;
      }};
    }};
  }
`;
async function load(file) {
  const bundled = await build({entryPoints:[file],bundle:true,write:false,platform:'node',format:'esm',
    define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
    plugins:[{name:'guest-inquiry-fixture',setup(builder) {
      builder.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
      builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:source,loader:'js'}));
    }}],
  });
  return import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
}
const {control,handleConversation} = await load('api/conversation-control.ts');
const handler = (await load('api/resolve-package.ts')).default;
const now = Date.now();
const oldFacts = {guests:4,check_in:'2026-09-20',check_out:'2026-09-25',extras:['MESA'],children_pending:true};
const initial = {version:2,history:[],facts:oldFacts,greeted:true,daily_greeting:{day:new Date(now-3*3600000).toISOString().slice(0,10),first:false}};
function turn(user_message,state=initial,answer='Continuamos com a informação solicitada.',proposed='QUOTE|2026-09-15|2026-09-16|3|MESA') {
  const prepared = control({operation:'prepare',user_message,state},now);
  const routed = control({operation:'route',user_message,state:prepared.state,ai_response:answer,proposed},now);
  return {prepared,routed};
}
async function resolve(user_message,state,operation) {
  let output;
  await handler({method:'POST',body:{user_message,state},...(operation?{query:{operation}}:{})},{
    status(code){assert.equal(code,200);return this;},json(value){output=value;},
  });
  return output;
}

test('controller → resolver devolve a resposta informativa atual sem catálogo, mídia ou nova cotação',async()=>{
  for (const [message,answer] of [
    ['O café da manhã está incluso na diária?','Posso explicar o que está incluído na diária.'],
    ['Pets na hospedagem','Posso esclarecer a política sobre animais.'],
    ['Pagamento da reserva','Posso esclarecer as condições de pagamento.'],
    ['Horário para entrar no quarto','Posso informar o horário de entrada do hotel.'],
    ['Esse total é pelas 3 diárias ou por dia?','Posso esclarecer a base do total apresentado.'],
    ['Esse valor é por diária ou pelo pacote?','Posso esclarecer a qual período esse valor se refere.'],
    ['Quanto custa o day use para 2 adultos?','Posso explicar as informações disponíveis sobre Day Use.'],
    ['Quero almoçar para 2 pessoas','Continuamos com sua consulta sobre almoço.'],
  ]) {
    queries.length=0;
    const {routed}=turn(message,initial,answer);
    const result=await resolve(message,routed.state);
    assert.equal(result.quote_request,'ROOM_LIST',message);
    assert.equal(result.match_type,'guest_information',message);
    assert.equal(result.conversation_text,answer,message);
    assert.equal(result.quote_text,answer,message);
    assert.equal(result.availability_checked,false,message);
    assert.deepEqual(JSON.parse(result.state).facts,oldFacts,message);
    assert.deepEqual(queries,[],message);
    assert.doesNotMatch(result.quote_request,/QUOTE\||PHOTO|EXTRA_ID|ROOM_ID|PACKAGE_ID/);
  }
});

test('café para visitante → pessoas → data → aniversário mantém a resposta atual e não consulta catálogo',async()=>{
  let state=initial;
  for (const [message,answer] of [
    ['Quem não está hospedado pode tomar café da manhã no hotel?','Sua consulta é sobre o café da manhã para visitantes.'],
    ['Seria para 03 pessoas','Continuamos falando do café da manhã para as pessoas informadas.'],
    ['Dia 15/09/26','Continuamos com a consulta do café da manhã para o dia informado.'],
    ['Aniversário do meu pai','Entendi a ocasião familiar; continuamos com as informações sobre o café.'],
  ]) {
    queries.length=0;
    const {routed}=turn(message,state,answer);
    const result=await resolve(message,routed.state);
    assert.equal(result.quote_request,'ROOM_LIST',message);
    assert.equal(result.conversation_text,answer,message);
    assert.deepEqual(JSON.parse(result.state).facts,oldFacts,message);
    assert.deepEqual(queries,[],message);
    state=result.state;
  }
});

test('entrada no Reserva Solar em feriado preserva política confirmada sem buscar pacotes',async()=>{
  for (const message of [
    'No feriado preciso pagar para entrar no Reserva Solar?',
    'Quanto custa a entrada no Reserva Solar no Réveillon?',
    'Nas férias a entrada do Reserva Solar é gratuita?',
  ]) {
    queries.length=0;
    const {routed}=turn(message,initial,'A entrada custa R$ 40.');
    const result=await resolve(message,routed.state);
    assert.equal(result.quote_request,'ROOM_LIST',message);
    assert.equal(result.match_type,'guest_information',message);
    assert.equal(result.conversation_text,routed.answer,message);
    assert.match(result.conversation_text,/gratuita como regra/);
    assert.doesNotMatch(result.conversation_text,/R\$|40|quantas pessoas|pacote/i);
    assert.deepEqual(JSON.parse(result.state).facts,oldFacts,message);
    assert.deepEqual(queries,[],message);
  }
});

test('áudio transcrito retorna a resposta informativa pertencente ao arquivo atual',async()=>{
  queries.length=0;
  const source='https://media.example.test/voice.ogg';
  const answer='Continuamos com sua consulta sobre almoço.';
  const prepared=await handleConversation({operation:'prepare',user_message:source,state:initial},'',
    async()=> 'Quero almoçar para 2 pessoas',now);
  const routed=control({operation:'route',user_message:source,state:prepared.state,ai_response:answer,proposed:'NOQUOTE'},now);
  const result=await resolve(source,routed.state);
  assert.equal(result.match_type,'guest_information');
  assert.equal(result.quote_text,answer);
  assert.deepEqual(queries,[]);
});

test('sem resposta atual, não reutiliza texto de outro turno nem pergunta por fotos',async()=>{
  const message='Pets na hospedagem';
  const prepared=turn(message).prepared;
  for (const turns of [
    [{role:'assistant',text:'Já enviei fotos do Loft.'},{role:'user',text:message}],
    [{role:'user',text:'Qual o valor da hospedagem?'},{role:'assistant',text:'Resposta antiga que não pertence à pergunta atual.'}],
    [{role:'user',text:message},{role:'assistant',text:'De qual espaço do hotel você gostaria de ver fotos?'}],
    [{role:'user',text:message},{role:'assistant',text:'Resposta com email cliente@example.test'}],
  ]) {
    queries.length=0;
    const state={...JSON.parse(prepared.state),turns};
    const result=await resolve(message,state);
    assert.equal(result.quote_request,'ROOM_LIST');
    assert.equal(result.conversation_text,'Pode detalhar qual informação do hotel você deseja esclarecer?');
    assert.doesNotMatch(result.conversation_text,/Loft|antiga|fotos|example|CPF/);
    assert.deepEqual(queries,[]);
  }
});

test('estado expirado ou de outra mensagem não é usado como resposta informativa atual',async()=>{
  const message='Pets na hospedagem';
  const {routed}=turn(message,initial,'RESPOSTA ANTIGA EXCLUSIVA');
  for (const state of [
    {...JSON.parse(routed.state),guest_inquiry:{kind:'lodging_faq',at:now-31*60000}},
    {...JSON.parse(routed.state),history:['Outra pergunta'],resolved_message:'Outra pergunta'},
  ]) {
    const result=await resolve(message,state);
    assert.notEqual(result.match_type,'guest_information');
    assert.doesNotMatch(result.conversation_text||'',/RESPOSTA ANTIGA EXCLUSIVA/);
  }
});

test('fallback não mídia preserva informação de visitantes, saudação e facilidade sem fotos nem cotação',async()=>{
  for (const [message,answer] of [
    ['Seu restaurante e sua piscina é somente para hóspede? Ou também para não hóspede?',
      'Podemos esclarecer o acesso de visitantes ao restaurante e à piscina.'],
    ['Boa tarde!', 'Boa tarde, como posso ajudar?'],
    ['O hotel tem elevador?', 'Podemos esclarecer as informações de acesso ao hotel.'],
  ]) {
    queries.length=0;
    const {routed}=turn(message,initial,answer,'NOQUOTE');
    assert.equal(routed.quote_request,'NOQUOTE',message);
    const result=await resolve(message,routed.state);
    assert.equal(result.quote_request,'ROOM_LIST',message);
    assert.equal(result.match_type,'general_information',message);
    assert.equal(result.conversation_text,routed.answer,message);
    assert.deepEqual(JSON.parse(result.state).facts,oldFacts,message);
    assert.deepEqual(queries,['packages','room_types'],message);
    assert.doesNotMatch(result.conversation_text,/de qual espaço|enviei.*foto|fotos solicitadas/i);
  }
});

test('fallback geral sem par atual não reaproveita resposta antiga ou pergunta fotográfica',async()=>{
  const message='O hotel tem elevador?';
  const {prepared}=turn(message,initial,'','NOQUOTE');
  for (const turns of [
    [{role:'assistant',text:'Resposta antiga.'},{role:'user',text:message}],
    [{role:'user',text:'Outra pergunta'},{role:'assistant',text:'Resposta antiga.'}],
    [{role:'user',text:message},{role:'assistant',text:'De qual espaço do hotel você gostaria de ver fotos?'}],
    [{role:'user',text:message},{role:'assistant',text:'Pode falar com cliente@example.test'}],
  ]) {
    const result=await resolve(message,{...JSON.parse(prepared.state),turns});
    assert.equal(result.quote_request,'ROOM_LIST');
    assert.equal(result.match_type,'general_information');
    assert.equal(result.conversation_text,'Pode detalhar como podemos ajudar com sua dúvida sobre o hotel?');
    assert.doesNotMatch(result.conversation_text,/antiga|fotos|example/);
  }
});

test('pergunta documental mantém resposta atual e ausência de texto usa esclarecimento sem fotos do hotel',async()=>{
  const message='Como envio foto do comprovante?';
  const answer='Pode enviar o documento por aqui para a equipe conferir.';
  const {prepared,routed}=turn(message,initial,answer,'NOQUOTE');
  const unrelated={...JSON.parse(routed.state),history:['Pergunta anterior'],turns:[
    {role:'user',text:'Pergunta anterior'},{role:'assistant',text:'Resposta documental antiga.'},
  ]};
  for (const [state,expected] of [
    [routed.state,answer],
    [prepared.state,'Pode detalhar sua dúvida sobre o anexo?'],
    [unrelated,'Pode detalhar sua dúvida sobre o anexo?'],
  ]) {
    queries.length=0;
    const result=await resolve(message,state);
    assert.equal(result.quote_request,'ROOM_LIST');
    assert.equal(result.match_type,'document_information');
    assert.equal(result.conversation_text,expected);
    assert.deepEqual(queries,[]);
    assert.doesNotMatch(result.conversation_text,/de qual espaço|hidromassagem|Loft|pagamento confirmado/i);
  }
});

test('pedido novo de foto, pacote e operação de fila mantêm seus caminhos próprios',async()=>{
  const dining=turn('Quero almoçar para 2 pessoas').routed.state;
  for (const [message,prefix,hasQueries=true] of [
    ['Quero fotos da hidromassagem','EXTRA_ID|HIDRO|'],
    ['Quero fotos do Loft','ROOM_ID|'],
    ['Quero fotos do restaurante Reserva Solar','SITE_ID|',false],
    ['Quero informações sobre o pacote Réveillon','PACKAGE_ID|'],
  ]) {
    queries.length=0;
    const {routed}=turn(message,dining);
    const result=await resolve(message,routed.state);
    assert.ok(result.quote_request.startsWith(prefix),message);
    assert.notEqual(result.match_type,'guest_information',message);
    assert.equal(queries.length>0,hasQueries,message);
  }
  const next=await resolve('EXTRA_ID|HIDRO||PAID',dining,'next');
  assert.equal(next.quote_request,'ROOM_DONE');
  const offers=await resolve('Sem ofertas',dining,'offers');
  assert.equal(offers.quote_request,'ROOM_DONE');
});

test('humano e anexo não criam saída informativa no lugar do atendimento existente',async()=>{
  const dining=turn('Quero almoçar para 2 pessoas').routed.state;
  for (const message of ['Quero falar com a recepção','O valor no link de pagamento está errado']) {
    const {routed}=turn(message,dining);
    assert.equal(routed.quote_request,'HUMANO');
    assert.equal(JSON.parse(routed.state).guest_inquiry,undefined);
  }
  const attachment=await resolve('https://media.example.test/document.pdf',dining);
  assert.equal(attachment.match_type,'attachment');
  assert.notEqual(attachment.match_type,'guest_information');
});
