import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';

// Synthetic catalogue and anonymized wording only. No provider or live data.
const now=Date.parse('2026-09-15T12:00:00-03:00');
const realNow=Date.now,realFetch=globalThis.fetch;
Date.now=()=>now;
Reflect.set(globalThis,'fetch',async()=>{throw Error('External network is forbidden in this test');});
after(()=>{Date.now=realNow;Reflect.set(globalThis,'fetch',realFetch);});
const pkg={id:'fixture-new-year',name:'Réveillon Solar 2027',start_iso_date:'2026-12-31',end_iso_date:'2027-01-03',
  includes:['Café da manhã incluído'],benefits:[],room_prices:[],full_period_required:true,active:true};
const bundled=await build({stdin:{contents:`export {control} from './api/conversation-control.ts';
  export {default as resolver} from './api/resolve-package.ts';
  export {guestInquiry,explicitLodgingRequest} from './utils/guestInquiry.ts';
  export {newYearDateException,packageConsultationReply} from './utils/packageDateException.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'fixture-only',setup(b){
    b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'test'}));
    b.onLoad({filter:/.*/,namespace:'test'},()=>({loader:'js',contents:`const data=${JSON.stringify({packages:[pkg],room_types:[],extras:[]})};
      export function createClient(){return {from(table){if(!(table in data))throw Error('Unexpected table');
      const q={select(){return q},eq(){return q},then(resolve){return Promise.resolve({data:data[table],error:null}).then(resolve)}};return q}}}` }));
  }}]});
const {control,resolver,guestInquiry,explicitLodgingRequest,newYearDateException,packageConsultationReply}=await import(
  'data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const literal='Gostaria de saber quanto é que tá a reserva pro dia 30 de dezembro até o dia 4 de janeiro se inclui café da manhã pra duas pessoas';
const blank={version:2,history:[],facts:{extras:[]},greeted:true};
const focus={id:pkg.id,name:pkg.name,start_date:pkg.start_iso_date,end_date:pkg.end_iso_date,updated_at:now};

test('pedido misto literal é hospedagem, não café avulso, mesmo sem foco anterior',()=>{
  for(const message of [literal,
    'Quanto está a reserva de 18/09 a 20/09 para duas pessoas com café da manhã?',
    'Qual o valor da reserva de 30/12/2026 a 04/01/2027, com café da manhã?']) {
    assert.equal(explicitLodgingRequest(message),true,message);
    assert.equal(guestInquiry(message),undefined,message);
  }
});

test('café avulso, mesa, restaurante, Day Use e intenção hipotética continuam distintos',()=>{
  for(const message of [
    'Quanto é que tá a reserva de mesa de 30/12 a 04/01 com café da manhã?',
    'Quanto é que tá a reserva no Reserva Solar de 30/12 a 04/01 com café da manhã?',
    'Qual o valor da reserva de café da manhã avulso de 30/12 a 04/01 para duas pessoas?',
    'Quanto fica a reserva de Day Use de 30/12 a 04/01 com café da manhã?',
    'Quanto está a reserva de 30/12 a 04/01 para visitantes, sem hospedagem, com café da manhã?',
    'Se eu quiser reservar, quanto fica a reserva de 30/12 a 04/01 com café da manhã?',
    'Não quero saber quanto está a reserva de 30/12 a 04/01 com café da manhã.',
    'Quanto custa o café da manhã de 30/12 a 04/01 para duas pessoas?',
    'Qual o valor da reserva para duas pessoas?',
  ]) {
    assert.equal(explicitLodgingRequest(message),false,message);
    assert.equal(newYearDateException(message,undefined,now),false,message);
  }
});

test('cruzamento explícito dezembro-janeiro reconhece consulta de exceção sem nome do pacote',()=>{
  for(const message of [
    'Quero hospedagem de 30/12 a 02/01',
    'Quero hospedagem de 30/12/2026 a 02/01/2027',
    'Quero hospedagem de 30/12/26 a 02/01/27',
  ]) {
    assert.equal(newYearDateException(message,undefined,now),true,message);
    const answer=packageConsultationReply(message,undefined,now);
    assert.equal(answer.handoff,true,message);
    assert.match(answer.answer,/31\/12 a 03\/01/);
    assert.match(answer.answer,/sem confirmar a exceção, disponibilidade ou alteração de reserva/);
    assert.doesNotMatch(answer.answer,/R\$|nome completo|CPF|exceção aprovada/);
  }
});

test('datas regulares, negadas, inválidas ou com ano invertido não viram exceção implícita',()=>{
  for(const message of [
    'Quero hospedagem de 31/12/2026 a 03/01/2027',
    'Quero hospedagem de 30/12/2027 a 04/01/2027',
    'Quero hospedagem de 30/12/2026 a 04/01/2026',
    'Quero hospedagem de 30/12/2026 a 04/01/2028',
    'Quero hospedagem de 30/12/2300 a 04/01/2301',
    'Quero hospedagem de 30 de dezembro de 20260 a 4 de janeiro de 20270',
    'Quero hospedagem de 30/12/20260 a 04/01/20270',
    'Quero hospedagem de 30/12/2026 a 32/01/2027',
    'Quero hospedagem de 32/12 a 04/01',
    'Quero hospedagem de 31/11 a 04/01',
    'Quero hospedagem de 30/09 a 04/10',
    'Não posso ir de 30/12 a 04/01 para hospedagem',
    'Essas datas não servem: hospedagem de 30/12 a 04/01',
    'Quero hospedagem, mas não quero de 30/12 a 04/01',
    '30/12 a 04/01',
    'Minha reserva de 30/12 a 04/01 inclui café?',
    'Qual a programação de 30/12 a 04/01?',
    'Quero hospedagem de 30/12 a 04/01 ou de 06/01 a 08/01',
  ]) assert.equal(newYearDateException(message,undefined,now),false,message);
  assert.equal(newYearDateException('Quero reservar Réveillon de 30/12/2027 a 04/01/2027',focus,now),false);
  assert.equal(newYearDateException('Quero reservar Réveillon de 31/02 a 02/03',focus,now),false);
});

test('período completo mais diárias não é exceção; literal segue para cálculo sem aprovar reserva',async()=>{
  for(const message of [literal,'Quero hospedagem de 30 de dezembro de 2026 a 4 de janeiro de 2027',
    'Quero hospedagem de 2026-12-30 a 2027-01-04','Quero hospedagem de 30/12 a 04/01/2027'])
    assert.equal(newYearDateException(message,undefined,now),false,message);
  for(const proposed of ['NOQUOTE','COLETAR','QUOTE|2026-12-30|2027-01-04|2|NONE']) {
    const p=control({operation:'prepare',user_message:literal,state:blank},now);
    const r=control({operation:'route',user_message:literal,state:p.state,proposed,
      ai_response:'Sua reserva está confirmada, pode pagar R$999.'},now);
    assert.equal(r.quote_request,'QUOTE|2026-12-30|2027-01-04|2|NONE');assert.equal(r.can_collect,'NAO');
    assert.equal(r.confirmation_text,'');assert.equal(JSON.parse(r.state).pending,undefined);
    assert.equal(JSON.parse(r.state).facts.check_in,'2026-12-30');
    assert.equal(JSON.parse(r.state).facts.check_out,'2027-01-04');
  }
});

test('pedido misto fora do Réveillon não cria encaminhamento por exceção nem inventa datas',()=>{
  const message='Quanto está a reserva de 18/09 a 20/09 para duas pessoas com café da manhã?';
  assert.equal(explicitLodgingRequest(message),true);
  assert.equal(guestInquiry(message),undefined);
  assert.equal(packageConsultationReply(message,undefined,now),undefined);
});
