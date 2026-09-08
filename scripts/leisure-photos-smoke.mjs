// Read-only integration smoke: no WhatsApp sends, bookings or provider analysis.
// Run from a Vercel-linked directory with --vercel for protected deployments.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';

const base=new URL(process.argv[2] || 'https://reservas.hotelsolar.tur.br');
assert.equal(base.protocol,'https:');
assert.ok(base.hostname==='reservas.hotelsolar.tur.br' || /^motor-de-reservas-on-line-hotel-solar-[a-z0-9]+\.vercel\.app$/.test(base.hostname));
const protectedDeployment=process.argv.includes('--vercel');
const run=promisify(execFile);
async function call(path,body) {
  if(protectedDeployment) {
    const args=['--yes','vercel@59.11.7','curl',path,'--deployment',base.origin,'--','--silent','--show-error','--fail'];
    if(body) args.push('-X','POST','-H','Content-Type: application/json','--data-binary',JSON.stringify(body));
    const {stdout}=await run('npx',args,{encoding:'buffer',maxBuffer:8*1024*1024,timeout:60000});
    return stdout;
  }
  const response=await fetch(new URL(path,base),body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)} : {signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,200,path);
  return Buffer.from(await response.arrayBuffer());
}
const post=async(path,body)=>JSON.parse((await call(path,body)).toString());
const facts={guests:2,extras:[]};
const emptyState=()=>({version:2,history:[],facts,greeted:true});
async function turn(user_message,state=emptyState()) {
  const prepared=await post('/api/conversation-control',{operation:'prepare',user_message,state});
  const routed=await post('/api/conversation-control',{operation:'route',user_message,state:prepared.state,ai_response:'No momento, não disponho de fotos para envio.',proposed:'COLETAR'});
  assert.equal(routed.can_collect,'NAO');
  assert.equal(routed.confirmation_text,'');
  assert.deepEqual(JSON.parse(routed.state).facts,facts);
  return routed;
}

for(const [information,followup,expected] of [
  ['O hotel tem piscina?','Tem fotos?','PISCINA'],
  ['Tem parquinho para crianças?','Tem foto?','PARQUE'],
  ['Playground para crianças?','Tem foto?','PARQUE'],
  ['Tem duas piscinas de hidromassagem?','Tem fotos delas?','HIDRO'],
]) {
  const first=await turn(information);
  const routed=await turn(followup,first.state);
  const result=await post('/api/resolve-package',{user_message:followup,state:routed.state});
  assert.deepEqual(result.photo_codes,[expected]);
  assert.doesNotMatch(result.conversation_text,/não disponho|não há foto|idades das crianças/i);
}

const combined='Me mande fotos do parque infantil, piscina principal, hidromassagens e bicicletas';
const routed=await turn(combined);
let media=await post('/api/resolve-package',{user_message:combined,state:routed.state});
assert.deepEqual(media.photo_codes,['PARQUE','PISCINA','HIDRO','BIKE']);
const results=[];
while(media.quote_request!=='ROOM_DONE') {
  assert.ok(results.length<4,'photo queue must finish');
  const code=media.quote_request.split('|')[1];
  if(code==='HIDRO') assert.equal(media.conversation_text,'Uma das piscinas de hidromassagem do Hotel Solar 📷');
  const bytes=await call('/api/package-image?code='+encodeURIComponent(media.quote_request));
  const metadata=await sharp(bytes).metadata();
  assert.equal(metadata.format,'jpeg');
  assert.ok(bytes.length<4_500_000);
  assert.ok(metadata.width<=1280 && metadata.height<=1280);
  results.push({code,bytes:bytes.length,width:metadata.width,height:metadata.height});
  media=await post('/api/resolve-package?operation=next',{user_message:media.quote_request});
}
assert.deepEqual(results.map(item=>item.code),['PARQUE','PISCINA','HIDRO','BIKE']);
for(const [message,code] of [['Quero uma imagem das bicicletas','BIKE'],['Quero fotos das duas piscinas de hidromassagem','HIDRO']]) {
  const repeat=await turn(message,{...emptyState(),extra_photo_requests:[code]});
  const repeated=await post('/api/resolve-package',{user_message:message,state:repeat.state});
  assert.deepEqual(repeated.photo_codes,[code]);
}
const hydroFollowup=await turn('E das hidros?',(await turn('Fotos da piscina principal')).state);
assert.deepEqual((await post('/api/resolve-package',{user_message:'E das hidros?',state:hydroFollowup.state})).photo_codes,['HIDRO']);
const allPools=await turn('Fotos das três piscinas');
assert.deepEqual((await post('/api/resolve-package',{user_message:'Fotos das três piscinas',state:allPools.state})).photo_codes,['PISCINA','HIDRO']);
for(const [information,followup] of [['Fotos da hidro','E de todas as piscinas?'],['Tem três piscinas?','Tem fotos delas?']]) {
  const next=await turn(followup,(await turn(information)).state);
  assert.deepEqual((await post('/api/resolve-package',{user_message:followup,state:next.state})).photo_codes,['PISCINA','HIDRO']);
}
console.log(JSON.stringify({status:'ok',base:base.origin,exactInboxSequences:3,hydroContextVerified:true,queueTerminated:true,photos:results},null,2));
