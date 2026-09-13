import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { build } from 'esbuild';

const originalFetch=globalThis.fetch;
Reflect.set(globalThis,'fetch',async()=>{throw new Error('Unexpected external request in human-negation test');});
after(()=>Reflect.set(globalThis,'fetch',originalFetch));
const bundle = await build({stdin:{contents:`
  export { explicitHumanRequest, stripNegatedHumanRequests } from './utils/humanIntent.ts';
  export { guestInquiry } from './utils/guestInquiry.ts';
  export { guestFacilityInquiry } from './utils/guestFacilities.ts';
  export { diningPolicyAnswer, reservaHoursAnswer } from './utils/diningPolicy.ts';
  export { control, handleConversation } from './api/conversation-control.ts';
  export { default as resolver } from './api/resolve-package.ts';
`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'human-negation-no-database',setup(builder){
    builder.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:
      `export function createClient(){throw new Error('Unexpected database request in human-negation test');}`}));
  }}],
});
const {explicitHumanRequest:human,stripNegatedHumanRequests:strip,guestInquiry,guestFacilityInquiry,
  diningPolicyAnswer,reservaHoursAnswer,control,handleConversation,resolver} = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
async function resolve(user_message,state){
  let output;
  await resolver({method:'POST',body:{user_message,state}},{
    status(code){assert.equal(code,200);return this;},json(value){output=value;},
  });
  return output;
}

test('recusa explícita de humano não é pedido de transferência, com acentos ou pontuação', () => {
  for (const message of [
    'Não quero falar com atendente, só saber o horário da piscina.',
    'nao quero falar com atendente: so saber o horario da piscina',
    'NÃO QUERO FALAR COM ATENDENTE. Só saber o horário da piscina.',
    'Não precisa chamar a recepção, quero saber o café.',
    'Não chame o atendente; prefiro continuar por aqui.',
    'Prefiro não falar com um humano. Tem berço?',
    'Não quero atendimento humano, só uma informação.',
    'Dispenso falar com a recepção; qual o horário?',
    'Não preciso de ajuda de um funcionário, só do cardápio.',
    'Não me transfira para um atendente: só saber o horário.',
    'Não me encaminhe para a recepção. Tem café?',
    'Não quero que me transfira para um atendente. Tem café?',
    'Não quero que você chame a recepção. Tem berço?',
    'Não nos passe para um atendente; só uma dúvida.',
    'Não é necessário chamar a recepção, só saber o horário.',
    'Não é preciso falar com atendente, prefiro por aqui.',
    'Não quero nem falar com atendente. Tem berço?',
    'Não quero por enquanto falar com atendente. Tem berço?',
    'Não quero falar com a recepção nem com atendente. Tem berço?',
    'Não quero um humano e nem falar com a recepção. Qual o horário?',
  ]) {
    assert.equal(human(message), false, message);
    assert.doesNotMatch(strip(message), /atendente|recep[cç][aã]o|humano|funcion[aá]rio/i, message);
  }
});

test('solicitação afirmativa, dificuldade de contato e recusa de dados preservam humano', () => {
  for (const message of ['Quero falar com a recepção', 'Gostaria de conversar com um atendente',
    'Não consigo falar com atendente', 'Não conseguimos falar com a recepção',
    'Prefiro não informar', 'Não quero informar meu CPF', 'Me passe para um atendente',
    'Chame a recepção', 'Atendente', 'Humano', 'Recepção', 'Atendimento humano',
    'Quero ajuda de um funcionário', 'Quero falar com uma pessoa',
    'Não quero IA, quero atendente', 'Não quero IA quero atendente',
    'Não quero falar com atendente, mas agora preciso falar com a recepção',
    'Não quero falar com atendente. Quero falar com a recepção.',
    'Não me transfira para um atendente, mas agora quero falar com a recepção.',
    'Não quero falar com a recepção nem com atendente, mas chame a equipe.',
    'Não, quero falar com um atendente', 'Não. Quero um atendente']) {
    assert.equal(human(message), true, message);
  }
});

test('strip remove somente a recusa humana, sem apagar operações ou outro objeto negado', () => {
  const suffix = 'mas meu quarto está sem luz; preciso de manutenção e recebi uma cobrança duplicada.';
  assert.ok(strip('Não quero falar com atendente, ' + suffix).endsWith(suffix));
  for (const message of ['Não quero café, quero falar com a recepção',
    'Prefiro não informar meus dados', 'Não quero cancelar minha reserva',
    'Não consigo falar com atendente', 'Não quero fotos da piscina',
    'O atendente disse que o café começa às 7h', 'Quero reservar para uma pessoa']) {
    assert.equal(strip(message), message, message);
  }
  for (const message of ['O atendente disse que o café começa às 7h', 'Qual o horário da recepção?',
    'Quero reservar para uma pessoa', 'Existe uma recepção no hotel?']) assert.equal(human(message), false, message);
});

test('guards de FAQ deixam de bloquear café, copa e Reserva Solar só pela recusa de humano', () => {
  assert.equal(guestInquiry('Não quero falar com atendente, só saber o horário do café.'), 'dining');
  assert.equal(guestFacilityInquiry('Não quero falar com atendente: tem micro-ondas na copa baby?'), 'copa_baby');
  assert.match(diningPolicyAnswer('Não quero falar com atendente; a entrada no Reserva Solar é paga?'), /gratuita como regra/);
  assert.match(reservaHoursAnswer('Não quero falar com atendente. Qual o horário do Reserva Solar?'), /sexta a domingo/);
  assert.equal(guestFacilityInquiry('Quero falar com atendente sobre o micro-ondas na copa baby'), undefined);
  assert.equal(diningPolicyAnswer('Quero falar com atendente; a entrada no Reserva Solar é paga?'), undefined);
});

test('prepare → route → resolver por texto e áudio respeita recusa e mantém a resposta informativa', async () => {
  const now=Date.now();
  const state={version:2,history:[],facts:{extras:[]},greeted:true};
  const message='Não quero falar com atendente, só saber o horário da piscina.';
  const answer='A piscina principal funciona das 10h às 22h.';
  for (const audio of [false,true]) {
    const user_message=audio?'https://fixture.invalid/human-negation.ogg':message;
    const prepared=await handleConversation({operation:'prepare',state,user_message},'',async()=>message,now);
    const routed=control({operation:'route',state:prepared.state,user_message,ai_response:answer,proposed:'HUMANO'},now);
    assert.equal(routed.quote_request,'NOQUOTE');
    assert.equal(routed.can_collect,'NAO');
    assert.ok(routed.answer.endsWith(answer));
    assert.doesNotMatch(JSON.parse(prepared.context).ultima_mensagem,/^Quero falar com a recepção$/);
    assert.deepEqual(JSON.parse(routed.state).facts,{extras:[]});
    const result=await resolve(user_message,routed.state);
    assert.equal(result.quote_request,'ROOM_LIST');
    assert.equal(result.match_type,'human_refusal_information');
    assert.ok(result.conversation_text.endsWith(answer));
    assert.equal(result.availability_checked,false);
    assert.deepEqual(JSON.parse(result.state).facts,{extras:[]});
  }
});

test('recusa de conversa humana não apaga serviço operacional, disputa, alteração ou pedido positivo posterior', async()=>{
  const now=Date.now();
  const state={version:2,history:[],facts:{extras:[]},greeted:true};
  for (const message of [
    'Não quero falar com atendente, meu ar condicionado do quarto não funciona.',
    'Não quero falar com atendente, podem aquecer minha mamadeira?',
    'Não quero falar com atendente, mas recebi uma cobrança duplicada.',
    'Não quero falar com atendente, preciso alterar minha reserva.',
    'Não quero falar com atendente, quero cancelar minha reserva.',
    'Não quero falar com atendente, mas agora quero falar com a recepção.',
  ]) {
    for (const audio of [false,true]) {
      const user_message=audio?'https://fixture.invalid/human-priority.ogg':message;
      const prepared=await handleConversation({operation:'prepare',state,user_message},'',async()=>message,now);
      const routed=control({operation:'route',state:prepared.state,user_message,ai_response:'Uma informação.',proposed:'NOQUOTE'},now);
      assert.equal(routed.quote_request,'HUMANO',message);
      assert.equal(routed.can_collect,'NAO',message);
      assert.deepEqual(JSON.parse(routed.state).facts,{extras:[]},message);
      if (/ar condicionado|aquecer/.test(message)) {
        const result=await resolve(user_message,routed.state);
        assert.equal(result.quote_request,'HUMANO',message);
        assert.equal(result.match_type,'guest_service',message);
      }
    }
  }
});
