import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';

// Real WhatsApp conversations of 14-17/11/2026 (audit), replayed through
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

const NEW=()=>JSON.stringify({version:2,history:[],facts:{extras:[]},greeted:true});
const ASK='Para quantas pessoas será a estadia e quais as datas de entrada e saída?';

test('Lista VIP pelo anúncio: link de cadastro, nunca "escreva Quero entrar na Lista VIP"',async()=>{
  now=Date.parse('2026-11-14T12:11:00-03:00');
  const vip=await conversationAI(NEW())('Quero entrar na Lista VIP Solar Sem Limites 2027 (vim pelo anúncio)','Você pode escrever “Quero entrar na Lista VIP”.');
  assert.match(vip.text,/hotelsolar\.tur\.br\/vip/);assert.doesNotMatch(vip.text,/escrev/i);
  const loop=conversationAI(NEW());
  await loop('Como funciona o Solar Sem Limites?','Quem está na Lista VIP recebe o convite para a visita guiada de 24/11.');
  assert.match((await loop('Quero entrar')).text,/hotelsolar\.tur\.br\/vip/);
  now=Date.parse('2026-11-26T10:00:00-03:00');
  assert.match((await conversationAI(NEW())('Quero entrar na lista vip','x')).text,/solarsemlimites2027/);
});

test('Réveillon: estadia antes do pacote vira pacote + diárias extras',async()=>{
  now=Date.parse('2026-11-16T15:09:00-03:00');
  const say=conversationAI(CAMPAIGN_SEED);
  await say('Quais os valores do Réveillon?');await say('Gostaria de fazer orçamento',ASK);
  await say('3 pessoas adultos, casal +meu filho de 22 anos');
  assert.equal((await say('Data 29/12 a 03/01')).r.quote_request,'QUOTE|2026-12-29|2027-01-03|3|NONE');
  const thirty=await conversationAI(CAMPAIGN_SEED)('2 adultos uma criança de 11 anos quanto custa de 30 a 2 virada de ano');
  assert.equal(thirty.r.quote_request,'QUOTE|2026-12-30|2027-01-03|3|NONE');
  const s=conversationAI(NEW());await s('3 pessoas');await s('Adultos');
  assert.equal((await s('30 a dia 01 de janeiro')).r.quote_request,'QUOTE|2026-12-30|2027-01-03|3|NONE');
  const big=conversationAI(CAMPAIGN_SEED);await big('Quais os valores do Réveillon?');await big('São 4 casais');
  assert.equal((await big('Réveillon do dia 30 de dezembro ao dia3 de Janeiro')).r.quote_request,'QUOTE|2026-12-30|2027-01-03|8|NONE');
});

test('Réveillon: "ano novo", só a noite, depois do pacote e grupo em 2 apartamentos',async()=>{
  now=Date.parse('2026-11-14T18:20:00-03:00');
  const say=conversationAI(NEW());
  await say('Olá boa tarde queria algumas informações',ASK);
  assert.match((await say('Vocês podem me dizer quanto tá a diaria para o ano novo','Pode detalhar como podemos ajudar?')).text,/Réveillon Solar 2027/);
  const three=await say('Três pessoas, duas diárias 31 dezembro a dia 2 janeiro');
  assert.equal(three.r.quote_request,'QUOTE|2026-12-31|2027-01-03|3|NONE');assert.match(three.text,/Você pediu 31\/12\/2026 a 02\/01\/2027/);
  const night=await conversationAI(NEW())('Gostaria de saber se vocês vendem pacote somente para a noite do Réveillon?');
  assert.match(night.text,/não temos pacote de uma noite só/);assert.match(night.text,/pulseira de R\$ 800/);
  const after=await conversationAI(NEW())('Valor de hospedagem de 02/01 a 06/01');
  assert.match(after.text,/A partir de 03\/01 as diárias são normais: posso calcular de 03\/01 a 06\/01/);
  const six=await conversationAI(NEW())('Bom dia!\nQual o valor para o réveillon? Para 6 adultos, sendo:\n1 apartamento para três pessoas\n1 apartamento para três pessoas');
  assert.match(six.text,/2 × Suíte Triplo/);
});

test('grupo e datas escritos de outros jeitos',async()=>{
  now=Date.parse('2026-11-14T15:08:00-03:00');
  const casal=conversationAI(NEW());await casal('Olá boa tarde','Como posso ajudar?');
  assert.match((await casal('Qual valor de um quarto para casal',ASK)).text,/^Quais são as datas de entrada e saída/);
  assert.equal((await conversationAI(NEW())('Valor da diaria dia 11 a 13 casal')).r.quote_request,'QUOTE|2026-12-11|2026-12-13|2|NONE');
  assert.equal((await conversationAI(NEW())('4 adultos para 27-28-29 de dezembro')).r.quote_request,'QUOTE|2026-12-27|2026-12-29|4|NONE');
  const ha=await conversationAI(NEW())('Qual valor do dia 26 /12 ha 02/01');
  assert.match(ha.text,/Para quantas pessoas será a estadia\?/);assert.equal(ha.state.facts.check_in,'2026-12-26');
  const teen=await conversationAI(NEW())('Boa noite ...somos 5 pessoas, 2 adultos 1 adolescentes de 17 anos, 1 criança de 10 anos e 1 de 4 anos .');
  assert.doesNotMatch(teen.text,/quantos adultos e quantas crianças/);
  const other=conversationAI(NEW());await other('So eu e outra pessoa');
  assert.equal((await other('31 ate dia 2 de Janeiro')).r.quote_request,'QUOTE|2026-12-31|2027-01-03|2|NONE');
  const pick=conversationAI(NEW());
  await pick('Olá! Estou no site do Hotel Solar e preciso tirar algumas dúvidas sobre as reservas.',ASK);
  await pick('03 pessoas período de 20 a 23 dezembro. Adolescente de 17 anos');
  assert.equal((await pick('Suíte tripla','Se desejar, posso ajudar com o resumo.')).r.quote_request,'COLETAR');
});

test('perguntas que não são cotação: datas repetidas, prato, cardápio, feriado de outro ano',async()=>{
  now=Date.parse('2026-11-14T12:00:00-03:00');
  const say=conversationAI(NEW());
  await say('Qual o valor?',ASK);await say('4 adultos');
  assert.match((await say('15/11 as 12h')).text,/preciso da data de entrada e da data de saída/);
  assert.match((await say('esse aquí serve quantas pessoas')).text,/cardápio oficial/);
  const menu=await conversationAI(NEW())('cardápio reserva olá','O cardápio do Reserva Solar oferece frutos do mar. Posso enviar o link oficial. Deseja?');
  assert.match(menu.text,/cardapio-reserva-solar\.vercel\.app/);assert.doesNotMatch(menu.text,/Deseja\?/);
  const year=conversationAI(NEW());await year('Valor do natal','x');
  assert.match((await year('Para o natal de 2027')).text,/Ainda não abrimos as vendas para o Natal de 2027/);
  const incl=await conversationAI(NEW())('O que está incluso no pacote?');
  assert.doesNotMatch(incl.text,/Dia das Crianças/);
});

test('regra interna da entrada, catamarã, golpe, currículo e Ostrabeach',async()=>{
  now=Date.parse('2026-11-16T19:31:00-03:00');
  const rule=await conversationAI(NEW())('Gostaria de saber sobre o restaurante à beira mar','O Reserva Solar abre de sexta a domingo. A entrada é gratuita como regra, e cobrança só ocorre em datas de grande movimento previamente autorizadas. Posso ajudar?');
  assert.doesNotMatch(rule.text,/previamente|autorizad|grande movimento/);assert.match(rule.text,/eventos especiais pode haver cobrança/);
  const pkg=await conversationAI(NEW())('Vc tem a programação pro réveillon');
  assert.doesNotMatch(pkg.text,/catamar/i);
  const spam=await conversationAI(NEW())('👉*AUXÍLIO RECONSTRUÇÃO 2026*\nFaça uma consulta liberada para todos até 16/11 para saber se você tem direito ao benefício no valor de *R$1.680,00* e saque de forma imediata via PIX!\n*CONSULTE AGORA*:\nhttps://golpe.example.com/x\n_Mais de 15.514.472 de pessoas receberam hoje!_','Notei sua mensagem.');
  assert.equal(spam.text,'');
  const cv=await conversationAI(NEW())('Saudações\n\nSou Gerente Geral Hoteleiro / Diretor de Operações\nProfissional sênior com ampla experiência na gestão integral de empreendimentos hoteleiros.\n\nAt.te\nFrancilio');
  assert.match(cv.text,/fazer parte da equipe/);assert.doesNotMatch(cv.text,/quantas pessoas/);
  const ostra=await conversationAI(NEW())('Sem estadia, só pro evento mesmo. Funcionaria como? É o festival da ostra');
  assert.match(ostra.text,/aberto ao público/);assert.match(ostra.text,/ingresso de acesso, de R\$ 60 por pessoa/);assert.doesNotMatch(ostra.text,/R\$ (?:40|50)\b/);assert.doesNotMatch(ostra.text,/Luiza|quantas pessoas/);
});

test('ofertas da IA aceitas, correção de reserva e foto do quarto',async()=>{
  now=Date.parse('2026-11-16T11:00:00-03:00');
  const offer=conversationAI(NEW());
  await offer('Vocês têm berço?','Temos berço, conforme disponibilidade. A equipe pode confirmar valores. Deseja que eu encaminhe essa consulta?');
  assert.equal((await offer('Sim')).r.quote_request,'HUMANO');
  const wait=conversationAI(NEW());
  await wait('Vocês têm berço?','Posso consultar a equipe para enviar a cotação atualizada dessas acomodações?');
  assert.equal((await wait('Aguardando')).r.quote_request,'HUMANO');
  const fix=conversationAI(NEW());
  await fix('Recebi o comprovante','Recebemos seu comprovante referente à reserva a partir de 22/11.');
  assert.equal((await fix('Está errada a data na mensagem eletronica acima. A reserva e a parir do dia 20 /11 e não 22/11')).r.quote_request,'HUMANO');
  const photo=conversationAI(NEW());await photo('Mande foto');
  assert.doesNotMatch((await photo('Do quarto')).text,/quantas pessoas/);
});
