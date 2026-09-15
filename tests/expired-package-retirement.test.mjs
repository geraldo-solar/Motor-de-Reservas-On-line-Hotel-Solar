import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const now=Date.parse('2026-09-15T18:00:00Z'),realNow=Date.now;Date.now=()=>now;after(()=>Date.now=realNow);
const old={id:'1f8c71b5-a692-4fbc-a155-01d12251b223',name:'Independência — Salinas Só Sua',active:true,start_iso_date:'2026-09-04',end_iso_date:'2026-09-07',description:'OFERTA_ANTIGA_REMOVER R$999',image_url:'data:image/png;base64,aGVsbG8=',room_prices:[],no_checkin_dates:[],no_checkout_dates:[]};
const future={...old,id:'20270000-0000-0000-0000-000000000001',name:'Independência Solar 2027',start_iso_date:'2027-09-04',end_iso_date:'2027-09-07',description:'Oferta futura confirmada no fixture'};
const newYear={...old,id:'20270000-0000-0000-0000-000000000002',name:'Réveillon Solar 2027',start_iso_date:'2026-12-31',end_iso_date:'2027-01-03',description:'Pacote atual de Réveillon'};
const fixture={packages:[old,future,newYear],room_types:[{id:'casal',name:'Suíte Casal',capacity:2,active:true,base_price:410,overrides:[]}],extras:[]};
const b=await build({stdin:{contents:`export {control,handleConversation} from './api/conversation-control.ts';export {default as resolver} from './api/resolve-package.ts';export {default as prices} from './api/get-prices.ts';export {default as media} from './api/package-media.ts';export {default as image} from './api/package-image.ts';export * from './utils/packageAvailability.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},plugins:[{name:'catalogue-read-only',setup(b){
    b.onResolve({filter:/^sharp$/},()=>({path:pathToFileURL(createRequire(import.meta.url).resolve('sharp')).href,external:true}));
    b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'test'}));
    b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`const data=${JSON.stringify(fixture)};export function createClient(){return {from(table){if(!(table in data))throw Error('Forbidden table');let rows=data[table];const q={select(){return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve)}};return q}};}`}));}}]});
const {control,handleConversation,resolver,prices,media,image,currentPackage,retiredIndependence}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const focus=p=>({id:p.id,name:p.name,start_date:p.start_iso_date,end_date:p.end_iso_date,updated_at:now});
const fresh=()=>({version:2,history:[],facts:{extras:[]},greeted:true});
const stale=()=>({...fresh(),history:['Quero saber do pacote Independência 2026'],topic:'package_info',topic_at:now,package_context:focus(old),turns:[{role:'assistant',text:old.name+' '+old.description},{role:'user',text:'Quanto fica?'}]});
async function request(handler,body,query={},method='POST'){
  let result,status;await handler({method,body,query,headers:{}},{status(code){status=code;return this},json(value){result=value;return value},setHeader(){},send(value){result=value;return value}});return {status,result};
}
async function turn(text,state=fresh(),audio=false){
  const input=audio?'https://media.example.com/synthetic-retired-package.ogg':text;
  const p=audio?await handleConversation({operation:'prepare',state,user_message:input},'Bearer fixture',async()=>text,now):control({operation:'prepare',state,user_message:text},now);
  const r=control({operation:'route',state:p.state,user_message:input,proposed:'COLETAR',ai_response:old.name+' '+old.description},now);
  const {status,result}=await request(resolver,{state:r.state,user_message:input});assert.equal(status,200);
  return {p,r,result,state:JSON.parse(result.state||r.state),text:result.conversation_text};
}
test('pedido por nome, data ou áudio não entrega oferta, foto, preço nem coleta do pacote encerrado',async()=>{
  for(const message of ['Quero saber do pacote Independência de 2026','Tem o pacote do feriado de 7 de setembro de 2026?','Quero fotos do pacote Independência 2026'])for(const audio of [false,true]){
    const out=await turn(message,fresh(),audio);assert.equal(out.r.quote_request,'NOQUOTE');assert.equal(out.result.quote_request,'ROOM_LIST');
    assert.match(out.text,/pacote já foi encerrado/);assert.doesNotMatch(out.text,/OFERTA_ANTIGA|R\$999|PACKAGE_ID/);
    assert.equal(out.result.package_image_url,'');assert.equal(out.state.package_context,undefined);assert.equal(out.r.can_collect,'NAO');
  }
});
test('continuação e memória migrada removem oferta vencida mesmo com TTL recente',async()=>{
  const out=await turn('Quanto fica?',stale());assert.match(out.text,/encerrado/);assert.equal(out.state.package_context,undefined);
  assert.doesNotMatch(JSON.parse(out.p.context).conversa_recente?.map(t=>t.text).join(' ')||'',/OFERTA_ANTIGA/);
  assert.ok(out.state.turns.every(t=>!t.text.includes('OFERTA_ANTIGA')));
  const attempted=control({operation:'remember_response',state:out.state,response_text:old.name+' '+old.description,package_context:focus(old)},now);
  const saved=JSON.parse(attempted.state);assert.equal(saved.package_context,undefined);assert.ok(saved.turns.every(t=>!t.text.includes('OFERTA_ANTIGA')));
});
test('histórico vencido não rouba novo assunto, novo pacote nem pedido de humano',async()=>{
  const next=await turn('Quero conhecer o pacote Réveillon',stale());assert.equal(next.result.package_id,newYear.id);
  const service=await turn('Preciso da nota fiscal da minha hospedagem no feriado de 7 de setembro de 2026',stale());assert.equal(service.r.quote_request,'HUMANO');assert.equal(service.result.quote_request,'HUMANO');
  const human=await turn('Quero falar com a recepção sobre Independência 2026',stale());assert.equal(human.result.quote_request,'HUMANO');
});
test('listas filtram vencidos e futuro explicitamente cadastrado não é confundido com 2026',async()=>{
  const list=await request(resolver,{user_message:'quais pacotes existem?',state:fresh()});
  assert.doesNotMatch(list.result.conversation_text,/Salinas Só Sua|OFERTA_ANTIGA|04\/09\/2026/);
  const next=await turn('Quero conhecer Independência Solar 2027');assert.equal(next.result.package_id,future.id);
  assert.equal(currentPackage(old,now),false);assert.equal(currentPackage(future,now),true);
  assert.equal(retiredIndependence('Independência 2027',now),false);
});
test('mídia por ID antigo não retorna imagem nem texto; código legado usa apenas oferta vigente',async()=>{
  for(const handler of [media,image]){
    const isImage=handler===image;
    const out=await request(handler,isImage?{}:{package_request:'PACKAGE_ID|'+old.id},{code:'PACKAGE_ID|'+old.id},isImage?'GET':'POST');
    assert.equal(out.status,404);assert.doesNotMatch(JSON.stringify(out.result),/OFERTA_ANTIGA|R\$999/);
  }
  const legacy=await request(media,{package_request:'INDEPENDENCIA'});assert.equal(legacy.status,200);
  assert.match(JSON.stringify(legacy.result),/2027/);assert.doesNotMatch(JSON.stringify(legacy.result),/OFERTA_ANTIGA/);
});
test('cotação antiga não é recalculada nem confirmada pelo fluxo conversacional',async()=>{
  const quote={version:1,id:'old-price',created_at:now,check_in:'2026-09-04',check_out:'2026-09-07',guests:2,extras:[],options:[{name:'Suíte Casal',capacity:2,total:999}]};
  const state={...stale(),facts:{check_in:quote.check_in,check_out:quote.check_out,guests:2,extras:[]},pending:{quote_id:quote.id,option:'Suíte Casal'}};
  assert.equal(control({operation:'confirm',state,quote_state:quote},now).can_collect,'NAO');
  const priced=await request(prices,{quote_request:'QUOTE|2026-09-04|2026-09-07|2|NONE'});
  assert.equal(priced.status,200);assert.equal(priced.result.quote_state,'');assert.equal(priced.result.can_collect,'NAO');assert.match(priced.result.conversation_text,/período já passou/);
});
test('resposta insegura do modelo não reintroduz oferta antiga em pergunta genérica',()=>{
  const p=control({operation:'prepare',user_message:'O que vocês oferecem?',state:fresh()},now);
  const r=control({operation:'route',user_message:'O que vocês oferecem?',state:p.state,ai_response:old.name+' '+old.description},now);
  assert.doesNotMatch(r.answer,/OFERTA_ANTIGA/);assert.match(r.answer,/encerrado/);
});
