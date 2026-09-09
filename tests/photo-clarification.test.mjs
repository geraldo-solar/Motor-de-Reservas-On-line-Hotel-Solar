import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

const now = Date.now();
const facts = {guests:2,check_in:'2026-09-20',check_out:'2026-09-25',extras:['MESA'],children_pending:true};
const initial = {version:2,history:[],facts,greeted:true};
const clarifyText = 'De qual espaço do hotel você gostaria de ver fotos?';
const fixtures = {extras:[],packages:[],room_types:[
  {id:'loft',name:'Loft',capacity:4,images:['https://fixture.invalid/loft.jpg'],active:true},
  {id:'casal',name:'Suíte Casal',capacity:2,images:['https://fixture.invalid/casal.jpg'],active:true},
]};
const noClaim = /\b(?:enviei|reenviei|encaminhei|mandei)\b|aqui est[aã][^.!?\n]{0,80}foto|vou (?:te )?(?:reenviar|enviar|mandar)[^.!?\n]{0,80}foto/i;

async function load(file,mock=false) {
  const result = await build({entryPoints:[file],bundle:true,write:false,platform:'node',format:'esm',
    define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
    plugins:mock ? [{name:'clarification-readonly-data',setup(builder) {
      builder.onResolve({filter:/^@supabase\/supabase-js$/},() => ({path:'data',namespace:'test'}));
      builder.onLoad({filter:/.*/,namespace:'test'},() => ({loader:'js',contents:`
        const data=${JSON.stringify(fixtures)};
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
const {control,handleConversation} = await load('api/conversation-control.ts');
const {default:resolver} = await load('api/resolve-package.ts',true);
const prepare = (message,state=initial,time=now) => control({operation:'prepare',user_message:message,state},time);
const route = (message,state,answer='Vou consultar as fotos solicitadas no acervo do hotel.',time=now) =>
  control({operation:'route',user_message:message,state,ai_response:answer},time);
const pendingFixture = (time=now) => ({...initial,topic:'photo_clarification',topic_at:time,
  history:['me encaminhe a foto pfv'],turns:[{role:'user',text:'me encaminhe a foto pfv'},{role:'assistant',text:clarifyText}]});

async function request(message,state) {
  let status,payload;
  await resolver({method:'POST',query:{},body:{user_message:message,state}},
    {status(code) {status=code;return this;},json(value) {payload=value;return value;}});
  assert.equal(status,200);
  return payload;
}

async function clarify(state=initial,answer,message='me encaminhe a foto pfv') {
  const p=prepare(message,state);
  const r=route(message,p.state,answer);
  assert.equal(r.quote_request,'NOQUOTE');
  assert.equal(r.can_collect,'NAO');
  assert.doesNotMatch(r.answer,noClaim);
  const result=await request(message,r.state);
  assert.equal(result.quote_request,'ROOM_LIST');
  assert.equal(result.conversation_text,clarifyText);
  const remembered=JSON.parse(result.state);
  assert.equal(remembered.topic,'photo_clarification');
  assert.ok(remembered.topic_at>=now && remembered.topic_at<=Date.now()+1000);
  assert.equal(remembered.subject,undefined);
  assert.equal(remembered.extra_photo_subjects,undefined);
  assert.deepEqual(remembered.facts,facts);
  return result.state;
}

async function chooseHydro(message,state,time=Date.now()) {
  const p=prepare(message,state,time);
  const r=route(message,p.state,'Já enviei a foto da hidromassagem.',time);
  assert.equal(r.quote_request,'NOQUOTE');
  assert.equal(r.can_collect,'NAO');
  assert.equal(r.confirmation_text,'');
  assert.doesNotMatch(r.answer,noClaim);
  assert.equal(JSON.parse(r.state).topic,'extra_photos');
  assert.deepEqual(JSON.parse(p.context).fotos_lazer_solicitadas,['HIDRO']);
  assert.deepEqual(JSON.parse(r.state).facts,facts);
  const result=await request(message,r.state);
  assert.deepEqual(result.photo_codes,['HIDRO']);
  assert.match(result.quote_request,/^EXTRA_ID\|HIDRO\|/);
  assert.doesNotMatch(result.conversation_text,/piscina principal|Loft|Suíte Casal|quantas pessoas|idades das crianças/i);
  assert.deepEqual(JSON.parse(result.state).facts,facts);
  return result.state;
}

test('reprodução do loop: pedido genérico → pergunta de qual espaço → resposta curta entrega HIDRO',async () => {
  for (const answer of ['Vou consultar as fotos solicitadas no acervo do hotel.','Já enviei a foto para você.',clarifyText]) {
    for (const choice of ['da hidromassagem','hidromassagem']) {
      const state=await clarify(initial,answer);
      await chooseHydro(choice,state);
    }
  }
});

test('pergunta do resolvedor sobre foto ausente fica na memória sem ressuscitar espaço antigo',async () => {
  const old={...initial,subject:'Loft',extra_photo_subjects:['PISCINA'],extra_photo_requests:['PARQUE','PISCINA'],
    turns:[{role:'assistant',text:'Conheça o Loft e a piscina principal.'}]};
  const state=await clarify(old,undefined,'A foto não chegou');
  const saved=control({operation:'remember_response',state});
  assert.equal(JSON.parse(saved.state).topic,'photo_clarification');
  assert.equal(JSON.parse(saved.state).topic_at,JSON.parse(state).topic_at);
  await chooseHydro('da hidromassagem',saved.state);
});

test('perguntas explícitas de clarificação em remember_response abrem seleção com tempo próprio',async () => {
  for (const response_text of [clarifyText,'Pode me dizer de qual espaço do hotel você gostaria de ver fotos?']) {
    const state={...initial,subject:'Loft',extra_photo_subjects:['PISCINA']};
    const saved=control({operation:'remember_response',state,response_text},now);
    assert.equal(JSON.parse(saved.state).topic,'photo_clarification');
    assert.equal(JSON.parse(saved.state).topic_at,now);
    assert.equal(JSON.parse(saved.state).subject,undefined);
    assert.equal(JSON.parse(saved.state).extra_photo_subjects,undefined);
    await chooseHydro('hidromassagem',saved.state,now+1);
  }
});

test('Todas sem espaço identificado não transforma clarificação em galeria de quartos',() => {
  for (const message of ['Todas','todas pfv']) {
    const p=prepare(message,pendingFixture());
    const r=route(message,p.state,clarifyText);
    assert.notEqual(JSON.parse(r.state).topic,'room_photos');
    assert.notEqual(JSON.parse(r.state).topic,'extra_photos');
    assert.deepEqual(JSON.parse(p.context).fotos_lazer_solicitadas,[]);
    assert.doesNotMatch(r.resolved_message,/Fotos de todos os apartamentos/i);
    assert.equal(r.quote_request,'NOQUOTE');
    assert.deepEqual(JSON.parse(r.state).facts,facts);
  }
});

test('resposta curta sobre quarto também consome pergunta de qual foto sem cotar hospedagem',async () => {
  const state=await clarify();
  const message='do Loft';
  const p=prepare(message,state,Date.now());
  const r=route(message,p.state);
  assert.equal(JSON.parse(r.state).topic,'room_photos');
  assert.equal(r.quote_request,'NOQUOTE');
  assert.equal(r.can_collect,'NAO');
  assert.deepEqual(JSON.parse(r.state).facts,facts);
  const result=await request(message,r.state);
  assert.match(result.quote_request,/^ROOM_ID\|loft(?:\||$)/);
  assert.equal(JSON.parse(result.state).topic,'room_photos');
});

test('reenvio após esclarecer hidromassagem mantém apenas a mídia escolhida',async () => {
  const chosen=await chooseHydro('hidromassagem',await clarify());
  await chooseHydro('A foto não chegou',chosen);
  await chooseHydro('Pode reenviar?',chosen);
});

test('clarificação válida até 30 minutos converte resposta curta; expirada ou malformada não converte',async () => {
  await chooseHydro('da hidromassagem',pendingFixture(now-30*60000),now);
  for (const stamp of [now-30*60000-1,now+60000,0,'inválido',null]) {
    const p=prepare('hidromassagem',pendingFixture(stamp),now);
    const r=route('hidromassagem',p.state,'Temos duas piscinas de hidromassagem.',now);
    assert.equal(r.resolved_message,'hidromassagem',String(stamp));
    assert.notEqual(JSON.parse(r.state).topic,'photo_clarification',String(stamp));
    assert.notEqual(JSON.parse(r.state).topic,'extra_photos',String(stamp));
    assert.deepEqual(JSON.parse(p.context).fotos_lazer_solicitadas,[],String(stamp));
    assert.deepEqual(JSON.parse(r.state).facts,facts,String(stamp));
  }
});

test('novo assunto, pergunta de aquecimento e pedido humano encerram a clarificação',() => {
  for (const message of ['Qual o cardápio do Reserva Solar?','Tem academia?','Tem piscina aquecida?','Quero falar com a recepção']) {
    const p=prepare(message,pendingFixture());
    const r=route(message,p.state,'A equipe pode ajudar com essa informação.');
    assert.notEqual(JSON.parse(r.state).topic,'photo_clarification',message);
    assert.notEqual(JSON.parse(r.state).topic,'extra_photos',message);
    assert.deepEqual(JSON.parse(p.context).fotos_lazer_solicitadas,[],message);
    assert.deepEqual(JSON.parse(r.state).facts,facts,message);
    if (message.includes('recepção')) assert.equal(r.quote_request,'HUMANO');
    const next=prepare('hidromassagem',r.state);
    assert.equal(JSON.parse(next.state).resolved_message,'hidromassagem',message);
    assert.notEqual(JSON.parse(next.state).topic,'extra_photos',message);
  }
});

test('anexo recebido cancela a pergunta de foto sem virar escolha, pagamento ou reserva',async () => {
  const message='https://media.example.test/receipt.pdf';
  const p=await handleConversation({operation:'prepare',user_message:message,state:pendingFixture()},'',
    async () => {throw Error('Should not transcribe attachment');},now,async () => ({kind:'payment_receipt',summary:''}));
  const r=route(message,p.state,'Pagamento confirmado.');
  assert.equal(r.quote_request,'ANEXO_FINANCEIRO');
  assert.equal(JSON.parse(r.state).topic,undefined);
  assert.deepEqual(JSON.parse(r.state).facts,facts);
  assert.equal(r.can_collect,'NAO');
  assert.doesNotMatch(r.answer,/pagamento confirmado|reserva confirmada/i);
  const next=prepare('hidromassagem',r.state);
  assert.notEqual(JSON.parse(next.state).topic,'extra_photos');
  assert.deepEqual(JSON.parse(next.context).fotos_lazer_solicitadas,[]);
});

test('foto do comprovante não inicia nem mantém clarificação de mídia do hotel',async () => {
  const message='Como envio foto do comprovante?';
  for (const state of [initial,pendingFixture()]) {
    const p=prepare(message,state);
    const r=route(message,p.state,'Pode enviar o comprovante por aqui para a equipe conferir.');
    const result=await request(message,r.state);
    assert.equal(result.quote_request,'ROOM_LIST');
    assert.ok(result.conversation_text.trim());
    assert.doesNotMatch(result.conversation_text,/de qual espaço|fotos do hotel|hidromassagem|Loft/i);
    assert.notEqual(JSON.parse(result.state).topic,'photo_clarification');
    assert.notEqual(JSON.parse(result.state).topic,'extra_photos');
    assert.deepEqual(JSON.parse(result.state).facts,facts);
    const next=prepare('da hidromassagem',result.state);
    assert.equal(JSON.parse(next.state).resolved_message,'da hidromassagem');
    assert.notEqual(JSON.parse(next.state).topic,'extra_photos');
  }
});

test('hidromassagem sem pergunta de foto pendente continua informação',() => {
  for (const message of ['hidromassagem','da hidromassagem','Tem hidromassagem?']) {
    const p=prepare(message);
    const r=route(message,p.state,'Temos duas piscinas de hidromassagem.');
    assert.equal(r.resolved_message,message);
    assert.equal(JSON.parse(r.state).topic,'extra_info');
    assert.deepEqual(JSON.parse(p.context).fotos_lazer_solicitadas,[]);
    assert.deepEqual(JSON.parse(r.state).facts,facts);
    assert.equal(r.answer,'Temos duas piscinas de hidromassagem.');
  }
});
