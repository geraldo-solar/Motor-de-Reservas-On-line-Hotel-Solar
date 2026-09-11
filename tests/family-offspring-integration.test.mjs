import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
const now=Date.now();
const pkg={id:'reveillon-family',name:'Réveillon Solar',active:true,start_iso_date:'2026-12-31',end_iso_date:'2027-01-03',
  description:'Celebração de Ano-Novo.',includes:[],room_prices:[{roomId:'loft',price:3000}]};
const rooms=[{id:'loft',name:'Loft',active:true,capacity:4,base_price:500}];
async function load(file) {
  const bundle=await build({entryPoints:[file],bundle:true,write:false,platform:'node',format:'esm',
    define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
    plugins:[{name:'family-offspring-offline',setup(builder) {
      builder.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'catalog',namespace:'fixture'}));
      builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:`
        const data=${JSON.stringify({packages:[pkg],room_types:rooms,extras:[]})};
        export function createClient(){return{from(table){
          if(!(table in data))throw Error('Unexpected table: '+table);
          return{select(){let rows=data[table];const q={eq(key,value){rows=rows.filter(row=>row[key]===value);return q;},
            then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve);}};return q;}};
        }}};
      `}));
    }}],
  });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
}
const {control,handleConversation}=await load('api/conversation-control.ts');
const {default:resolver}=await load('api/resolve-package.ts');
const {default:getPrices}=await load('api/get-prices.ts');
const {packageRecommendation}=await load('utils/packageReply.ts');
const initial={version:2,history:['Do Réveillon'],facts:{extras:[]},greeted:true,
  topic:'package_info',topic_at:now,package_context:{id:pkg.id,name:pkg.name,start_date:pkg.start_iso_date,end_date:pkg.end_iso_date,updated_at:now},
  turns:[{role:'user',text:'Do Réveillon'},{role:'assistant',text:'O pacote Réveillon Solar está em consulta.'}]};
async function invoke(handler,body) {
  let response;
  await handler({method:'POST',body},{status(code){assert.equal(code,200);return this;},json(value){response=value;}});
  return response;
}
async function turn(message,state=initial,proposed='NOQUOTE') {
  const at=Date.now();
  const prepared=control({operation:'prepare',user_message:message,state},at);
  const routed=control({operation:'route',user_message:message,state:prepared.state,ai_response:'Resposta informativa.',proposed},at);
  const result=await invoke(resolver,{user_message:message,state:routed.state});
  return {prepared,routed,result,state:result.state||routed.state};
}

test('prepare→route→resolver conserva cinco pessoas no pacote e só recomenda depois de todas as idades',async()=>{
  const first=await turn('Somos 5 pessoas');
  const family=await turn('Casal e filhos',first.state);
  const state=JSON.parse(family.state);
  assert.equal(state.facts.guests,5);assert.equal(state.facts.children_pending,true);
  assert.equal(state.family_party.children,3);assert.equal(state.family_party.age_subject,'offspring');
  assert.equal(family.routed.quote_request,'NOQUOTE');
  assert.match(family.result.conversation_text,/idades de todos os filhos, inclusive se algum já for adulto/);
  assert.doesNotMatch(family.result.conversation_text,/R\$|precisamos dividir/);
  const final=await turn('idades 6, 9 e 18 anos',family.state);
  assert.equal(JSON.parse(final.state).facts.guests,5);
  assert.equal(JSON.parse(final.state).facts.children_pending,false);
  assert.deepEqual(JSON.parse(final.state).family_party.ages_months,[72,108,216]);
  assert.equal(final.result.match_type,'package_followup');
  assert.match(final.result.conversation_text,/Loft/);
  assert.equal(final.result.availability_checked,false);
});

test('filhos adultos continuam no grupo em todos os estágios e não recebem cortesia infantil',async()=>{
  const first=await turn('Somos um casal e dois filhos');
  assert.equal(JSON.parse(first.state).facts.guests,4);
  assert.match(first.result.conversation_text,/idades de todos os filhos/);
  const final=await turn('Dezoito e vinte e cinco anos',first.state);
  assert.equal(JSON.parse(final.state).facts.guests,4);
  assert.deepEqual(JSON.parse(final.state).family_party.ages_months,[216,300]);
  assert.equal(final.result.match_type,'package_followup');
  assert.match(final.result.conversation_text,/ocupação normal/);
  const noMinors=await turn('Sem crianças',final.state);
  assert.equal(JSON.parse(noMinors.state).facts.guests,4);
});

test('filhos declarados em mensagem separada permanecem no pacote e não são omitidos',async()=>{
  const couple=await turn('Somos um casal');
  const family=await turn('Dois filhos',couple.state);
  assert.equal(family.result.match_type,'package_followup');
  assert.equal(JSON.parse(family.state).facts.guests,4);
  assert.equal(JSON.parse(family.state).facts.children_pending,true);
  assert.match(family.result.conversation_text,/idades de todos os filhos/);
});

test('F2 extenso passa pelo resolver de pacote sem política genérica substituir a família completa',async()=>{
  for(const [message,months] of [['Ela tem seis anos',72],['um ano e seis meses',18]]) {
    const first=await turn('Somos um casal e uma criança');
    const final=await turn(message,first.state);
    assert.equal(JSON.parse(final.state).facts.guests,3,message);
    assert.equal(JSON.parse(final.state).facts.children_pending,false,message);
    assert.deepEqual(JSON.parse(final.state).family_party.ages_months,[months],message);
    assert.equal(final.result.match_type,'package_followup',message);
    assert.match(final.result.conversation_text,/Loft/,message);
    assert.doesNotMatch(final.result.conversation_text,/Quais são as idades/,message);
  }
});

test('áudio transcrito por fixture preserva idades por extenso até a resposta final sem expor URL',async()=>{
  for(const [spoken,months] of [['Ela tem seis anos',72],['um ano e seis meses',18]]) {
    const first=await turn('Somos um casal e uma criança');
    const audio='https://media.example.com/voice.ogg?signature=private-fixture';
    const at=Date.now();
    const prepared=await handleConversation({operation:'prepare',user_message:audio,state:first.state},
      'Bearer fixture-only',async()=>spoken,at);
    assert.equal(prepared.transcription_status,'ok');
    const routed=control({operation:'route',user_message:audio,state:prepared.state,ai_response:'Resposta informativa.',proposed:'NOQUOTE'},at);
    const final=await invoke(resolver,{user_message:audio,state:routed.state});
    assert.equal(final.match_type,'package_followup',spoken);
    assert.deepEqual(JSON.parse(final.state).family_party.ages_months,[months],spoken);
    assert.equal(JSON.parse(final.state).facts.guests,3,spoken);
    assert.match(final.conversation_text,/Loft/);
    assert.doesNotMatch(final.state+final.conversation_text,/signature|media\.example|Bearer/);
  }
});

test('pendência no gerador de pacote e no motor mantém pergunta neutra, sem cotar ou alterar cálculos',async()=>{
  const first=await turn('Somos um casal e dois filhos');
  const state=JSON.parse(first.state);
  const recommendation=packageRecommendation(pkg,rooms,4,state);
  assert.match(recommendation,/idades de todos os filhos/);assert.doesNotMatch(recommendation,/R\$/);
  for(const matching of [true,false]) {
    const quoteState={...state,facts:{...state.facts,check_in:matching?'2026-09-20':'2026-09-21',check_out:'2026-09-22'}};
    const result=await invoke(getPrices,{checkIn:'2026-09-20',checkOut:'2026-09-22',guests:4,state:quoteState});
    assert.equal(result.quote_request,'NOQUOTE');assert.equal(result.quote_state,'');
    assert.match(result.conversation_text,/idades de todos os filhos/);
    assert.doesNotMatch(result.conversation_text,/idades das crianças|R\$/);
  }
});
