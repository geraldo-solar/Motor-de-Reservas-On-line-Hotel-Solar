import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

// In-memory catalogue and real local response builders only. These are content
// budgets for the new separate plain-text and short-button messages, not a
// claim that the ManyChat UI or an actual WhatsApp delivery was exercised.
const PLAIN_TEXT_LIMIT=4096;
const MANYCHAT_TEXT_LIMIT=2000;
const BUTTON_FOOTER_LIMIT=640;
const proposedFooter='Se preferir atendimento humano, toque abaixo ou ligue para (91) 98100-0800.';
const rooms=[
  ['casal','Suíte Casal',2,500],
  ['triplo','Suíte Triplo',3,650],
  ['quadruplo','Suíte Quádruplo',4,800],
  ['varanda','Suíte Varanda Térreo',4,850],
  ['sacada','Suíte Sacada Vista Mar',4,950],
  ['loft','Loft',4,1100],
].map(([id,name,capacity,base_price])=>({id,name,capacity,base_price,active:true,overrides:[]}));
const packageFixture={
  id:'reveillon-fixture',name:'Réveillon Solar 2027',active:true,
  start_iso_date:'2026-12-31',end_iso_date:'2027-01-03',
  description:'Uma estadia para aproveitar o litoral com a família, descansar e celebrar a chegada do novo ano. Consulte a recepção para confirmar os detalhes da programação e a disponibilidade.',
  location:'Hotel Solar — Salinópolis',
  includes:['Café da manhã durante a estadia','Ceia e festa da virada conforme a programação do pacote'],
  benefits:['Áreas de lazer compartilhadas entre os hóspedes','Bicicletas para hóspedes, mediante retirada na recepção'],
  full_period_required:true,max_installments:3,
  room_prices:rooms.map(room=>({roomId:room.id,price:room.base_price*3})),
};
const fixtureData={room_types:rooms,packages:[packageFixture],extras:[
  {id:'mesa',name:'Mesa Posta',price:180,active:true,description:'Uma experiência especial à mesa, mediante consulta à recepção.'},
  {id:'lua',name:'Kit Lua de Mel/Celebração',price:350,active:true,description:'Uma preparação para celebrar a estadia, mediante consulta à recepção.'},
]};
const bundle=await build({
  stdin:{contents:`export {default as prices} from './api/get-prices.ts';
    export {default as resolver} from './api/resolve-package.ts';
    export {control} from './api/conversation-control.ts';
    export * from './utils/assistantDisclosure.ts';
    export {belemClock,withDailyGreeting} from './utils/dailyGreeting.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'whatsapp-length-fixture-no-network',setup(builder){
    builder.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:`
      const fixture=${JSON.stringify(fixtureData)};
      export function createClient(){return {from(table){
        if(!(table in fixture))throw Error('Unexpected fixture table: '+table);
        let rows=fixture[table];
        const query={select(){return query;},eq(key,value){rows=rows.filter(row=>row[key]===value);return query;},
          then(resolve,reject){return Promise.resolve({data:rows,error:null}).then(resolve,reject);}};
        return query;
      }};}
    `}));
  }}],
});
const {prices,resolver,control,belemClock,withDailyGreeting,assistantDisclosureText,
  ASSISTANT_DISCLOSURE,ASSISTANT_DISCLOSURE_COMPACT}=await import(
  'data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const now=Date.now();
const normalDates={check_in:'2026-09-20',check_out:'2026-09-22'};
const packageDates={check_in:packageFixture.start_iso_date,check_out:packageFixture.end_iso_date};
function familyState(dates=normalDates,extras=[],present=true){
  return {version:2,history:[],greeted:true,facts:{...dates,guests:3,children_pending:false,extras},
    family_party:{adults:2,children:1,ages_months:[60],updated_at:now},
    daily_greeting:{day:belemClock(now).day,first:true},
    assistant_disclosure:{version:1,show:present,...(present?{}:{rendered:true})}};
}
async function call(handler,body,query={}){
  let status,payload;
  await handler({method:'POST',body,query},{status(value){status=value;return this;},json(value){payload=value;return value;}});
  assert.equal(status,200,JSON.stringify(payload));
  return payload;
}
function checkText(t,label,text,{nonempty=true,manychat=true}={}){
  assert.equal(typeof text,'string',label);
  if(nonempty)assert.ok(text.trim().length>0,label+' must not be empty');
  // JS UTF-16 length is conservative for emoji/code points, and also matches
  // the budgets used by the existing local builders.
  assert.ok(text.length<=PLAIN_TEXT_LIMIT,`${label}: ${text.length} > ${PLAIN_TEXT_LIMIT}`);
  if(manychat)assert.ok(text.length<=MANYCHAT_TEXT_LIMIT,`${label}: ${text.length} > ManyChat ${MANYCHAT_TEXT_LIMIT}`);
  t.diagnostic(`${label}: ${text.length} UTF-16 units, ${[...text].length} code points`);
}
function checkCompleteQuote(payload){
  const quote=JSON.parse(payload.quote_state);
  for(const option of quote.options){
    const line=payload.conversation_text.split('\n').find(line=>line.startsWith('• '+option.name+' ('));
    assert.ok(line,`Missing full category: ${option.name}`);
    assert.ok(line.includes(`*R$ ${Math.round(option.total).toLocaleString('pt-BR')}*`),`Missing full total for ${option.name}`);
  }
  assert.match(payload.conversation_text,/máximo 1 criança de até 6 anos em cortesia por apartamento/);
  assert.match(payload.conversation_text,/berço é gratuito/);
  assert.match(payload.conversation_text,/cama extra gratuita/);
  assert.match(payload.conversation_text,/disponibilidade dos itens e a compatibilidade/);
  assert.match(payload.conversation_text,/Nenhum item está reservado ou instalado/);
  assert.match(payload.conversation_text,/confirmar a configuração e a disponibilidade/);
  assert.match(payload.conversation_text,/sem confirmação de disponibilidade/);
  assert.match(payload.conversation_text,/Primeiro confirmaremos sua escolha; só depois pediremos os dados/);
  assert.doesNotMatch(payload.conversation_text,/…|\.\.\./);
  assert.ok(payload.conversation_text.includes(ASSISTANT_DISCLOSURE)
    ||payload.conversation_text.includes(ASSISTANT_DISCLOSURE_COMPACT),'First-response presentation must also fit');
}
async function quote(dates=normalDates,extras=[],present=true){
  return call(prices,{quote_request:`QUOTE|${dates.check_in}|${dates.check_out}|3|${extras.join(',')||'NONE'}`,
    state:familyState(dates,extras,present)});
}

test('três hóspedes e seis categorias cabem no texto simples, não no bloco com botão',async t=>{
  for(const extras of [[],['MESA'],['MESA','LUA']]){
    const payload=await quote(normalDates,extras);
    assert.equal(JSON.parse(payload.quote_state).options.length,6);
    checkCompleteQuote(payload);
    assert.equal(payload.guests,3);assert.equal(payload.availability_checked,false);
    assert.match(payload.conversation_text,/criança.*cortesia/s);
    assert.match(payload.conversation_text,/sem confirmação de disponibilidade/);
    assert.match(payload.conversation_text,/Qual acomodação você prefere/);
    assert.ok(payload.conversation_text.length>1024,'fixture must reproduce a long quote, not a trivial short response');
    checkText(t,`get-prices / extras ${extras.join(',')||'NONE'} / conversation_text`,payload.conversation_text);
    checkText(t,`get-prices / extras ${extras.join(',')||'NONE'} / whatsapp_text legado`,payload.whatsapp_text,{manychat:false});
  }
});

test('cotação de pacote integral com seis categorias e extras conserva final e limite',async t=>{
  const payload=await quote(packageDates,['MESA','LUA']);
  assert.equal(payload.discount_applied,true);
  assert.equal(payload.package_name,packageFixture.name);
  assert.equal(JSON.parse(payload.quote_state).options.length,6);
  checkCompleteQuote(payload);
  assert.deepEqual(payload.selected_extras,['MESA','LUA']);
  assert.match(payload.conversation_text,/Réveillon Solar 2027/);
  assert.match(payload.conversation_text,/Primeiro confirmaremos sua escolha/);
  assert.match(payload.conversation_text,/Total dos extras/);
  checkText(t,'get-prices / pacote integral + MESA,LUA / conversation_text',payload.conversation_text);
  checkText(t,'get-prices / pacote integral + MESA,LUA / whatsapp_text legado',payload.whatsapp_text,{manychat:false});
});

test('resolver entrega pacote, recomendação familiar e extras em textos simples limitados',async t=>{
  const state=familyState(packageDates);
  const detail=await call(resolver,{user_message:'Quero conhecer o pacote Réveillon Solar 2027',state});
  assert.equal(detail.package_id,packageFixture.id);
  assert.match(detail.conversation_text,/Réveillon Solar 2027/);
  checkText(t,'resolve-package / detalhes / conversation_text',detail.conversation_text);
  checkText(t,'resolve-package / detalhes / quote_text',detail.quote_text);
  const focused={...state,topic:'package_info',topic_at:now,
    package_context:{id:packageFixture.id,name:packageFixture.name,start_date:packageDates.check_in,
      end_date:packageDates.check_out,updated_at:now}};
  const recommendation=await call(resolver,{user_message:'Qual acomodação você recomenda para nós?',state:focused});
  assert.equal(recommendation.match_type,'package_followup');
  assert.match(recommendation.conversation_text,/3 hóspedes|três hóspedes/);
  checkText(t,'resolve-package / recomendação familiar / conversation_text',recommendation.conversation_text);
  const extras=await call(resolver,{user_message:'Quero conhecer mesa posta e kit lua de mel',state:familyState()});
  assert.match(extras.conversation_text,/Mesa Posta|mesa posta/);
  checkText(t,'resolve-package / extras / conversation_text',extras.conversation_text);
});

test('disclosure não corta preço, condição nem aviso para fazer a apresentação caber',async t=>{
  const plain=await quote(normalDates,['MESA','LUA'],false);
  const disclosed=await quote(normalDates,['MESA','LUA'],true);
  assert.equal(disclosed.conversation_text.replace(ASSISTANT_DISCLOSURE+'\n\n','').replace(ASSISTANT_DISCLOSURE_COMPACT+'\n\n',''),plain.conversation_text);
  assert.equal(JSON.parse(disclosed.state).assistant_disclosure.rendered,true);
  checkText(t,'disclosure / cotação preservada integralmente',disclosed.conversation_text);
  const short=assistantDisclosureText('Posso ajudar com informações sobre sua hospedagem.',{version:1,show:true});
  assert.ok(short.includes(ASSISTANT_DISCLOSURE));
  checkText(t,'disclosure / resposta curta completa',short);
  const compact=assistantDisclosureText('Informação da hospedagem. '.repeat(100).slice(0,2000-ASSISTANT_DISCLOSURE_COMPACT.length-2),{version:1,show:true});
  assert.ok(compact.includes(ASSISTANT_DISCLOSURE_COMPACT));
  assert.ok(compact.length<=2000);
  checkText(t,'disclosure / apresentação compacta',compact);
  const prepared=control({operation:'prepare',user_message:'Tem estacionamento?',state:familyState()},now);
  const routed=control({operation:'route',user_message:'Tem estacionamento?',state:prepared.state,
    proposed:'NOQUOTE',ai_response:'Posso esclarecer as informações do hotel.'},now);
  checkText(t,'controller / primeira resposta com cumprimento e disclosure',routed.answer);
});

test('orçamento de texto simples inclui cumprimento sem ultrapassar 2000/4096',t=>{
  const source=familyState();
  const greeting=belemClock(now).greeting+'!\n\n';
  const text='x'.repeat(MANYCHAT_TEXT_LIMIT-greeting.length);
  const result=withDailyGreeting({conversation_text:text},source,now);
  assert.equal(result.conversation_text.length,MANYCHAT_TEXT_LIMIT);
  assert.equal(result.conversation_text,greeting+text);
  checkText(t,'disclosure / fronteira de texto simples',result.conversation_text);
});

test('rodapé proposto separado contém apenas orientação curta e cabe em 640',t=>{
  assert.ok(proposedFooter.length>0&&proposedFooter.length<=BUTTON_FOOTER_LIMIT);
  assert.match(proposedFooter,/atendimento humano.*toque abaixo.*ligue para \(91\) 98100-0800/);
  assert.doesNotMatch(proposedFooter,/\{\{|\{chatgpt_|R\$|QUOTE\|/);
  t.diagnostic(`Rodapé proposto (fixture, não leitura da UI): ${proposedFooter.length}/${BUTTON_FOOTER_LIMIT} UTF-16 units`);
});
