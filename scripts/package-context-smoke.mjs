// Read-only HTTP smoke: catalog/conversation endpoints only. All state is
// synthetic; no contact, subscriber, booking, WhatsApp send or media analysis.
// Run from the linked project with --vercel for a protected deployment.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const base=new URL(process.argv[2] || 'https://reservas.hotelsolar.tur.br');
assert.equal(base.protocol,'https:');
assert.ok(base.hostname==='reservas.hotelsolar.tur.br' || /^motor-de-reservas-on-line-hotel-solar-[a-z0-9]+\.vercel\.app$/.test(base.hostname));
assert.equal(base.username,'');
assert.equal(base.password,'');
const protectedDeployment=process.argv.includes('--vercel');
const run=promisify(execFile);

async function post(path,body) {
  assert.ok(['/api/conversation-control','/api/resolve-package'].includes(path));
  if (path==='/api/conversation-control') assert.ok(['prepare','route'].includes(body.operation));
  assert.equal(body.subscriber_id,undefined);
  let bytes;
  if (protectedDeployment) {
    // Optional existing CLI path avoids repeated npm resolution; no token is
    // read, printed or passed by this script. Vercel manages its own session.
    const cli=process.env.VERCEL_CLI_PATH;
    const args=cli
      ? [cli,'curl',path,'--deployment',base.origin,'--','--silent','--show-error','--fail']
      : ['--yes','vercel@59.11.7','curl',path,'--deployment',base.origin,'--','--silent','--show-error','--fail'];
    args.push('-X','POST','-H','Content-Type: application/json','--data-binary',JSON.stringify(body));
    const {stdout}=await run(cli ? process.execPath : 'npx',args,{encoding:'buffer',maxBuffer:8*1024*1024,timeout:60000});
    bytes=stdout;
  } else {
    const response=await fetch(new URL(path,base),{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000),
    });
    assert.equal(response.status,200,path);
    bytes=Buffer.from(await response.arrayBuffer());
  }
  return JSON.parse(bytes.toString());
}

const oldFacts={guests:3,check_in:'2026-09-04',check_out:'2026-09-06',extras:['MESA']};
const oldQuote={version:1,id:'synthetic-september-quote',created_at:Date.now(),...oldFacts,
  options:[{name:'Loft',capacity:4,total:1777}]};
const initial={version:2,history:['Para três pessoas, de 04/09/2026 a 06/09/2026'],facts:oldFacts,greeted:true};
const oldSeptember=/2026-09-0[46]|0[46]\/09(?:\/2026)?/;
const displayDate=value=>value.split('-').reverse().join('/');

function noCollection(result) {
  assert.notEqual(result.quote_request,'COLETAR');
  if ('can_collect' in result) assert.equal(result.can_collect,'NAO');
  if ('confirmation_text' in result) assert.equal(result.confirmation_text,'');
  if (result.state) assert.equal(JSON.parse(result.state).pending,undefined);
}

function cleanFacts(state) {
  const parsed=JSON.parse(state);
  assert.equal(parsed.facts.guests,3);
  assert.equal(parsed.facts.check_in,undefined);
  assert.equal(parsed.facts.check_out,undefined);
  assert.deepEqual(parsed.facts.extras,[]);
  return parsed;
}

async function turn(user_message,state) {
  const prepared=await post('/api/conversation-control',{operation:'prepare',user_message,state,quote_state:oldQuote});
  noCollection(prepared);
  const routed=await post('/api/conversation-control',{
    operation:'route',user_message,state:prepared.state,quote_state:oldQuote,
    proposed:'QUOTE|2026-09-04|2026-09-06|1|MESA',
    ai_response:'Recomendo o Loft para uma pessoa, de 04/09/2026 a 06/09/2026 por R$ 1.777,00.',
  });
  assert.equal(routed.quote_request,'NOQUOTE',user_message);
  noCollection(routed);
  assert.doesNotMatch(routed.answer,oldSeptember,user_message);
  assert.doesNotMatch(routed.answer,/quais.*datas|datas de entrada e saída|quantas pessoas|nome completo|CPF/i,user_message);
  return routed;
}

const initialMessage='do reveillon';
const openedRoute=await turn(initialMessage,initial);
const opened=await post('/api/resolve-package',{user_message:initialMessage,state:openedRoute.state});
assert.match(opened.quote_request,/^PACKAGE_ID\|/);
noCollection(opened);
const openedState=cleanFacts(opened.state);
assert.equal(openedState.topic,'package_info');
const context=openedState.package_context;
assert.ok(context && context.id && context.name);
assert.match(context.name,/r[eé]veillon/i);
for (const date of [context.start_date,context.end_date]) {
  assert.match(date,/^20\d{2}-\d{2}-\d{2}$/);
  assert.equal(new Date(`${date}T12:00:00Z`).toISOString().slice(0,10),date);
  assert.ok(opened.conversation_text.includes(displayDate(date)));
}
assert.ok(context.end_date>context.start_date);
assert.equal(opened.quote_request,`PACKAGE_ID|${context.id}`);
assert.doesNotMatch(opened.conversation_text,oldSeptember);
let state=opened.state;
const steps=[];

for (const user_message of ['oq vc me indica para tres pessoas?','somos um casal e uma criança de 5 anos','o que inclui?']) {
  const routed=await turn(user_message,state);
  const result=await post('/api/resolve-package',{user_message,state:routed.state});
  assert.equal(result.quote_request,'ROOM_LIST',user_message);
  assert.equal(result.availability_checked,false,user_message);
  assert.ok(!result.package_image_url,user_message);
  noCollection(result);
  const remembered=cleanFacts(result.state);
  assert.equal(remembered.topic,'package_info',user_message);
  for (const key of ['id','name','start_date','end_date']) assert.equal(remembered.package_context[key],context[key],`${user_message}: ${key}`);
  assert.ok(result.conversation_text.includes(context.name),user_message);
  assert.ok(result.conversation_text.includes(displayDate(context.start_date)),user_message);
  assert.ok(result.conversation_text.includes(displayDate(context.end_date)),user_message);
  assert.doesNotMatch(result.conversation_text,oldSeptember,user_message);
  assert.doesNotMatch(result.conversation_text,/quais.*datas|datas de entrada e saída|quantas pessoas|1 hóspede|1 pessoa|nome completo|CPF/i,user_message);
  assert.match(result.conversation_text,/informativ|não confirmam? disponibilidade|sem confirmar disponibilidade/i,user_message);
  if (user_message.includes('criança')) assert.equal(remembered.facts.children_pending,false);
  state=result.state;
  steps.push({message:user_message,decision:result.quote_request,guests:remembered.facts.guests});
}

const photoMessage='Quero fotos da hidromassagem';
const photoRoute=await turn(photoMessage,state);
assert.equal(JSON.parse(photoRoute.state).package_context,undefined);
const photo=await post('/api/resolve-package',{user_message:photoMessage,state:photoRoute.state});
assert.match(photo.quote_request,/^EXTRA_ID\|HIDRO\|/);
assert.deepEqual(photo.photo_codes,['HIDRO']);
assert.equal(photo.availability_checked,false);
assert.equal(JSON.parse(photo.state).package_context,undefined);
assert.equal(JSON.parse(photo.state).topic,'extra_photos');
assert.doesNotMatch(photo.conversation_text,/r[eé]veillon|piscina principal/i);
cleanFacts(photo.state);
noCollection(photo);

console.log(JSON.stringify({status:'ok',base:base.origin,
  catalogPackage:{id:context.id,name:context.name,start_date:context.start_date,end_date:context.end_date},
  oldSeptemberQuoteBlocked:true,coupleAndChildGuests:3,catalogNotAcceptedAsBooking:true,
  packageImageNotRepeated:true,includesContextVerified:true,hydroClearedPackage:true,steps,
},null,2));
