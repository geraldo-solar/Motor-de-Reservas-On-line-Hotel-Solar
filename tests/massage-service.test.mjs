import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';
const realFetch=globalThis.fetch;
Reflect.set(globalThis,'fetch',async()=>{throw Error('External requests forbidden');});
after(()=>Reflect.set(globalThis,'fetch',realFetch));
const bundle=await build({stdin:{contents:`export {control,handleConversation} from './api/conversation-control.ts';export {default as resolver} from './api/resolve-package.ts';export * from './utils/massageService.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},plugins:[{name:'no-catalog',setup(b){
    b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export function createClient(){return {from(){throw Error('Massage information must not consult the catalog')}}}` }));
  }}]});
const {control,handleConversation,resolver,massagePolicy,massageInquiry,massageServiceAnswer,readMassageContext}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const now=Date.now(),facts={extras:['LUA'],check_in:'2026-12-31',check_out:'2027-01-03',guests:3};
const initial=()=>({version:2,history:[],facts,greeted:true,daily_greeting:{day:new Date(now-3*3600000).toISOString().slice(0,10),first:false},
  assistant_disclosure:{version:1,show:false,rendered:true},pending:{quote_id:'old',option:'LOFT'},topic:'room_photos',topic_at:now,subject:'LOFT'});
async function turn(message,state=initial(),audio=false){
  const raw=audio?'https://fixture.invalid/massage.ogg':message;
  const p=await handleConversation({operation:'prepare',user_message:raw,state},'',async()=>message,now);
  const r=control({operation:'route',user_message:raw,state:p.state,proposed:'COLETAR',ai_response:'Não oferecemos massagens avulsas. Agendei sua sessão por R$350.'},now);
  let out;await resolver({method:'POST',query:{transport:'manychat-v1'},body:{user_message:raw,state:r.state}},
    {status(s){assert.equal(s,200);return this},json(v){out=v},setHeader(){}});
  return {p,r,out,state:JSON.parse(out.state||r.state)};
}
function valid(t){
  assert.equal(t.r.quote_request,'NOQUOTE');assert.equal(t.out.quote_request,'ROOM_LIST');assert.equal(t.r.can_collect,'NAO');
  assert.equal(t.out.availability_checked,false);assert.equal(t.out.match_type,'outsourced_massage');
  assert.match(t.out.conversation_text,/serviço de massagens terceirizado/);
  for(const phone of massagePolicy.contacts)assert.ok(t.out.conversation_text.includes(phone));
  assert.match(t.out.conversation_text,/cotar valores.*diretamente/s);
  assert.doesNotMatch(t.out.conversation_text,/R\$|Agendei|Encaminhei|Não oferecemos|nao oferecemos|liberada|disponibilidade confirmada/);
  assert.equal(t.out.has_conversation_text,'SIM');assert.equal(JSON.parse(t.out.manychat_payload).texts.conversation_text,t.out.conversation_text);
  assert.deepEqual(t.state.facts,facts);assert.equal(t.state.pending,undefined);assert.equal(t.state.topic,undefined);
}
test('política confirmada inclui os dois contatos e as seis modalidades, sem preço',()=>{
  assert.equal(massagePolicy.confirmed_at,'2026-09-17');assert.equal(massagePolicy.outsourced,true);
  assert.deepEqual(massagePolicy.contacts,['(91) 98477-8630','(91) 98063-8223']);
  for(const modality of massagePolicy.modalities)assert.ok(massageServiceAnswer('Tem massagem?').includes(modality));
  for(const message of ['hidromassagem','Fotos das hidromassagens','kit lua de mel','velas da decoração'])assert.equal(massageInquiry(message),false);
});
test('perguntas, preço, contratação e modalidades entram como informação sem catálogo, texto e áudio',async()=>{
  for(const message of ['Vocês têm massagem?','Quanto custa a massagem?','Quero agendar massagem para 2 pessoas no dia 20/09','Qual o telefone da massagista?',
    'Tem drenagem linfática?','Pedras quentes','SPA dos pés','Reflexologia','Velas aromáticas','Massagem relaxante'])
    for(const audio of [false,true]){
      const t=await turn(message,initial(),audio);valid(t);
      const ctx=JSON.parse(t.p.context);assert.equal(ctx.servico_massagem_confirmado.confirmed_at,'2026-09-17');
      assert.match(ctx.regra,/prevalece sobre a antiga negativa/);
    }
});
test('continuação mantém massagem para preço, telefone e agendamento; não usa o número do hotel',async()=>{
  let t=await turn('Tem massagem?');
  for(const message of ['Quanto custa?','Qual o telefone?','Quais as modalidades?','Como agendar?','Quero reservar','Para hoje']){
    t=await turn(message,t.state);valid(t);assert.doesNotMatch(t.out.conversation_text,/98100-0800/);
  }
});
test('retiro Solar Detox é separado; inclusão/gratuidade e indicação terapêutica não são inventadas',async()=>{
  const detox=await turn('Como funciona o SPA Solar Detox?');valid(detox);assert.match(detox.out.conversation_text,/retiro\/evento.*Separadamente/s);
  const included=await turn('A massagem está inclusa na diária?');valid(included);assert.match(included.out.conversation_text,/não há inclusão ou gratuidade confirmada/);
  const health=await turn('Sou gestante, posso fazer drenagem linfática?');valid(health);assert.match(health.out.conversation_text,/consulte um profissional de saúde/);
});
test('humano, pagamento e reserva existente preservam a prioridade',async()=>{
  const info=await turn('Tem massagem?');
  for(const message of ['Quero falar com a recepção sobre massagem','Já paguei minha reserva, também tem massagem?','Já tenho uma reserva, quero alterar a data e saber da massagem']){
    const t=await turn(message,info.state);assert.equal(t.r.quote_request,'HUMANO',message);assert.equal(t.out.quote_request,'HUMANO',message);
    assert.equal(t.r.can_collect,'NAO');assert.equal(t.state.massage_context,undefined);
  }
});
test('contexto expira e só é renovado pelo cliente; outro assunto não vira massagem',async()=>{
  for(const at of [now+1,now-31*60000,'1',0,Infinity])assert.equal(readMassageContext({at},now),undefined);
  const t=await turn('Tem massagem?');
  const changed=control({operation:'prepare',state:t.state,user_message:'Qual o horário do café da manhã?'},now);
  assert.equal(JSON.parse(changed.state).massage_context,undefined);
  assert.equal(massageServiceAnswer('Qual o telefone?',{at:now-31*60000},now),undefined);
  assert.equal(massageServiceAnswer('Qual o telefone do hotel?',t.state.massage_context,now),undefined);
  assert.equal(massageServiceAnswer('Quero reservar um quarto',t.state.massage_context,now),undefined);
  assert.equal(massageServiceAnswer('Sim',t.state.massage_context,now),undefined);
});
test('informação de massagem não autoriza confirmar uma hospedagem antiga',async()=>{
  const t=await turn('Tem massagem?');
  const confirmed=control({operation:'confirm',state:t.state,user_message:'Quero reservar massagem'},now);
  assert.equal(confirmed.can_collect,'NAO');assert.equal(confirmed.confirmation_text,'');
  const lodging=control({operation:'prepare',state:t.state,user_message:'Quero cotar um quarto para 2 adultos de 20/09 a 22/09'},now);
  const state=JSON.parse(lodging.state);assert.equal(state.massage_context,undefined);assert.equal(state.facts.guests,2);
});
test('ramo de ofertas após a resposta termina em silêncio sem enviar pacote, kit ou repetir contatos',async()=>{
  const t=await turn('Tem massagem?');
  let out;await resolver({method:'POST',query:{operation:'offers',transport:'manychat-v1'},body:{user_message:t.out.conversation_text,state:t.out.state}},
    {status(s){assert.equal(s,200);return this},json(v){out=v},setHeader(){}});
  assert.equal(out.quote_request,'ROOM_DONE');assert.equal(out.conversation_text,'');assert.equal(out.has_conversation_text,'NAO');
});
