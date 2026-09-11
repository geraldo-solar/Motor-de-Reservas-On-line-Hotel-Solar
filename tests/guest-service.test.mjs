import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

// Every dependency is local/in-memory. These probes never place orders,
// emit documents, contact guests or dispatch the native human handoff.
const queries = [];
globalThis.__guestServiceQuery = table => queries.push(table);
const fixture = `export function createClient(){return{from(table){globalThis.__guestServiceQuery(table);return{select(){const query={eq(){return query},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)}};return query}}}}}`;
async function load(entry, configured = false) {
  const result = await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'esm',
    define:{'process.env.VITE_SUPABASE_URL':JSON.stringify(configured?'https://fixture.invalid':''),
      'process.env.VITE_SUPABASE_ANON_KEY':JSON.stringify(configured?'fixture':''),
      'process.env.SUPABASE_URL':'""','process.env.SUPABASE_ANON_KEY':'""'},
    plugins:[{name:'guest-service-fixture',setup(b){
      b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'js'}));
    }}],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const {guestServiceRequest,guestServiceContext,guestServiceAnswer} = await load('utils/guestService.ts');
const {guestFacilityAnswer} = await load('utils/guestFacilities.ts');
const {control,handleConversation} = await load('api/conversation-control.ts');
const withoutDatabase = (await load('api/resolve-package.ts')).default;
const withDatabase = (await load('api/resolve-package.ts',true)).default;
const now = Date.now();
const facts = {guests:2,check_in:'2026-10-20',check_out:'2026-10-25',extras:['MESA']};
const initial = {version:2,history:[],facts,greeted:true,daily_greeting:{day:new Date(now-3*3600000).toISOString().slice(0,10),first:false}};
const empty = {version:2,history:[],facts:{extras:[]},greeted:true,daily_greeting:{day:new Date(now-3*3600000).toISOString().slice(0,10),first:false}};
const unsafeAnswer = 'Já emiti os documentos, fiz o pedido, acionei a manutenção, entreguei as toalhas e encontrei sua blusa.';
const examples = [
  ['Estou hospedado, preciso de toalhas no quarto','housekeeping'],
  ['Não tem toalha pra banho no B105','housekeeping'],
  ['Estamos sem toalhas','housekeeping'],
  ['Preciso de uma toalha e também de travesseiro para minha filha. Meu apartamento B105','housekeeping'],
  ['O ar condicionado do meu quarto não está funcionando','maintenance'],
  ['Teria como ver se o ar condicionado está funcionando bem no B105, por favor? Porque está no 16 mas está calor','maintenance'],
  ['Será que vocês podem verificar o ar condicionado do meu quarto?','maintenance'],
  ['Vou querer 1 hambúrguer e uma coca zero, apartamento B105','room_service'],
  ['Vou querer 1 burger kids e uma coca zero','room_service'],
  ['Estou aguardando a nota fiscal e o voucher do grupo que entra hoje','booking_document'],
  ['Estou aguardando a nota fiscal e o voucher da reserva do grupo que entra hoje','booking_document'],
  ['Pode reenviar a nota fiscal da minha reserva?','booking_document'],
  ['Pode me enviar a nota fiscal?','booking_document'],
  ['Pode nos reenviar o voucher?','booking_document'],
  ['Por favor, emita a nota fiscal','booking_document'],
  ['Esqueci uma blusa','lost_item'],
  ['Esqueci uma blusa no Reserva, no show do Heraldo. Podem verificar?','lost_item'],
];
function turn(message, state = initial, proposed = 'QUOTE|2026-10-20|2026-10-25|2|MESA') {
  const prepared = control({operation:'prepare',user_message:message,state},now);
  const routed = control({operation:'route',user_message:message,state:prepared.state,proposed,ai_response:unsafeAnswer},now);
  return {prepared,routed,state:JSON.parse(routed.state),context:JSON.parse(prepared.context)};
}
async function resolve(message,state,handler = withoutDatabase,operation) {
  let output;
  await handler({method:'POST',body:{user_message:message,state},query:operation?{operation}:{}},
    {status(code){assert.equal(code,200);return this;},json(result){output=result;return this;}});
  return output;
}

test('pedidos atuais de reposição, manutenção, alimentação, documentos e objetos perdidos são separados de reservas',()=>{
  for (const [message,kind] of examples) assert.equal(guestServiceRequest(message),kind,message);
  for (const kind of ['housekeeping','maintenance','room_service','booking_document','lost_item'])
    assert.equal(guestServiceRequest(guestServiceContext(kind)),kind,kind);
});

test('FAQ, política, fotos e procedimento não executam atendimento operacional',()=>{
  for (const message of [
    'Tem toalhas?', 'Os quartos têm ar condicionado?', 'Tem travesseiro no quarto?',
    'Quero saber se tem hambúrguer para comer no quarto', 'Quanto custa um hambúrguer?',
    'Pode mandar o cardápio?', 'Vocês emitem nota fiscal?', 'Como solicito a nota fiscal da minha reserva?',
    'Pode emitir nota fiscal?',
    'Como posso pedir toalhas no quarto?', 'O que fazer se o ar condicionado do quarto não está funcionando?',
    'Quero fotos do ar condicionado no quarto', 'Quero cotar quarto com ar condicionado',
    'Quero um quarto com hambúrguer incluído', 'Vou querer hospedagem com um hambúrguer para o quarto',
    'Esqueci de perguntar sobre toalhas', 'Esqueci minha senha', 'Perdi o contexto',
  ]) assert.equal(guestServiceRequest(message),undefined,message);
});

test('negação e retirada de pedidos não geram HUMANO operacional injustificado',()=>{
  for (const message of [
    'Não preciso mais de toalhas no quarto', 'Não quero hambúrguer para o quarto',
    'Pode cancelar meu pedido de hambúrguer para o quarto', 'Retire meu pedido de toalhas no quarto',
    'Não envie a nota fiscal da minha reserva', 'Não perdi minha blusa',
    'O ar condicionado do meu quarto não está com defeito',
  ]) {
    assert.equal(guestServiceRequest(message),undefined,message);
    assert.notEqual(turn(message).routed.quote_request,'HUMANO',message);
  }
});

test('controller bloqueia cotação antiga e alegações de execução sem alterar fatos ou pedir dados',()=>{
  for (const [message,kind] of examples) for (const prior of [initial,empty]) {
    const result = turn(message,prior);
    assert.equal(result.routed.quote_request,'HUMANO',message);
    assert.equal(result.routed.answer,guestServiceAnswer,message);
    assert.equal(result.routed.can_collect,'NAO',message);
    assert.equal(result.routed.confirmation_text,'',message);
    assert.deepEqual(result.state.facts,prior.facts,message);
    assert.equal(result.context.solicitacao_operacional,kind,message);
    assert.equal(result.context.cotacao_valida_para_estes_dados,null,message);
    assert.equal(result.state.pending,undefined,message);
    assert.equal(result.state.event,undefined,message);
    assert.doesNotMatch(result.routed.answer,/Luiza|já|emiti|entreguei|encontrei|trocar/i,message);
  }
});

test('estado conserva somente a categoria operacional, sem apartamento, pedido, filha ou identificação',()=>{
  const result = turn('Preciso de toalhas para minha filha no apartamento B105. Meu nome é Pessoa Sintética, contato pessoa@example.invalid');
  assert.equal(result.routed.quote_request,'HUMANO');
  assert.deepEqual(result.state.history,[guestServiceContext('housekeeping')]);
  assert.doesNotMatch(result.routed.state,/B105|filha|Pessoa Sintética|example\.invalid/i);
  assert.doesNotMatch(result.prepared.context,/B105|filha|Pessoa Sintética|example\.invalid/i);
  assert.deepEqual(result.state.facts,facts);
  const food=turn('Vou querer 1 burger kids e uma coca zero',empty);
  assert.equal(food.routed.quote_request,'HUMANO');
  assert.doesNotMatch(food.routed.state,/estou hospedado|para o quarto|apartamento/i);
  assert.deepEqual(food.state.facts,empty.facts);
});

test('route e confirm sem prepare ainda impedem cartão antigo e avanço de evento',()=>{
  for (const operation of ['route','confirm']) {
    const result = control({operation,user_message:'Estou aguardando a nota fiscal da reserva do grupo',
      state:{...initial,pending:{quote_id:'old',option:'Loft'},topic:'room_photos',topic_at:now,subject:'Loft'},
      ai_response:unsafeAnswer,proposed:'COLETAR'},now);
    assert.equal(result.quote_request,'HUMANO');
    assert.equal(result.answer,guestServiceAnswer);
    assert.equal(result.can_collect,'NAO');
    assert.equal(result.confirmation_text,'');
    const state=JSON.parse(result.state);
    assert.equal(state.pending,undefined);
    assert.equal(state.topic,undefined);
    assert.deepEqual(state.facts,facts);
  }
});

test('pedido operacional encerra fotos/pacote sem transformar familiares, datas ou itens em fatos',()=>{
  for (const state of [
    {...initial,topic:'extra_photos',topic_at:now,extra_photo_subjects:['HIDRO']},
    {...initial,guest_inquiry:{kind:'dining',at:now}},
    {...initial,topic:'package_info',topic_at:now,package_context:{id:'reveillon',name:'Réveillon',start_date:'2026-12-30',end_date:'2027-01-03',updated_at:now}},
  ]) {
    const result=turn('Preciso de uma toalha e também de travesseiro para minha filha. Meu apartamento B105',state);
    assert.equal(result.routed.quote_request,'HUMANO');
    assert.equal(result.state.topic,undefined);
    assert.equal(result.state.package_context,undefined);
    assert.equal(result.state.guest_inquiry,undefined);
    assert.deepEqual(result.state.facts,facts);
  }
});

test('solicitação passada não prende nova FAQ nem novo pedido explícito de cotação',()=>{
  const previous=turn('Estou hospedado, preciso de toalhas no quarto');
  const faq=turn('Qual o horário do café da manhã?',previous.state);
  assert.equal(faq.routed.quote_request,'NOQUOTE');
  assert.equal(faq.context.solicitacao_operacional,undefined);
  const quote=turn('Quero hospedagem de 11/10 a 13/10 para 2 hóspedes',previous.state);
  assert.equal(quote.routed.quote_request,'QUOTE|2026-10-11|2026-10-13|2|MESA');
});

test('resolver devolve HUMANO existente antes da configuração Supabase, catálogo, fotos e Luiza',async()=>{
  for (const [message] of examples) {
    queries.length=0;
    const previous=turn(message);
    for (const state of [initial,previous.routed.state]) {
      const result=await resolve(message,state);
      assert.equal(result.quote_request,'HUMANO',message);
      assert.equal(result.match_type,'guest_service',message);
      assert.equal(result.conversation_text,guestServiceAnswer,message);
      assert.equal(result.quote_text,guestServiceAnswer,message);
      assert.equal(result.availability_checked,false,message);
      assert.equal(result.can_collect,'NAO',message);
    }
    assert.deepEqual(queries,[],message);
  }
});

test('resolver não usa resposta antiga de emissão nem cria pedido pelo texto de offers',async()=>{
  const result=await resolve('Estou aguardando a nota fiscal da reserva do grupo',
    {...initial,turns:[{role:'assistant',text:unsafeAnswer}]});
  assert.equal(result.conversation_text,guestServiceAnswer);
  const offers=await resolve('Estou aguardando a nota fiscal da reserva do grupo',initial,withDatabase,'offers');
  assert.equal(offers.quote_request,'ROOM_DONE');
  assert.notEqual(offers.match_type,'guest_service');
});

test('áudio operacional é anonimizado e roteado pelo mesmo HUMANO; áudio antigo não é reutilizado',async()=>{
  const source='https://media.example.test/guest-service.ogg';
  const prepared=await handleConversation({operation:'prepare',user_message:source,state:initial},'',
    async()=> 'Vou querer 1 hambúrguer e uma coca zero, apartamento B105. Meu nome é Pessoa Sintética',now);
  assert.equal(JSON.parse(prepared.context).solicitacao_operacional,'room_service');
  assert.doesNotMatch(prepared.state,/B105|hambúrguer|Pessoa Sintética/);
  const result=await resolve(source,prepared.state);
  assert.equal(result.quote_request,'HUMANO');
  assert.equal(result.conversation_text,guestServiceAnswer);
  const following=control({operation:'prepare',user_message:'Estamos sem toalhas',state:prepared.state},now);
  assert.equal(JSON.parse(following.state).audio,undefined);
  const stale=await resolve(source,following.state,withDatabase);
  assert.notEqual(stale.quote_request,'HUMANO');
});

test('copa baby é FAQ confirmada, sem nova criança ou cotação e sem catálogo no resolver',async()=>{
  for (const message of [
    'Tem microondas?', 'Tem quarto com microondas?', 'Posso esquentar a comida do bebê?',
    'Quero aquecer minha marmita', 'Qual o horário para usar a copa baby?',
  ]) {
    queries.length=0;
    const result=turn(message);
    assert.equal(result.routed.quote_request,'NOQUOTE',message);
    assert.equal(result.routed.answer,guestFacilityAnswer(message),message);
    assert.equal(result.state.guest_inquiry?.kind,'lodging_faq',message);
    assert.deepEqual(result.state.facts,facts,message);
    assert.equal(result.context.politica_instalacoes_confirmada?.status,'owner_confirmed',message);
    assert.equal(result.state.family_party,undefined,message);
    const resolved=await resolve(message,result.routed.state,withDatabase);
    assert.equal(resolved.quote_request,'ROOM_LIST',message);
    assert.equal(resolved.conversation_text,guestFacilityAnswer(message),message);
    assert.deepEqual(queries,[],message);
  }
});

test('FAQ de micro-ondas não fica presa ao pacote, mas cotação explícita continua válida',()=>{
  const previous={...initial,topic:'package_info',topic_at:now,package_context:{
    id:'reveillon',name:'Réveillon',start_date:'2026-12-30',end_date:'2027-01-03',updated_at:now}};
  const faq=turn('Posso esquentar comida do bebê?',previous);
  assert.equal(faq.routed.quote_request,'NOQUOTE');
  assert.equal(faq.routed.answer,guestFacilityAnswer('Posso esquentar comida do bebê?'));
  assert.deepEqual(faq.state.facts,facts);
  const quote=turn('Quero cotação de hospedagem de 11/10 a 13/10 para 2 hóspedes com microondas');
  assert.equal(quote.routed.quote_request,'QUOTE|2026-10-11|2026-10-13|2|MESA');
  const guests=turn('Quero cotação para 2 hóspedes de 11/10 a 13/10 com copa baby');
  assert.equal(guests.routed.quote_request,'QUOTE|2026-10-11|2026-10-13|2|MESA');
  const oneDay=turn('Quero uma diária com micro-ondas');
  assert.equal(oneDay.state.guest_inquiry,undefined);
  assert.notEqual(oneDay.routed.answer,guestFacilityAnswer('Tem micro-ondas?'));
  assert.equal(oneDay.state.facts.check_out,undefined);
});

test('pedido à equipe para aquecer comida vai ao humano, sem prometer serviço ou deduzir hóspedes',async()=>{
  for (const message of ['Podem aquecer e trazer?', 'Vocês podem esquentar a papinha?', 'Pode esquentar minha comida?']) {
    const result=turn(message,empty);
    assert.equal(result.routed.quote_request,'HUMANO',message);
    assert.equal(result.routed.answer,guestServiceAnswer,message);
    assert.deepEqual(result.state.facts,empty.facts,message);
    assert.equal(result.context.solicitacao_operacional,'room_service',message);
    const resolved=await resolve(message,result.routed.state);
    assert.equal(resolved.quote_request,'HUMANO',message);
    assert.equal(resolved.conversation_text,guestServiceAnswer,message);
  }
});
