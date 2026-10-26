import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';

// Real WhatsApp conversations of 23-26/10/2026 (audit), replayed through
// prepare -> route -> get-prices | resolve-package. Synthetic catalogue with
// the same per-night shape as the motor (3.166,67 x 3 nights), no network.
const start=Date.parse('2026-09-29T11:35:00-03:00');
let now=start;
const realNow=Date.now,realFetch=globalThis.fetch;
Date.now=()=>now;
Reflect.set(globalThis,'fetch',async()=>{throw Error('External network is forbidden in this test');});
after(()=>{Date.now=realNow;Reflect.set(globalThis,'fetch',realFetch);});
const rooms=[['casal','Suíte Casal',2,410,610,1866.67],['triplo','Suíte Triplo',3,490,710,2133.33],['loft','LOFT',4,910,1450,3166.67],
  ['sacada','Suíte Sacada Vista Mar',3,599,810,2366.67],['quadruplo','Suíte Quádruplo',4,599,810,2466.67],['varanda','Suíte Varanda Térreo',4,650,920,2566.67]]
  .map(([id,name,capacity,base_price,extra,night])=>({id,name,capacity,base_price,active:true,overrides:[
    {dateIso:'2026-12-30',price:extra},{dateIso:'2026-12-31',price:night},
    {dateIso:'2027-01-01',price:night,noCheckIn:true,noCheckOut:true},
    {dateIso:'2027-01-02',price:night,noCheckIn:true,noCheckOut:true},
    {dateIso:'2027-01-03',price:extra}]}));
const RV27_ID='0267abd7-ba19-4492-8894-aea827edea33';
const pkg={id:RV27_ID,name:'Réveillon Solar 2027: A Virada em Salinas',active:true,start_iso_date:'2026-12-31',end_iso_date:'2027-01-03',
  description:'A virada de 2027 à beira-mar. Três noites com passeio de catamarã, festa da virada, ceia e open bar. Criança até 6 anos não paga. Parcele em até 6x no cartão.',
  includes:['Quinta 31/12 Check-in · Festa da Virada: ceia, open bar, DJ e banda','Sábado 02/01 Passeio de barco'],benefits:[],
  room_prices:[],max_installments:6,full_period_discount_pct:0,no_checkin_dates:[],no_checkout_dates:[]};
const fixture={room_types:rooms,packages:[pkg,
  {...pkg,id:'natal',name:'Natal em Salinas',start_iso_date:'2026-12-24',end_iso_date:'2026-12-27',max_installments:3,description:'Natal à beira-mar.'},
  {...pkg,id:'natal-reveillon',name:'Natal + Réveillon: 10 Noites em Salinas',start_iso_date:'2026-12-24',end_iso_date:'2027-01-03',max_installments:10,full_period_discount_pct:20,description:'Passe as duas festas em Salinas.'},
  {...pkg,id:'criancas',name:'Dia das Crianças',start_iso_date:'2026-10-09',end_iso_date:'2026-10-12',max_installments:3,description:'Feriado.'}],extras:[]};
const b=await build({stdin:{contents:`export {control} from './api/conversation-control.ts';export {default as prices} from './api/get-prices.ts';export {default as resolver} from './api/resolve-package.ts';
  export {updateFamilyParty} from './utils/familyParty.ts';export {packagePrices} from './utils/packageReply.ts';export * from './utils/newYearSales.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'campaign-catalogue-fixture',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const data=${JSON.stringify(fixture)};export function createClient(){return {from(table){if(!(table in data))throw Error('Forbidden table '+table);return {select(){return {eq(){return Promise.resolve({data:data[table],error:null})}}}}}}}`}));}}]});
const {control,prices,resolver,updateFamilyParty,packagePrices,newYearSalesReply,unknownPartnerInquiry}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));

async function request(handler,body){let output;await handler({method:'POST',body,query:{}},{status(code){assert.equal(code,200);return this;},json(v){output=v;return v;},setHeader(){}});return output;}
// The model answer is deliberately wrong: deterministic branches must replace it.
const WRONG_AI='Não aceitamos pets, incluindo RDC. Parcelamos em até 3 vezes. A festa é no Reserva Solar, sem lugar marcado.';
function conversation(seed){
  let state=seed,quote;
  return async function say(message){
    now+=60000;
    const p=control({operation:'prepare',user_message:message,state,quote_state:quote},now);
    const r=control({operation:'route',user_message:message,state:p.state,proposed:p.quote_request,quote_state:quote,ai_response:WRONG_AI},now);
    let result;
    if(r.quote_request.startsWith('QUOTE|')){result=await request(prices,{quote_request:r.quote_request,state:r.state});if(result.quote_state)quote=result.quote_state;}
    else if(!['COLETAR','HUMANO'].includes(r.quote_request))result=await request(resolver,{user_message:message,state:r.state});
    state=result?.state||r.state;
    return {r,result,state:JSON.parse(state),text:r.quote_request==='COLETAR'?r.confirmation_text:result?.conversation_text??r.answer};
  };
}
const CAMPAIGN_SEED=JSON.stringify({version:2,history:[],facts:{extras:[]},greeted:false,campaign:'RV27'});

// The model answer of each turn can be given, to replay its offers.
function conversationAI(seed){
  let state=seed,quote;
  return async function say(message,ai=WRONG_AI){
    now+=60000;
    const p=control({operation:'prepare',user_message:message,state,quote_state:quote},now);
    const r=control({operation:'route',user_message:message,state:p.state,proposed:p.quote_request,quote_state:quote,ai_response:ai},now);
    let result;
    if(r.quote_request.startsWith('QUOTE|')){result=await request(prices,{quote_request:r.quote_request,state:r.state});if(result.quote_state)quote=result.quote_state;}
    else if(!['COLETAR','HUMANO'].includes(r.quote_request))result=await request(resolver,{user_message:message,state:r.state});
    state=result?.state||r.state;
    return {r,result,state:JSON.parse(state),text:r.quote_request==='COLETAR'?r.confirmation_text:result?.conversation_text??r.answer};
  };
}

test('datas da mensagem fora do Réveillon: cota as datas pedidas (Maria, 4 a 6/12)',async()=>{
  now=Date.parse('2026-10-26T18:39:00-03:00');
  let say=conversationAI(CAMPAIGN_SEED);
  await say('Quais os valores do Réveillon?');
  const two=await say('Qual o valor para 2 pessoas para 4 a 6 de dezembro?');
  assert.equal(two.r.quote_request,'QUOTE|2026-12-04|2026-12-06|2|NONE');
  assert.doesNotMatch(two.text,/Réveillon/);
  say=conversationAI(CAMPAIGN_SEED);
  await say('Quais os valores do Réveillon?');
  const nine=await say('Qual o valor para 9 pessoas para 4 a 6 de dezembro?');
  assert.deepEqual([nine.state.facts.check_in,nine.state.facts.check_out,nine.state.facts.guests],['2026-12-04','2026-12-06',9]);
  assert.doesNotMatch(nine.text,/Réveillon|19\.200/);
  assert.equal(nine.state.package_context,undefined);
});

test('pergunta de pet com grupo e datas guarda a estadia (Celso, 4 a 9/11)',async()=>{
  now=Date.parse('2026-10-25T10:37:00-03:00');
  const say=conversationAI(CAMPAIGN_SEED);
  const pet=await say('Bom dia. Gostaria de saber o valor de 3 adultos e um Pet para 4 a 9 de novembro.');
  assert.match(pet.text,/pets/i);
  const quote=await say('Só 3 adultos.');
  assert.equal(quote.r.quote_request,'QUOTE|2026-11-04|2026-11-09|3|NONE');
  assert.doesNotMatch(quote.text,/Réveillon/);
});

test('"Sim" depois de oferta da IA: cota, chama a equipe ou pergunta o que falta — nunca repete a oferta',async()=>{
  now=Date.parse('2026-10-24T20:00:00-03:00');
  // Iracy: offer of a summary for the room already quoted.
  let say=conversationAI(CAMPAIGN_SEED);
  await say('Quais os valores do Réveillon?');
  await say('4');
  await say('Isso','Quer que eu prepare o resumo do pacote Réveillon para 4 pessoas na Suíte Quádruplo ou prefere outra opção? 😊');
  const iracy=await say('Sim');
  assert.equal(iracy.r.quote_request,'QUOTE|2026-12-31|2027-01-03|4|NONE');
  assert.match(iracy.text,/Suíte Quádruplo/);
  // Janaina: the group was told to the model in words the controller cannot read.
  say=conversationAI(CAMPAIGN_SEED);
  await say('Quais os valores do Réveillon?');
  await say('Teria um valor mais em conta?? Vocês participam da Black Friday?','Não há participação oficial em Black Friday para esse pacote, mas posso calcular o valor para seu grupo. Deseja que eu faça essa simulação para casal com três filhos de 14, 8 e 7 anos?');
  const janaina=await say('Sim');
  assert.equal(janaina.r.quote_request,'HUMANO');assert.match(janaina.text,/equipe para calcular/);
  // Ana Marieta: the ages are now read (item 3), so "Quero" quotes the 5.
  say=conversationAI(CAMPAIGN_SEED);
  await say('Quais os valores do Réveillon?');
  await say('São dois adultos e três crianças de 5 anos duas e uma 4 anos.');
  await say('Duas de 5 anos gêmeas e 1 dr 4 anos.','Posso calcular o valor do pacote para 2 adultos e 3 crianças (duas gêmeas de 5 anos e uma de 4 anos) para você?');
  const marieta=await say('Quero');
  assert.equal(marieta.r.quote_request,'QUOTE|2026-12-31|2027-01-03|5|NONE');assert.doesNotMatch(marieta.text,/Quais são as idades/);
  // Messias: an offer to forward his contact.
  say=conversationAI();
  await say('Bom dia!');
  await say('Estamos com a agenda disponível','Caso tenha interesse em se apresentar no Hotel Solar, posso encaminhar sua solicitação para a equipe responsável. Posso ajudar com isso? 🎤');
  assert.equal((await say('Sim')).r.quote_request,'HUMANO');
  // Without the group, the controller asks for it.
  say=conversationAI();
  await say('Oi');
  await say('Quanto custa?','Posso calcular o valor da hospedagem para você. Deseja que eu faça a simulação?');
  const ask=await say('Pode sim');
  assert.equal(ask.r.quote_request,'NOQUOTE');assert.match(ask.text,/Para quantas pessoas/);
  // "Não" and a new question are not acceptance.
  say=conversationAI(CAMPAIGN_SEED);
  await say('Quais os valores do Réveillon?');
  await say('Ok','Se quiser, posso calcular o valor. Deseja que eu faça a simulação?');
  assert.notEqual((await say('Não')).r.quote_request,'HUMANO');
  await say('Ok','Se quiser, posso calcular o valor. Deseja que eu faça a simulação?');
  const question=await say('Pode ser um apto de casal e um triplo?');
  assert.notEqual(question.r.quote_request,'HUMANO');assert.doesNotMatch(question.text,/equipe para calcular/);
});

const rv=async(...msgs)=>{const say=conversationAI(CAMPAIGN_SEED);await say('Quais os valores do Réveillon?');let t;for(const m of msgs)t=await say(m);return t;};
const plain=async(...msgs)=>{const say=conversationAI();let t;for(const m of msgs)t=await say(m);return t;};

test('grupos escritos como os clientes escrevem viram hóspedes e idades',async()=>{
  now=Date.parse('2026-10-26T15:00:00-03:00');
  for(const [msg,guests,ages] of [['3 não tem criança',3,[]],['Somos 4 , sendo 1 de 15 anos',4,[180]],['3 adultos ( casal e filho)',3,[]],
    ['3 pessoas, o filho tem 23 anos',3,[]],['Casal , filho 23 anos ( 1 quarto)',3,[]],['Apto pra casal',2,[]],
    ['São dois adultos e três crianças de 5 anos duas e uma 4 anos.',5,[48,60,60]]]){
    const t=await rv(msg);
    assert.equal(t.state.facts.guests,guests,msg);
    assert.deepEqual([...(t.state.family_party?.ages_months||[])].sort((a,b)=>a-b),ages,msg);
    assert.match(t.text,/Indicada para vocês/,msg);
  }
  const twins=await rv('2 adultos e 3 crianças','Duas de 5 anos gêmeas e 1 dr 4 anos.');
  assert.equal(twins.state.facts.guests,5);
  const kerlly=await plain('Ola','5 adultos e duas crianças, sendo uma criança de 1 ano e a outra de 8 anos');
  assert.equal(kerlly.state.facts.guests,7);assert.deepEqual([...kerlly.state.family_party.ages_months].sort((a,b)=>a-b),[12,96]);
  const kids=await rv('2 criancas de 6 anos');
  assert.match(kids.text,/Quantos adultos vão com elas\?/);
  assert.equal((await rv('2 criancas de 6 anos','2 adultos')).state.facts.guests,4);
  const finados=await plain('Bom dia! Qual valor para o feriado de finados\n01 casal\n01 criança 12 anos');
  assert.equal(finados.state.facts.guests,3);
  assert.match(finados.text,/Finados não temos um pacote especial/);assert.doesNotMatch(finados.text,/Pacotes ativos/);
});

test('datas escritas de outros jeitos são entendidas',async()=>{
  now=Date.parse('2026-10-26T15:00:00-03:00');
  const helaine=await plain('Boa tarde','Queria saber quanto custa para uma casal um fds do dia 13 - 15 novembro');
  assert.equal(helaine.r.quote_request,'QUOTE|2026-11-13|2026-11-15|2|NONE');
  assert.match((await rv('Valor para 1 pessoa','31/ 12/26 ao dia 01/01 de 2027')).r.quote_request,/^QUOTE\|2026-12-31\|2027-01-03\|1\|/);
  assert.match((await plain('Oi','Somos 4 adultos','A do comercial.\nDe 31 a 03')).r.quote_request,/^QUOTE\|2026-12-31\|2027-01-03\|4\|/);
  const weekend=await plain('Queria reservar quarto','Pra este sábado ate segunda');
  assert.equal(weekend.state.facts.check_in,'2026-10-31');assert.equal(weekend.state.facts.check_out,'2026-11-02');
  // Outside the campaign, "final do ano" lists the December packages (05/10), never "Vou consultar...".
  const sara=await plain('Queria saber mas sobre as hospedagem','Para o final do ano');
  assert.match(sara.text,/Réveillon Solar 2027/);assert.doesNotMatch(sara.text,/Vou consultar/);
  const ten=await plain('Olá! Boa tarde 😊 Gostaria de saber o valor para o Réveillon: check-in dia 31 de dezembro e check-out dia 02 de janeiro, 2 diárias. Somos 10 pessoas. Qual o valor total para os 10 nas 2 diárias? Precisaria de quantos quartos? Tem café da manhã incluso? Faz preço para grupo? Obrigada, aguardo!');
  assert.match(ten.text,/3 apartamentos/);assert.match(ten.text,/Você pediu 31\/12\/2026 a 02\/01\/2027/);assert.match(ten.text,/café da manhã está incluso/);
  assert.doesNotMatch(ten.text,/Para quantas pessoas/);
});

test('festa sem hospedagem, mesa no restaurante e vizinha não viram cotação',async()=>{
  now=Date.parse('2026-10-26T15:00:00-03:00');
  for(const msg of ['Boa noite!vcs não vendem a ceia de ano novo e o show? Tenho casa p me hospedar queria só o show e a ceia',
    'Pode participar do réveillon não estando hospedado no Solar ?'])
    assert.match((await plain(msg)).text,/sem hospedagem, com pulseira/,msg);
  const table=await plain('Pode mandar o cardápio ?','Precisa reservar ?');
  assert.match(table.text,/por ordem de chegada/);assert.doesNotMatch(table.text,/Para quantas pessoas/);
  const neighbour=await plain('Tudo perfeito, principalmente o repertório musical!','Sou vizinha de vcs. Tenho apto no Atlântico Norte!');
  assert.doesNotMatch(neighbour.text,/Para quantas pessoas/);assert.equal(neighbour.r.quote_request,'NOQUOTE');
});

test('hóspedes e conversas sem reserva: sem "Para quantas pessoas?" nem equipe por repetição (item 4)',async()=>{
  // Abençoada/Edilene: confirms a booking, replies to the check-in welcome a
  // week later and thanks for the stay after check-out.
  now=Date.parse('2026-10-16T12:47:00-03:00');
  const say=conversationAI();
  await say('Bom dia');
  const confirm=await say('Sou Edilene, gostaria de confirmar uma reserva!');
  assert.equal(confirm.r.quote_request,'HUMANO');assert.doesNotMatch(confirm.text,/Para quantas pessoas/);
  now=Date.parse('2026-10-23T19:10:00-03:00');
  const fine=await say('Tudo certo');
  assert.notEqual(fine.r.quote_request,'HUMANO');assert.match(fine.text,/Combinado!/);
  now=Date.parse('2026-10-25T16:00:00-03:00');
  const thanks=await say('Agradeço tbm a estadia, como sempre muito maravilhoso o atendimento!😉');
  assert.match(thanks.text,/Nós que agradecemos/);assert.doesNotMatch(thanks.text,/Para quantas pessoas/);
  for(const msg of ['Obrigada pela hospedagem, amamos tudo!','Chegamos bem em casa. Obrigado por tudo, voltaremos com certeza'])
    assert.match((await plain(msg)).text,/Nós que agradecemos/,msg);
  // A thank-you with a new request is not a goodbye.
  assert.doesNotMatch((await plain('Obrigada pela estadia! Qual o valor para voltar no feriado?')).text,/Nós que agradecemos/);
  // Valéria: "um casal e nossa filha de 14 anos" is 3 people with the age.
  const valeria=await rv('Somos um casal e nossa filha de 14 anos');
  assert.equal(valeria.state.facts.guests,3);assert.deepEqual(valeria.state.family_party.ages_months,[168]);
  assert.match(valeria.text,/Indicada para vocês/);
  // Ediane: "esse final d semana" is the coming weekend.
  now=Date.parse('2026-10-26T15:00:00-03:00');
  assert.equal((await plain('Tem disponibilidade p esse final d semana?','2')).r.quote_request,'QUOTE|2026-10-30|2026-11-01|2|NONE');
});
