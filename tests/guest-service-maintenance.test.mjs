import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

// In-memory fixtures only: no model, database, WhatsApp, service order or handoff is called.
async function load(entry) {
  const result = await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'esm',
    define:{'process.env.VITE_SUPABASE_URL':'""','process.env.VITE_SUPABASE_ANON_KEY':'""',
      'process.env.SUPABASE_URL':'""','process.env.SUPABASE_ANON_KEY':'""'},
    plugins:[{name:'no-service-network',setup(b){
      b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function createClient(){throw new Error("Unexpected database access");}',loader:'js'}));
    }}],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const {guestServiceRequest,guestServiceAnswer,guestServiceContext}=await load('utils/guestService.ts');
const {control,handleConversation}=await load('api/conversation-control.ts');
const resolver=(await load('api/resolve-package.ts')).default;
const now=Date.now();
const initial={version:2,history:[],greeted:true,
  daily_greeting:{day:new Date(now-3*3600000).toISOString().slice(0,10),first:false},
  facts:{guests:4,check_in:'2026-10-11',check_out:'2026-10-13',extras:[],children_pending:true},
  family_party:{adults:2,children:2,total:4,ages_months:[],updated_at:now},
  topic:'package_info',topic_at:now,
  package_context:{id:'criancas',name:'Dia das Crianças',start_date:'2026-10-11',end_date:'2026-10-13',updated_at:now},
  pending:{quote_id:'old',option:'Loft'},
};
const cases=[
  ['O ar condicionado do meu quarto não funciona','maintenance'],
  ['O chuveiro do quarto não esquenta','maintenance'],
  ['Meu quarto está sem luz','maintenance'],
  ['Preciso de limpeza no meu quarto','housekeeping'],
];
const unsafe='Já fiz a limpeza, acionei a manutenção e confirmei a troca de apartamento. Informe seu CPF.';
function turn(message,proposed='COLETAR') {
  const prepared=control({operation:'prepare',user_message:message,state:initial},now);
  const routed=control({operation:'route',user_message:message,state:prepared.state,proposed,ai_response:unsafe},now);
  return {prepared,routed,state:JSON.parse(routed.state)};
}
async function resolve(message,state) {
  let result;
  await resolver({method:'POST',body:{user_message:message,state},query:{}},
    {status(code){assert.equal(code,200);return this;},json(value){result=value;return this;}});
  return result;
}

test('falhas presentes e pedido de limpeza são solicitações operacionais, não qualificação familiar',()=>{
  for(const [message,kind] of cases) assert.equal(guestServiceRequest(message),kind,message);
});

test('família pendente e oferta de pacote não bloqueiam HUMANO nem geram coleta ou promessa',()=>{
  for(const [message,kind] of cases) for(const proposal of ['COLETAR','PACKAGE|criancas','QUOTE|2026-10-11|2026-10-13|4|NONE']) {
    const {prepared,routed,state}=turn(message,proposal);
    assert.equal(JSON.parse(prepared.context).solicitacao_operacional,kind,message);
    assert.equal(routed.quote_request,'HUMANO',message);
    assert.equal(routed.can_collect,'NAO',message);
    assert.equal(routed.confirmation_text,'',message);
    assert.equal(routed.answer,guestServiceAnswer,message);
    assert.deepEqual(state.facts,initial.facts,message);
    assert.equal(state.pending,undefined,message);
    assert.equal(state.package_context,undefined,message);
    assert.equal(state.topic,undefined,message);
    assert.deepEqual(state.history,[guestServiceContext(kind)],message);
    assert.doesNotMatch(routed.answer,/CPF|idades|já|consertei|entreguei|acionei|limpei|confirmei/i,message);
  }
});

test('resolver intercepta manutenção e limpeza antes de catálogo ou resposta de pacote',async()=>{
  for(const [message] of cases) for(const state of [initial,turn(message).routed.state]) {
    const result=await resolve(message,state);
    assert.equal(result.quote_request,'HUMANO',message);
    assert.equal(result.match_type,'guest_service',message);
    assert.equal(result.conversation_text,guestServiceAnswer,message);
    assert.equal(result.can_collect,'NAO',message);
    assert.equal(result.availability_checked,false,message);
  }
});

test('áudio transcrito em memória mantém as quatro solicitações operacionais sem reaproveitar pacote',async()=>{
  for(const [index,[message,kind]] of cases.entries()) {
    const source=`https://media.example.test/maintenance-${index}.ogg`;
    const prepared=await handleConversation({operation:'prepare',user_message:source,state:initial},'',async()=>message,now);
    assert.equal(JSON.parse(prepared.context).solicitacao_operacional,kind,message);
    const result=await resolve(source,prepared.state);
    assert.equal(result.quote_request,'HUMANO',message);
    assert.equal(result.conversation_text,guestServiceAnswer,message);
    assert.equal(result.can_collect,'NAO',message);
  }
});

test('variações de falha, iluminação e limpeza permanecem no atendimento operacional',()=>{
  for(const [message,kind] of [
    ['O ar condicionado do meu quarto não gela','maintenance'],
    ['O chuveiro do meu quarto não aquece','maintenance'],
    ['As luzes do meu quarto não funcionam','maintenance'],
    ['Meu apartamento ficou sem energia','maintenance'],
    ['Podem limpar meu quarto?','housekeeping'],
    ['Gostaria de arrumação no apartamento','housekeeping'],
    ['Preciso que limpem meu quarto','housekeeping'],
  ]) assert.equal(guestServiceRequest(message),kind,message);
});

test('FAQ, hipótese, problema negado e pedido retirado não criam HUMANO operacional',()=>{
  for(const message of [
    'Os quartos têm ar condicionado?', 'O quarto tem chuveiro elétrico?',
    'Qual o horário da limpeza do quarto?', 'Preciso saber o horário de limpeza do meu quarto',
    'Como posso pedir a limpeza do quarto?', 'O que fazer se meu quarto está sem luz?',
    'Se o chuveiro do quarto não esquenta, o que faço?',
    'Não quero limpeza no meu quarto', 'Não preciso de limpeza no meu quarto',
    'Não limpem meu quarto', 'Preciso que não arrumem meu quarto',
    'Pode cancelar a limpeza do meu quarto', 'Meu quarto já foi limpo',
    'Meu quarto não está sem luz', 'Meu apartamento não ficou sem energia',
    'O ar condicionado do meu quarto não está com defeito',
    'Não é verdade que o ar condicionado do meu quarto não funciona',
    'Quero reservar quarto com limpeza diária e ar condicionado',
    'Preciso de informações sobre a limpeza do quarto',
  ]) assert.equal(guestServiceRequest(message),undefined,message);
});

test('ambiente de eventos e novos orçamentos não viram manutenção do apartamento',()=>{
  for(const message of [
    'O ar condicionado do auditório não funciona',
    'Preciso de limpeza no auditório para meu evento',
    'Estou hospedado. Preciso de limpeza no auditório para um evento',
    'Quero cotar hospedagem com limpeza de quarto e um evento no auditório',
  ]) assert.equal(guestServiceRequest(message),undefined,message);
});

test('pedidos existentes de alimentação e reposição conservam seus destinos',()=>{
  assert.equal(guestServiceRequest('Vou querer 1 hambúrguer e uma coca zero, apartamento B105'),'room_service');
  assert.equal(guestServiceRequest('Podem aquecer e trazer?'),'room_service');
  assert.equal(guestServiceRequest('Preciso de toalhas no meu quarto'),'housekeeping');
  assert.equal(guestServiceRequest('Não quero hambúrguer para o quarto'),undefined);
  assert.equal(guestServiceRequest('Solicito atendimento humano para reposição de itens.'),'housekeeping');
});
