import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const now = Date.now();
const facts = {guests:2,check_in:'2026-09-20',check_out:'2026-09-25',extras:['MESA'],children_pending:true};
const initial = {version:2,history:[],facts,greeted:true};
const rooms = [
  {id:'loft',name:'Loft',capacity:4,images:['https://fixture.invalid/loft.jpg'],active:true},
  {id:'casal',name:'Suíte Casal',capacity:2,images:['https://fixture.invalid/casal.jpg'],active:true},
];
const noDeliveryClaim = /\b(?:enviei|reenviei|encaminhei)\b|(?:aqui est[aã]|segue(?:m)?|vou (?:te |lhe )?(?:(?:re)?enviar|mandar)|(?:re)?enviad[ao]s?)[^.!?\n]{0,90}\b(?:fotos?|imagens?|imagem)\b|\b(?:fotos?|imagens?|imagem)[^.!?\n]{0,90}(?:enviad[ao]s?|reenviad[ao]s?)/i;

async function load(file, fixture = false) {
  const result = await build({
    entryPoints:[file],bundle:true,write:false,platform:'node',format:'esm',
    define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
    plugins:fixture ? [{name:'photo-recovery-read-only-data',setup(builder) {
      builder.onResolve({filter:/^@supabase\/supabase-js$/},() => ({path:'readonly-fixture',namespace:'test'}));
      builder.onLoad({filter:/.*/,namespace:'test'},() => ({loader:'js',contents:`
        const data = ${JSON.stringify({room_types:rooms,extras:[],packages:[]})};
        export function createClient() {
          ${fixture === 'forbid' ? "throw Error('Document photo inquiry must not access Supabase');" : ''}
          return {from(table) {
            if (!(table in data)) throw Error('Unexpected table access: ' + table);
            return {select() {
              let rows = data[table];
              const query = {
                eq(key,value) {if (key === 'id') rows = rows.filter(row => row.id === value); return query;},
                then(resolve) {return Promise.resolve({data:rows,error:null}).then(resolve);}
              };
              return query;
            }};
          }};
        }
      `}));
    }}] : [],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const {control,handleConversation} = await load('api/conversation-control.ts');
const {default:resolver} = await load('api/resolve-package.ts',true);
const prepare = (message,state=initial,time=now) => control({operation:'prepare',user_message:message,state},time);
const route = (message,state,answer='Aqui está a foto solicitada. Já enviei para você.',time=now,proposed='') =>
  control({operation:'route',user_message:message,state,ai_response:answer,proposed},time);

async function request(body,operation,handler=resolver) {
  let status,payload;
  await handler({method:'POST',body,query:operation ? {operation} : {}},{
    status(value) {status=value;return this;},json(value) {payload=value;return value;},
  });
  assert.equal(status,200);
  return payload;
}

async function photoTurn(message,state,code,time=now) {
  const p = prepare(message,state,time);
  const r = route(message,p.state,undefined,time,'QUOTE|2026-09-20|2026-09-25|2|MESA');
  assert.equal(r.quote_request,'NOQUOTE',message);
  assert.equal(r.can_collect,'NAO',message);
  assert.equal(r.confirmation_text,'',message);
  assert.doesNotMatch(r.answer,noDeliveryClaim,message);
  assert.deepEqual(JSON.parse(p.context).fotos_lazer_solicitadas,[code],message);
  assert.deepEqual(JSON.parse(r.state).facts,facts,message);
  const resolved = await request({user_message:message,state:r.state});
  assert.deepEqual(resolved.photo_codes,[code],message);
  assert.match(resolved.quote_request,new RegExp(`^EXTRA_ID\\|${code}\\|`),message);
  assert.equal(resolved.availability_checked,false,message);
  assert.deepEqual(JSON.parse(resolved.state).facts,facts,message);
  assert.doesNotMatch(resolved.conversation_text,/Loft|Suíte Casal|piscina principal|idades das crianças|quantas pessoas|não temos foto/i,message);
  assert.doesNotMatch(resolved.conversation_text,noDeliveryClaim,message);
  const exhausted = await request({user_message:resolved.quote_request},'next');
  assert.equal(exhausted.quote_request,'ROOM_DONE',message);
  return resolved.state;
}

test('reprodução ponta a ponta do Inbox: playground → tem da hidromassagem → não chegou → da hidromassagem',async () => {
  let state = initial;
  let step = 0;
  for (const [message,code] of [
    ['gostaria que vc me enviasse foto do playground','PARQUE'],
    ['tem da hidromassagem?','HIDRO'],
    ['a foto nao chegou','HIDRO'],
    ['da hidromassagem','HIDRO'],
  ]) state = await photoTurn(message,state,code,now+step++);
  assert.deepEqual(JSON.parse(state).extra_photo_subjects,['HIDRO']);
});

test('pedido contextual Pode mandar fotos delas preserva as hidros após informação ou foto',async () => {
  for (const first of ['Tem duas piscinas de hidromassagem?','Fotos das hidromassagens']) {
    const p = prepare(first);
    const r = route(first,p.state,'São duas piscinas de hidromassagem.');
    await photoTurn('Pode mandar fotos delas?',r.state,'HIDRO',now+1);
  }
});

test('reenvio repete somente a mídia pedida, mesmo que foto já conste das solicitações anteriores',async () => {
  const state = await photoTurn('Fotos da hidromassagem',initial,'HIDRO');
  assert.ok(JSON.parse(state).extra_photo_requests.includes('HIDRO'));
  for (const retry of ['A foto não chegou','Não recebi a imagem','Pode reenviar a foto?']) {
    await photoTurn(retry,state,'HIDRO',now+1);
  }
});

test('Pode reenviar só recupera fotos quando existe foco fotográfico recente',async () => {
  const message = 'Pode reenviar?';
  const answer = 'Qual informação você gostaria que eu repetisse?';
  const p = prepare(message);
  const r = route(message,p.state,answer);
  assert.equal(r.answer,answer);
  assert.equal(r.resolved_message,message);
  assert.equal(r.quote_request,'NOQUOTE');
  assert.notEqual(JSON.parse(r.state).topic,'extra_photos');
  assert.deepEqual(JSON.parse(p.context).fotos_lazer_solicitadas,[]);
  assert.deepEqual(JSON.parse(r.state).facts,facts);
  assert.doesNotMatch(r.answer,/foto|imagem|espaço do hotel|Mesa Posta/i);

  const photoState = await photoTurn('Fotos da hidromassagem',initial,'HIDRO');
  await photoTurn(message,photoState,'HIDRO',now+1);
});

test('pergunta de existência sem referência fotográfica não é convertida em envio',() => {
  const info = prepare('Tem piscina?').state;
  for (const state of [initial,info]) {
    const message = 'Tem hidromassagem?';
    const p = prepare(message,state);
    const r = route(message,p.state,'Sim, temos duas piscinas de hidromassagem.');
    assert.equal(r.resolved_message,message);
    assert.equal(JSON.parse(r.state).topic,'extra_info');
    assert.deepEqual(JSON.parse(p.context).fotos_lazer_solicitadas,[]);
    assert.deepEqual(JSON.parse(r.state).facts,facts);
    assert.equal(r.quote_request,'NOQUOTE');
    assert.match(r.answer,/duas piscinas de hidromassagem/);
  }
});

test('pergunta nova sobre aquecimento depois das fotos continua informativa',() => {
  const state = prepare('Fotos das hidromassagens').state;
  const message = 'Tem piscina aquecida?';
  const p = prepare(message,state);
  const r = route(message,p.state,'Não tenho confirmação sobre aquecimento.');
  assert.equal(r.resolved_message,message);
  assert.notEqual(JSON.parse(r.state).topic,'extra_photos');
  assert.deepEqual(JSON.parse(p.context).fotos_lazer_solicitadas,[]);
  assert.equal(r.answer,'Não tenho confirmação sobre aquecimento.');
  assert.deepEqual(JSON.parse(r.state).facts,facts);
});

test('não recebimento de pagamento ou confirmação não aciona reenvio de fotos',() => {
  const state = prepare('Fotos da hidromassagem').state;
  for (const message of ['A confirmação não chegou','O pagamento não chegou','Meu comprovante não chegou']) {
    const p = prepare(message,state);
    const r = route(message,p.state,'A equipe precisa conferir essa informação.');
    assert.equal(r.resolved_message,message,message);
    assert.notEqual(JSON.parse(r.state).topic,'extra_photos',message);
    assert.deepEqual(JSON.parse(p.context).fotos_lazer_solicitadas,[],message);
    assert.deepEqual(JSON.parse(r.state).facts,facts,message);
    assert.equal(r.can_collect,'NAO',message);
    assert.doesNotMatch(r.answer,/foto|imagem|pagamento confirmado|reserva confirmada/i,message);
  }
});

test('contexto de foto expirado não é reaproveitado em pedido de reenvio',() => {
  const state = prepare('Fotos da hidromassagem').state;
  for (const message of ['A foto não chegou','tem da hidromassagem?']) {
    const p = prepare(message,state,now+31*60000);
    const r = route(message,p.state,undefined,now+31*60000);
    assert.equal(r.resolved_message,message);
    assert.notEqual(JSON.parse(r.state).topic,'extra_photos');
    assert.deepEqual(JSON.parse(p.context).fotos_lazer_solicitadas,[]);
    assert.deepEqual(JSON.parse(r.state).facts,facts);
    assert.doesNotMatch(r.answer,noDeliveryClaim);
  }
});

test('foto não recebida sem foco pede identificação, sem inventar envio ou escolher quartos',async () => {
  const message = 'A foto não chegou';
  const p = prepare(message);
  const r = route(message,p.state);
  assert.equal(r.quote_request,'NOQUOTE');
  assert.match(r.answer,/(?:qual|quais|que|de qu[eê])[^.!?\n]{0,90}(?:foto|imagem|espaço|local|tema)|(?:foto|imagem)[^.!?\n]{0,90}(?:qual|que)/i);
  assert.doesNotMatch(r.answer,noDeliveryClaim);
  assert.doesNotMatch(r.answer,/quantas pessoas|idades das crianças|datas de entrada|qual acomodação|qual quarto/i);
  const resolved = await request({user_message:message,state:r.state});
  assert.doesNotMatch(resolved.quote_request,/^(?:EXTRA_ID|ROOM_ID|SITE_ID)\|/);
  assert.doesNotMatch(resolved.conversation_text,/quantas pessoas|Loft|Suíte Casal|datas de entrada|idades das crianças/i);
  assert.doesNotMatch(resolved.conversation_text,noDeliveryClaim);
});

test('estado legado sem foco temporal não recupera entrega de foto a partir de palavras antigas',() => {
  // The failed live turn had no trusted photo topic. Publishing cannot silently
  // treat old assistant claims or untimestamped user history as delivered media.
  for (const previous of ['tem da hidromassagem?','a foto nao chegou']) {
    const legacy = {...initial,history:['Fotos do playground',previous],turns:[
      {role:'user',text:previous},{role:'assistant',text:'Enviei a foto da hidromassagem.'},
    ],extra_photo_requests:['PARQUE']};
    const p = prepare('A foto não chegou',legacy);
    const r = route('A foto não chegou',p.state);
    assert.notEqual(JSON.parse(r.state).topic,'extra_photos');
    assert.deepEqual(JSON.parse(p.context).fotos_lazer_solicitadas,[]);
    assert.doesNotMatch(r.answer,noDeliveryClaim);
    assert.deepEqual(JSON.parse(r.state).facts,facts);
  }
});

test('resposta livre da IA não pode confirmar nem prometer envio sem referência de mídia',() => {
  for (const ai_response of [
    'Aqui está a foto da hidromassagem!',
    'Já enviei a imagem para você.',
    'Vou reenviar a foto agora.',
    'Vou te enviar a foto.',
    'Vou mandar a foto.',
    'Segue a foto solicitada.',
    'Seguem as fotos solicitadas.',
    'A imagem foi enviada com sucesso.',
  ]) {
    const message = 'Certo, obrigado';
    const p = prepare(message);
    const r = route(message,p.state,ai_response);
    assert.equal(r.quote_request,'NOQUOTE',ai_response);
    assert.doesNotMatch(r.answer,noDeliveryClaim,ai_response);
    assert.deepEqual(JSON.parse(r.state).facts,facts,ai_response);
    assert.equal(r.can_collect,'NAO');
    assert.equal(r.confirmation_text,'');
    assert.doesNotMatch(JSON.parse(r.state).turns.filter(turn => turn.role === 'assistant').map(turn => turn.text).join('\n'),noDeliveryClaim,ai_response);
  }
});

test('foto genérica ou desconhecida não herda oferta antiga de Mesa Posta',async () => {
  const state = {...initial,turns:[{role:'assistant',text:'Sugiro Mesa Posta para um jantar especial.'}]};
  for (const message of ['Foto da academia','Tem fotos?']) {
    const p = prepare(message,state);
    const r = route(message,p.state,'Sugiro Mesa Posta para um jantar especial.');
    const resolved = await request({user_message:message,state:r.state});
    assert.equal(r.quote_request,'NOQUOTE',message);
    assert.doesNotMatch(resolved.quote_request,/^(?:EXTRA_ID|ROOM_ID|SITE_ID)\|/,message);
    assert.doesNotMatch(resolved.conversation_text,/Mesa Posta|Loft|Suíte Casal|quantas pessoas|datas de entrada/i,message);
    assert.deepEqual(JSON.parse(r.state).facts,facts,message);
    assert.deepEqual(JSON.parse(p.context).fotos_lazer_solicitadas,[],message);
  }
});

test('foto do comprovante não é confundida com falha da última foto do hotel',async () => {
  const state = prepare('Fotos da hidromassagem').state;
  for (const message of ['A foto do comprovante não chegou','Pode reenviar a foto do comprovante?','A imagem do pagamento não chegou']) {
    const p = prepare(message,state);
    const r = route(message,p.state,'A equipe precisa conferir o comprovante.');
    const resolved = await request({user_message:message,state:r.state});
    assert.equal(r.resolved_message,message,message);
    assert.notEqual(JSON.parse(r.state).topic,'extra_photos',message);
    assert.deepEqual(JSON.parse(p.context).fotos_lazer_solicitadas,[],message);
    assert.doesNotMatch(resolved.quote_request,/^(?:EXTRA_ID|ROOM_ID|SITE_ID)\|/,message);
    assert.doesNotMatch(resolved.conversation_text,/hidromassagem|piscina principal|Loft|Suíte Casal|pagamento confirmado/i,message);
    assert.deepEqual(JSON.parse(r.state).facts,facts,message);
  }
});

test('instruções legítimas sobre fotos de comprovantes não são tratadas como confirmação de entrega',() => {
  const message = 'Como envio foto do comprovante?';
  const state = prepare('Fotos da hidromassagem').state;
  for (const answer of [
    'A foto do comprovante pode ser enviada por aqui; a equipe confere o recebimento antes de lançar o pagamento.',
    'Não consigo confirmar pagamento. A foto enviada por você precisa de análise.',
  ]) {
    const p = prepare(message,state);
    const r = route(message,p.state,answer);
    assert.equal(r.quote_request,'NOQUOTE');
    assert.equal(r.answer,answer);
    assert.equal(r.can_collect,'NAO');
    assert.deepEqual(JSON.parse(r.state).facts,facts);
    assert.deepEqual(JSON.parse(p.context).fotos_lazer_solicitadas,[]);
  }
});

test('Como envio foto do comprovante preserva o roteamento documental sem consultar Supabase',async () => {
  const {default:noDataResolver} = await load('api/resolve-package.ts','forbid');
  const message = 'Como envio foto do comprovante?';
  const p = prepare(message,prepare('Fotos da hidromassagem').state);
  const r = route(message,p.state,'Pode enviar o comprovante por aqui para conferência da equipe.');
  const resolved = await request({user_message:message,state:r.state},undefined,noDataResolver);
  assert.equal(resolved.quote_request,'NO_PACKAGE');
  assert.doesNotMatch(resolved.quote_request,/^(?:EXTRA_ID|ROOM_ID|SITE_ID)\|/);
  assert.doesNotMatch(resolved.conversation_text,/espaço do hotel|hidromassagem|Loft|quantas pessoas|datas de entrada/i);
  assert.equal(resolved.matched,false);
  assert.deepEqual(JSON.parse(r.state).facts,facts);
});

test('pedido explícito de humano prevalece sobre contexto de foto e não emite mídia',() => {
  const state = prepare('Fotos da hidromassagem').state;
  const message = 'A foto não chegou, quero falar com a recepção';
  const p = prepare(message,state);
  const r = route(message,p.state,'Vou reenviar a foto agora.');
  assert.equal(r.quote_request,'HUMANO');
  assert.notEqual(JSON.parse(r.state).topic,'extra_photos');
  assert.deepEqual(JSON.parse(p.context).fotos_lazer_solicitadas,[]);
  assert.deepEqual(JSON.parse(r.state).facts,facts);
  assert.equal(r.can_collect,'NAO');
  assert.equal(r.confirmation_text,'');
});

test('guardrail fotográfico preserva classificação de comprovante e não confirma pagamento',async () => {
  const message = 'https://media.example.test/receipt.pdf';
  const p = await handleConversation({operation:'prepare',user_message:message,state:prepare('Fotos da hidromassagem').state},'',async () => {throw Error('No transcription expected');},now,async () => ({kind:'payment_receipt',summary:''}));
  const r = route(message,p.state,'Aqui está a foto; pagamento confirmado.');
  assert.equal(r.quote_request,'ANEXO_FINANCEIRO');
  assert.equal(r.can_collect,'NAO');
  assert.equal(r.confirmation_text,'');
  assert.deepEqual(JSON.parse(r.state).facts,facts);
  assert.doesNotMatch(r.answer,/pagamento confirmado|reserva confirmada/i);
  assert.match(r.answer,/conferência/);
});
