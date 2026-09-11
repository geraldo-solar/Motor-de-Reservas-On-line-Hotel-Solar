// Read-only conversational HTTP checks. No ManyChat send, contact write,
// reservation creation, event consent, or actual media-provider request.
import assert from 'node:assert/strict';
const base='https://reservas.hotelsolar.tur.br';
const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Belem',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(Date.now());
const part=k=>parts.find(p=>p.type===k).value;
const today=`${part('year')}-${part('month')}-${part('day')}`;
const hour=Number(part('hour'));
const greeting=(hour>=5&&hour<12?'Bom dia':hour>=12&&hour<18?'Boa tarde':'Boa noite')+'!';
async function post(path,body) {
  assert.ok(['/api/conversation-control','/api/resolve-package'].includes(path));
  if(path==='/api/conversation-control') assert.ok(['prepare','route'].includes(body.operation));
  const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  assert.equal(response.status,200);
  return response.json();
}
const facts={extras:[],guests:2};
let state={version:2,history:[],facts,greeted:true,daily_greeting:{day:'2026-09-01',first:false}};
for(const [index,user_message] of ['Tem micro-ondas para aquecer comida do bebê?','Qual o telefone do hotel?'].entries()) {
  const prepared=await post('/api/conversation-control',{operation:'prepare',state,user_message});
  assert.equal(JSON.parse(prepared.context).primeira_resposta_do_dia,index===0);
  const routed=await post('/api/conversation-control',{operation:'route',state:prepared.state,user_message,ai_response:'Resposta sintética de teste.'});
  const final=await post('/api/resolve-package',{state:routed.state,user_message});
  assert.equal(final.conversation_text.startsWith(greeting),index===0);
  assert.notEqual(final.quote_request,'COLETAR');
  state=JSON.parse(final.state);
  assert.deepEqual(state.facts,facts);
  assert.equal(state.daily_greeting.day,today);
}
console.log('PASS: primeira saudação diária, segunda resposta sem repetição, texto final e fatos preservados; nenhum envio a cliente.');
