import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

// Pure controller only: no model, database, booking or outbound requests.
const b=await build({entryPoints:['api/conversation-control.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {control}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const now=Date.parse('2026-09-13T10:00:00-03:00');
const initial={version:2,history:[],facts:{guests:2,extras:[],check_in:'2026-09-18',check_out:'2026-09-20'},greeted:true};
const oldQuote='QUOTE|2026-09-18|2026-09-20|2|NONE';
function turn(message,state=initial,proposed=oldQuote,time=now){
  const p=control({operation:'prepare',user_message:message,state},time);
  const r=control({operation:'route',user_message:message,state:p.state,proposed,ai_response:'Cotação antiga sintética.'},time);
  return {p,r,state:JSON.parse(r.state)};
}
function cannotQuote(result){
  assert.equal(result.r.quote_request,'NOQUOTE');
  assert.equal(result.r.can_collect,'NAO');
  assert.equal(result.r.confirmation_text,'');
  assert.equal(result.state.facts.check_out,undefined);
  assert.match(result.r.answer,/data|saída|entrada/i);
}

test('correção abreviada substitui as duas datas, mesmo com QUOTE antigo do modelo',()=>{
  for(const message of ['Na verdade de 19 a 21/09','Na verdade, de 19a21/09',
    'Corrigindo: 19 até 21/09','De 19-21/09','Quero hospedagem de 19 a 21/09']){
    const result=turn(message);
    assert.equal(result.state.facts.check_in,'2026-09-19',message);
    assert.equal(result.state.facts.check_out,'2026-09-21',message);
    assert.equal(result.r.quote_request,'QUOTE|2026-09-19|2026-09-21|2|NONE',message);
    assert.equal(result.r.can_collect,'NAO');
    assert.equal(result.state.stay_date_pending,undefined);
  }
});

test('mudar checkout em duas mensagens inutiliza saída antiga antes da substituição',()=>{
  const first=turn('Quero mudar a data de saída');
  cannotQuote(first);
  assert.equal(first.state.facts.check_in,'2026-09-18');
  assert.equal(first.state.stay_date_pending.reason,'checkout_correction');
  assert.match(first.r.answer,/nova data de saída/);
  for(const message of ['21/09','Saída 21/09','Vou sair 21/09']){
    const next=turn(message,first.r.state);
    assert.equal(next.r.quote_request,'QUOTE|2026-09-18|2026-09-21|2|NONE',message);
    assert.equal(next.state.stay_date_pending,undefined,message);
  }
});

test('saída declarada com sair substitui a antiga sem depender de uma pendência anterior',()=>{
  for(const message of ['Na verdade vou sair 21/09','Quero sair 21/09','Vou sair 21/09',
    'Na verdade saio 21/09','Saída 21/09']){
    const result=turn(message);
    assert.equal(result.state.facts.check_in,'2026-09-18',message);
    assert.equal(result.state.facts.check_out,'2026-09-21',message);
    assert.equal(result.r.quote_request,'QUOTE|2026-09-18|2026-09-21|2|NONE',message);
    assert.equal(result.state.stay_date_pending,undefined,message);
  }
});

test('sim, número do dia e expiração nunca restauram a saída descartada',()=>{
  const first=turn('Quero alterar a saída');
  for(const message of ['Sim','21','Pode manter','Ainda vou decidir']){
    const next=turn(message,first.r.state);
    cannotQuote(next);
  }
  cannotQuote(turn('Sim',first.r.state,oldQuote,now+31*60000));
  cannotQuote(turn('Mude a saída para dia 21'));
  const injected={...first.state,facts:{...first.state.facts,check_out:'2026-09-20'}};
  cannotQuote(turn('Sim',injected));
});

test('data isolada sem papel explícito não conserva uma cotação antiga',()=>{
  for(const message of ['21/09','Na verdade 21/09']){
    const result=turn(message);
    cannotQuote(result);
    assert.equal(result.state.facts.check_in,undefined);
  }
  assert.equal(turn('Até 21/09').r.quote_request,'QUOTE|2026-09-18|2026-09-21|2|NONE');
});

test('intervalo abreviado inválido ou ambíguo bloqueia cotação sem inferir outro mês',()=>{
  for(const message of ['Na verdade de 30 a 02/10','Na verdade de 31 a 32/09',
    'Na verdade de 19 a 21/13','Na verdade de 29 a 30/02/2027','Na verdade de 19 a 21/09/202',
    'Não era 18/09 a 20/09, era de 19 a 21/09']){
    const result=turn(message);
    cannotQuote(result);
    assert.equal(result.state.facts.check_in,undefined,message);
  }
});

test('limites reais de mês, ano e ano explícito são preservados',()=>{
  for(const [message,start,end] of [
    ['Na verdade de 30/09 a 02/10','2026-09-30','2026-10-02'],
    ['Na verdade de 30/12 a 02/01','2026-12-30','2027-01-02'],
    ['Na verdade de 19 a 21/09/2027','2027-09-19','2027-09-21'],
    ['Na verdade de 19 a 21/09/27','2027-09-19','2027-09-21'],
  ]){
    const result=turn(message);
    assert.equal(result.r.quote_request,`QUOTE|${start}|${end}|2|NONE`,message);
  }
});

test('rótulos de entrada e saída prevalecem sobre ordem da correção',()=>{
  for(const message of ['Saída 21/09, entrada 19/09',
    'Na verdade vou sair 21/09 e entrar 19/09','Check-out 21/09 e check-in 19/09']){
    assert.equal(turn(message).r.quote_request,'QUOTE|2026-09-19|2026-09-21|2|NONE',message);
  }
  cannotQuote(turn('Entrada 19/09, entrada 21/09'));
  cannotQuote(turn('Entrada 19/09, saída 31/09'));
});

test('recusa de mudança, FAQ e fotos não viram nova declaração de datas',()=>{
  for(const message of ['Não quero mudar a saída','Não mude a saída para 21/09',
    'Qual é o horário de saída?','Quero fotos dos apartamentos para 19 a 21/09']){
    const result=turn(message,initial,'NOQUOTE');
    assert.deepEqual(result.state.facts,initial.facts,message);
    assert.equal(result.r.quote_request,'NOQUOTE',message);
  }
});

test('resolver mantém a pergunta de checkout e não consulta catálogo nem extras',async()=>{
  const bundle=await build({entryPoints:['api/resolve-package.ts'],bundle:true,write:false,platform:'node',format:'esm',
    define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
    plugins:[{name:'block-provider',setup(builder){
      builder.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'blocked',namespace:'blocked'}));
      builder.onLoad({filter:/.*/,namespace:'blocked'},()=>({contents:'export function createClient(){throw Error("Unexpected provider access")}'}));
    }}]});
  const resolver=(await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))).default;
  const first=turn('Quero mudar a saída',initial,oldQuote,Date.now());
  let response;
  const res={status(code){assert.equal(code,200);return this;},json(value){response=value;}};
  await resolver({method:'POST',body:{user_message:'Quero mudar a saída',state:first.r.state}},res);
  assert.equal(response.quote_request,'ROOM_LIST');
  assert.equal(response.conversation_text,first.r.answer);
  assert.equal(response.availability_checked,false);
  assert.equal(JSON.parse(response.state).facts.check_out,undefined);
  await resolver({method:'POST',body:{user_message:response.conversation_text,state:response.state},query:{operation:'offers'}},res);
  assert.equal(response.quote_request,'ROOM_DONE');
  assert.equal(response.availability_checked,false);
});
