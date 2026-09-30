import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';

// Replays the WhatsApp test of 29/09/2026 (Réveillon campaign) through
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

test('lista de pessoas: família, números por extenso e total conflitante',()=>{
  const read=message=>updateFamilyParty(message,undefined,start);
  let r=read('Vamos eu, minha esposa e nosso filho de 5 anos');
  assert.deepEqual([r.guests,r.party.adults,r.party.children,r.party.ages_months,r.children_pending],[3,2,1,[60],false]);
  r=read('Na verdade vamos em cinco: eu, minha esposa, minha mãe e nossos dois filhos, de 3 e 11 anos');
  assert.deepEqual([r.guests,r.party.adults,r.party.children,r.party.ages_months],[5,3,2,[36,132]]);
  r=read('eu, meu marido e nossa bebê de 8 meses');
  assert.deepEqual([r.guests,r.party.ages_months],[3,[8]]);
  r=read('Somos 5: eu, minha esposa e nosso filho de 5 anos');
  assert.equal(r.clarification,'party_composition');assert.equal(r.guests,undefined);
  r=read('eu, minha esposa e duas crianças de 4 anos');
  assert.equal(r.clarification,'child_ages');assert.equal(r.children_pending,true);
  for(const message of ['Eu, minha esposa e nossos filhos','eu, minha esposa e meu irmão','Se formos eu, minha esposa e nosso filho de 5 anos?'])
    assert.notEqual(read(message).party?.adults,2,message);
});

test('valores do pacote somam diárias com centavos e mostram totais redondos',()=>{
  const {prices:list}=packagePrices(pkg,rooms);
  assert.deepEqual(list.map(item=>[item.name,item.price]),[['LOFT',9500],['Suíte Varanda Térreo',7700],['Suíte Quádruplo',7400],
    ['Suíte Sacada Vista Mar',7100],['Suíte Triplo',6400],['Suíte Casal',5600]]);
});

test('respostas fixas do Réveillon: festa, estadia parcial, detalhes da festa e parceiros',()=>{
  const focus={id:pkg.id,name:pkg.name,start_date:pkg.start_iso_date,end_date:pkg.end_iso_date,updated_at:start};
  const kind=(message,context)=>newYearSalesReply(message,context,start)?.kind;
  assert.equal(kind('Dá pra ir só na festa da virada, sem ficar hospedado? Quanto é?'),'party_only');
  assert.equal(kind('Quanto é a pulseira?'),'party_only');
  assert.match(newYearSalesReply('Quanto é a pulseira?',undefined,start).answer,/R\$ 800 por pessoa.*Pix.*3x/s);
  assert.equal(kind('Posso ficar só de 1 a 3 de janeiro? Não quero passar a virada aí'),'partial_stay');
  assert.equal(kind('Não quero passar a virada, posso chegar dia 1?',focus),'partial_stay');
  assert.equal(kind('Na festa tem lugar marcado pra sentar?',focus),'party_detail');
  assert.equal(kind('Vocês aceitam RDC?'),'unknown_partner');
  assert.equal(unknownPartnerInquiry('vcs aceitam o rdc?'),'RDC');
  for(const message of ['Quero hospedagem de 31/12 a 04/01','A festa está inclusa no pacote?','Quero fazer festa de aniversário sem hospedagem',
    'tenho filhos de 1 a 2 anos, posso reservar no reveillon?','Aceitam PIX?','Aceita cartão?','Aceitam pets?','Criança de 7 anos paga?'])
    assert.equal(kind(message,focus),undefined,message);
  // Campaign rules end with the event.
  assert.equal(newYearSalesReply('Quanto é a pulseira?',undefined,Date.parse('2027-01-02T12:00:00-03:00')),undefined);
});

test('teste do WhatsApp 29/09: contexto do Réveillon, família, criança, parcelamento e fechamento',async()=>{
  now=start;
  const say=conversation();
  const first=await say('Boa tarde! Vi o anúncio do Réveillon Solar 2027. Quais os valores?');
  assert.match(first.text,/LOFT: \*R\$ 9\.500,00\*/);assert.doesNotMatch(first.text,/,01|,99|motor/);

  const family=await say('Vamos eu, minha esposa e nosso filho de 5 anos');
  assert.equal(family.state.facts.guests,3);assert.doesNotMatch(family.text,/Quantas pessoas/);
  assert.match(family.text,/Categoria Casal, com a criança em cortesia: \*Suíte Casal\* — R\$ 5\.600,00/);
  assert.doesNotMatch(family.text,/,01|,99/);

  const extended=await say('E se a gente ficar até o dia 4?');
  assert.equal(extended.r.quote_request,'QUOTE|2026-12-31|2027-01-04|3|NONE');
  assert.match(extended.text,/31\/12\/2026 a 04\/01\/2027 · 4 diárias/);

  const five=await say('Na verdade vamos em cinco: eu, minha esposa, minha mãe e nossos dois filhos, de 3 e 11 anos');
  assert.equal(five.r.quote_request,'QUOTE|2026-12-31|2027-01-04|5|NONE');
  assert.match(five.text,/Suíte Quádruplo/);assert.doesNotMatch(five.text,/Suíte Casal/);

  const inclusions=await say('O que vem no pacote?');
  assert.equal(inclusions.result.match_type,'package_followup');
  assert.match(inclusions.text,/Programação e itens inclusos/);assert.match(inclusions.text,/6x/);
  assert.doesNotMatch(inclusions.text,/Pacotes ativos|Natal em Salinas|Dia das Crianças/);

  const meal=await say('Vocês trabalham com meia pensão, café e jantar?');
  assert.equal(meal.state.recent_package?.id,RV27_ID);

  const partial=await say('Posso ficar só de 1 a 3 de janeiro? Não quero passar a virada aí');
  assert.equal(partial.r.quote_request,'NOQUOTE');assert.equal(partial.result.match_type,'new_year_partial_stay');
  assert.match(partial.text,/somente no pacote completo/);assert.doesNotMatch(partial.text,/R\$|🎉/);
  assert.equal(partial.state.facts.check_in,'2026-12-31');assert.equal(partial.state.facts.check_out,'2027-01-04');

  const party=await say('Dá pra ir só na festa da virada, sem ficar hospedado? Quanto é?');
  assert.equal(party.r.quote_request,'HUMANO');assert.match(party.text,/R\$ 800 por pessoa/);assert.match(party.text,/até 3x/);
  assert.doesNotMatch(party.text,/bloquead|motor/);

  const seats=await say('Na festa tem lugar marcado pra sentar?');
  assert.equal(seats.r.quote_request,'HUMANO');assert.doesNotMatch(seats.text,/Reserva Solar|ordem de chegada/);

  const partner=await say('Vocês aceitam RDC?');
  assert.equal(partner.r.quote_request,'HUMANO');assert.match(partner.text,/RDC/);assert.doesNotMatch(partner.text,/pets?/i);

  const child=await say('Criança de 7 anos paga?');
  assert.equal(child.result.match_type,'package_followup');
  assert.match(child.text,/^Com 7 anos, a criança já não entra na cortesia/);
  assert.doesNotMatch(child.text,/café avulso|R\$ ?75|datas que você informou são diferentes/);

  const installments=await say('Dá pra parcelar?');
  assert.match(installments.text,/até 6x no cartão/);assert.doesNotMatch(installments.text,/3 vezes|3x/);

  const booking=await say('Quero reservar a Suíte Quádruplo para o Réveillon');
  assert.equal(booking.r.quote_request,'COLETAR');assert.equal(booking.r.can_collect,'NAO');
  assert.match(booking.text,/Suíte Quádruplo\n31\/12\/2026 a 04\/01\/2027 · 5 hóspedes/);
  assert.match(booking.text,/Confirmar opção/);
});

test('pedido de reserva sem cotação, com o grupo desta conversa, calcula o pacote para escolher',async()=>{
  now=start+3600000;
  const say=conversation();
  await say('Oi, quanto está o pacote de reveillon?');
  await say('somos eu, meu marido e nossa filha de 2 anos');
  const booking=await say('Quero reservar a suíte casal');
  assert.equal(booking.r.quote_request,'QUOTE|2026-12-31|2027-01-03|3|NONE');
  assert.match(booking.text,/Suíte Casal \(até 2 pessoas \+ 1 criança\): \*R\$ 5\.600\*/);
  const chosen=await say('Quero a Suíte Casal');
  assert.equal(chosen.r.quote_request,'COLETAR');assert.match(chosen.text,/Suíte Casal\n31\/12\/2026 a 03\/01\/2027 · 3 hóspedes/);
});

test('outra estadia com datas depois de uma dúvida paralela não retoma o Réveillon',async()=>{
  now=start+7200000;
  const say=conversation();
  await say('Vi o anúncio do réveillon');
  const pets=await say('Vocês aceitam pet?');
  assert.equal(pets.state.recent_package?.id,RV27_ID);
  const other=await say('Quero reservar de 10/10 a 12/10 para 2 pessoas');
  assert.notEqual(other.state.package_context?.id,RV27_ID);
  assert.equal(other.r.quote_request,'QUOTE|2026-10-10|2026-10-12|2|NONE');
  const resumed=await say('Dá pra parcelar em quantas vezes?');
  assert.doesNotMatch(resumed.text||'',/Réveillon/);
});

// ManyChat seeds this state for leads tagged "RV27 IA" on their first AI turn.
const CAMPAIGN_SEED=JSON.stringify({version:2,history:[],facts:{extras:[]},greeted:false,campaign:'RV27'});

test('lead da campanha responde à boas-vindas com o grupo e recebe os valores do Réveillon',async()=>{
  now=start+3*3600000;
  const say=conversation(CAMPAIGN_SEED);
  const family=await say('2 adultos e 1 criança de 5 anos');
  assert.equal(family.result.match_type,'package_followup');
  assert.match(family.text,/Réveillon Solar 2027/);assert.match(family.text,/Suíte Casal\* — R\$ 5\.600,00/);
  assert.doesNotMatch(family.text,/datas de entrada e saída/);
  assert.equal(family.state.campaign,'RV27');
  const booking=await say('Quero reservar a suíte casal');
  assert.equal(booking.r.quote_request,'QUOTE|2026-12-31|2027-01-03|3|NONE');
  const couple=await conversation(CAMPAIGN_SEED)('Um casal');
  assert.match(couple.text,/Réveillon Solar 2027/);assert.match(couple.text,/2 hóspedes/);
  const how=await conversation(CAMPAIGN_SEED)('Como faço para reservar?');
  assert.match(how.text,/quantos adultos e crianças/);assert.match(how.text,new RegExp('pacote='+RV27_ID));
});

test('campanha não força o Réveillon em outra viagem, fora do período ou sem a marca',async()=>{
  now=start+4*3600000;
  const other=await conversation(CAMPAIGN_SEED)('Quero um quarto para 2 adultos no feriado de outubro');
  assert.notEqual(other.state.package_context?.id,RV27_ID);
  const dated=await conversation(CAMPAIGN_SEED)('Quero hospedagem de 10/10 a 12/10 para 2 adultos');
  assert.equal(dated.r.quote_request,'QUOTE|2026-10-10|2026-10-12|2|NONE');
  const plain=await conversation()('2 adultos e 1 criança de 5 anos');
  assert.doesNotMatch(plain.text||'',/Réveillon/);
  now=Date.parse('2027-01-02T10:00:00-03:00');
  const ended=await conversation(CAMPAIGN_SEED)('2 adultos');
  assert.equal(ended.state.package_context,undefined);
  now=start;
});
