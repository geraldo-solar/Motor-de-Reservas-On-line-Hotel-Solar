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
  // Audit of 05/10/2026: starting prices by group size, not the full table.
  assert.match(first.text,/Até 2 pessoas: a partir de R\$ 5\.600,00\n• 3 pessoas: a partir de R\$ 6\.400,00\n• 4 pessoas: a partir de R\$ 7\.400,00/);
  assert.match(first.text,/Em até 6x no cartão ou à vista com 10% de desconto/);
  assert.doesNotMatch(first.text,/,01|,99|motor|LOFT/);

  const family=await say('Vamos eu, minha esposa e nosso filho de 5 anos');
  assert.equal(family.state.facts.guests,3);assert.doesNotMatch(family.text,/Quantas pessoas/);
  assert.match(family.text,/Indicada para vocês: Suíte Casal\* — \*R\$ 5\.600,00\*, com a criança em cortesia/);
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

  // Owner, 30/09: unconfirmed details are answered as such and the AI keeps
  // the conversation; the customer may still ask for the team.
  const seats=await say('Na festa tem lugar marcado pra sentar?');
  assert.equal(seats.r.quote_request,'NOQUOTE');assert.doesNotMatch(seats.text,/Reserva Solar/);
  assert.match(seats.text,/não há lugar marcado: os lugares são por ordem de chegada/);

  const partner=await say('Vocês aceitam RDC?');
  assert.equal(partner.r.quote_request,'NOQUOTE');assert.match(partner.text,/RDC/);assert.doesNotMatch(partner.text,/pets?/i);
  assert.match(partner.text,/somente pelo canal de atendimento da própria RDC/);

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
  assert.match(booking.text,/Ótimo! \*Suíte Casal\*\n.*3 hóspedes\n💰 \*R\$ 5\.600,00\*/);
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
  assert.match(family.text,/Réveillon Solar 2027/);assert.match(family.text,/Suíte Casal\* — \*R\$ 5\.600,00\*/);
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

// Real WhatsApp leads of 30/09/2026 (first day with the AI on the campaign).
test('leads de 30/09: diária comum, estadia parcial com grupo e primeira resposta com pergunta',async()=>{
  now=Date.parse('2026-09-30T13:00:00-03:00');
  const first=await conversation(CAMPAIGN_SEED)('Quais os valores do Réveillon?');
  assert.match(first.text,/Quantas pessoas vão\? Me diga quantos adultos e a idade das crianças/);
  assert.doesNotMatch(first.text,/Se desejar prosseguir|aproveitando o que/);

  // "casal" tags the lead in ManyChat, but the ordinary rate is not the package.
  const daily=await conversation(CAMPAIGN_SEED)('Qual o valor da diária para casal');
  assert.notEqual(daily.state.topic,'package_info');assert.equal(daily.state.package_context,undefined);
  assert.doesNotMatch(daily.text,/Réveillon|R\$ 5\.600/);

  const partial=await conversation(CAMPAIGN_SEED)('Boa tarde, gostaria de saber se possui disponibilidade para os dias 31/12 a 01/01 para 5 pessoas');
  assert.equal(partial.r.quote_request,'QUOTE|2026-12-31|2027-01-03|5|NONE');
  assert.match(partial.text,/Você pediu 31\/12\/2026 a 01\/01\/2027, mas no Réveillon a hospedagem é vendida somente no pacote completo/);
  assert.match(partial.text,/31\/12\/2026 a 03\/01\/2027 · 3 diárias · 5 hóspedes/);
  assert.doesNotMatch(partial.text,/motor|noites obrigatórias/);

  const say=conversation(CAMPAIGN_SEED);
  await say('Quais os valores do Réveillon?');
  const child=await say('31/12 a 01/01 para 2 adultos e 1 criança');
  assert.match(child.text,/Você pediu 31\/12\/2026 a 01\/01\/2027.*idades das crianças/s);
  assert.equal(child.state.facts.check_out,'2027-01-03');
  const age=await say('5 anos');
  assert.match(age.text,/Indicada para vocês: Suíte Casal\* — \*R\$ 5\.600,00\*, com a criança em cortesia/);
  assert.doesNotMatch(age.text,/datas que você informou são diferentes/);

  // "Poderia verificar as 3 diárias" confirms the quoted period; the option is
  // then chosen by its quoted total.
  const joyce=conversation(CAMPAIGN_SEED);
  await joyce('Boa tarde, gostaria de saber se possui disponibilidade para os dias 31/12 a 01/01 para 5 pessoas');
  const nights=await joyce('Poderia verificar as 3 diarias');
  assert.equal(nights.state.facts.check_out,'2027-01-03');assert.doesNotMatch(nights.text,/datas de entrada e saída/);
  const chosen=await joyce('Quero a opção de 12.000');
  assert.equal(chosen.r.quote_request,'COLETAR');assert.match(chosen.text,/Confira sua escolha/);
  assert.match(chosen.text,/garanta direto pelo site.*\?pacote=0267abd7-ba19-4492-8894-aea827edea33&utm_source=whatsapp/s);
  assert.ok(chosen.text.length<=1000);

  // After a quote, a bare category or a quoted total is the choice itself.
  for(const pick of ['Suíte Casal','a de 5.600','a mais barata']){
    const say2=conversation(CAMPAIGN_SEED);
    await say2('Quais os valores do Réveillon?');await say2('2 adultos e 1 criança de 5 anos');await say2('Quero a suíte casal');
    const picked=await say2(pick);
    assert.equal(picked.r.quote_request,'COLETAR',pick);assert.match(picked.text,/Suíte Casal\n31\/12\/2026 a 03\/01\/2027/,pick);
  }

  // Party details confirmed by the owner on 30/09; dress code is not.
  const hours=await say('Que horas começa a festa da virada e onde vai ser?');
  assert.equal(hours.r.quote_request,'NOQUOTE');
  assert.match(hours.text,/das 21h às 2h.*pérgola da piscina do hotel/s);
  const minAge=await say('Tem idade mínima pra festa?');
  assert.match(minAge.text,/não há idade mínima/);
  const dress=await say('Qual o traje da festa?');
  assert.match(dress.text,/ainda não está confirmado/);assert.equal(dress.r.quote_request,'NOQUOTE');

  // Declining the party night itself still gets the rule, not a quote.
  const decline=await say('Posso ficar só de 1 a 3 de janeiro? Não quero passar a virada aí');
  assert.equal(decline.r.quote_request,'NOQUOTE');assert.match(decline.text,/somente no pacote completo/);
  assert.doesNotMatch(decline.text,/Para quantas pessoas/);
  now=start;
});

// Real WhatsApp leads of 01/10/2026: year typed for the exit, an offer the
// team made out of the AI's sight, payment conditions and price reactions.
test('leads de 01/10: ano trocado, valor da equipe, 6x e 10% à vista, susto com o preço',async()=>{
  now=Date.parse('2026-09-30T21:30:00-03:00');
  const say=conversation(CAMPAIGN_SEED);
  const first=await say('3 adultos e uma criança de 8 meses. Periodo de 31 a 04/01');
  assert.equal(first.r.quote_request,'QUOTE|2026-12-31|2027-01-04|4|NONE');
  const typo=await conversation(CAMPAIGN_SEED)('Entrada 31/12 a 04/01/2026 para 2 adultos');
  assert.equal(typo.r.quote_request,'QUOTE|2026-12-31|2027-01-04|2|NONE');
  await say('Ficou em 8.210,00?');
  const accepted=await say('Aceito');
  assert.equal(accepted.r.quote_request,'COLETAR');assert.match(accepted.text,/Suíte Quádruplo\n31\/12\/2026 a 04\/01\/2027/);

  // No AI quote: accepting a value quoted by the team goes to the team.
  const team=conversation(CAMPAIGN_SEED);
  await team('Ficou em 8.210,00?');
  const teamAccept=await team('Aceito');
  assert.equal(teamAccept.r.quote_request,'HUMANO');assert.match(teamAccept.text,/equipe para confirmar esse valor/);
  assert.doesNotMatch(teamAccept.text,/não corresponde|inválid/);

  now=Date.parse('2026-10-01T11:46:00-03:00');
  const pay=conversation(CAMPAIGN_SEED);
  const cash=await pay('Pagamento a vista nao consigo nem 10%?');
  assert.equal(cash.r.quote_request,'NOQUOTE');assert.match(cash.text,/até 6x no cartão ou à vista com 10% de desconto/);
  assert.doesNotMatch(cash.text,/3x|3 vezes/);
  const intent=await pay('quero pagar à vista');
  assert.equal(intent.r.quote_request,'HUMANO');assert.match(intent.text,/10% de desconto/);
  const view=await conversation(CAMPAIGN_SEED)('A vista é para o mar?');
  assert.notEqual(view.result?.match_type,'new_year_payment');

  const shock=conversation(CAMPAIGN_SEED);
  await shock('Quais os valores do Réveillon?');await shock('2 adultos');
  const objection=await shock('Por este valor irei ao Chile e Argentina');
  assert.equal(objection.result.match_type,'new_year_price_objection');
  assert.match(objection.text,/mais em conta para 2 pessoas é a Suíte Casal: R\$ 5\.600,00 pelas 3 noites/);
  assert.match(objection.text,/6x de R\$ 933,33.*à vista com 10% de desconto: R\$ 5\.040,00/s);
  now=start;
});

// Audit of the real leads of 02/10/2026: the group card ended without a next
// step, a month-less "dia 22" became December, and stated ages were asked again.
test('leads de 02/10: cartão por grupo fecha a venda, dia sem mês não vira Réveillon, idades e idosos',async()=>{
  now=Date.parse('2026-10-02T12:30:00-03:00');
  const say=conversation(CAMPAIGN_SEED);
  await say('Quais os valores do Réveillon?');
  const card=await say('2 adultos');
  assert.match(card.text,/3 noites · 2 hóspedes/);
  assert.match(card.text,/Indicada para vocês: Suíte Casal\* — \*R\$ 5\.600,00\*\n💳 Em até 6x de R\$ 933,33 no cartão ou R\$ 5\.040,00 à vista \(10% de desconto\)/);
  assert.match(card.text,/Outras opções para o seu grupo:\n• Suíte Triplo — R\$ 6\.400,00/);
  assert.match(card.text,/Valores por apartamento \(não por pessoa\)/);
  assert.match(card.text,new RegExp('pacote='+RV27_ID+'&utm_source=whatsapp'));
  assert.match(card.text,/Prefere a Suíte Casal ou outra opção\?/);
  assert.doesNotMatch(card.text,/premium|maior valor cadastrado|Outra opção:|capacidade de/);

  // "Sim" takes the indicated option; a second "sim" opens the confirmation card.
  const yes=await say('Sim');
  assert.equal(yes.r.quote_request,'QUOTE|2026-12-31|2027-01-03|2|NONE');
  assert.match(yes.text,/^Ótimo! \*Suíte Casal\*\n📅 31\/12\/2026 a 03\/01\/2027 · 3 diárias · 2 hóspedes\n💰 \*R\$ 5\.600,00\* — em até 6x de R\$ 933,33 no cartão ou R\$ 5\.040,00 à vista/);
  const confirm=await say('sim');
  assert.equal(confirm.r.quote_request,'COLETAR');assert.match(confirm.text,/Suíte Casal\n31\/12\/2026 a 03\/01\/2027 · 2 hóspedes/);

  for(const [reply,room] of [['A sacada','Suíte Sacada Vista Mar'],['a de 7.100','Suíte Sacada Vista Mar'],['Pode ser','Suíte Casal'],['Quero o loft','LOFT']]){
    const pick=conversation(CAMPAIGN_SEED);
    await pick('Quais os valores do Réveillon?');await pick('2 adultos');
    const chosen=await pick(reply);
    assert.match(chosen.r.quote_request,/^QUOTE\|2026-12-31\|2027-01-03\|2\|/,reply);
    assert.match(chosen.text,new RegExp('^Ótimo! \\*'+room+'\\*'),reply);
  }
  for(const reply of ['Vou pensar','Ok','Quanto fica o loft?','Só queremos curtir a noite do Ano Novo. Temos casa em Salinas. Só um casal']){
    const other=conversation(CAMPAIGN_SEED);
    await other('Quais os valores do Réveillon?');await other('2 adultos');
    const answer=await other(reply);
    assert.equal(answer.state.package_choice,undefined,reply);assert.doesNotMatch(String(answer.text),/^Ótimo!/,reply);
  }

  // "Entrada dia 22 / Saída dia 23" asked for an ordinary rate: the next 22–23.
  const daily=conversation(CAMPAIGN_SEED);
  await daily('Gostaria de saber o valor da diária para um casal');
  const days=await daily('Entrada dia 22\nSaída dia 23');
  assert.equal(days.r.quote_request,'QUOTE|2026-10-22|2026-10-23|2|NONE');
  assert.doesNotMatch(days.text,/Réveillon|motor|pode pedir o cálculo/);
  assert.equal(days.state.package_context,undefined);
  const crossing=await conversation(CAMPAIGN_SEED)('Do dia 31 ao dia 3 para 2 adultos');
  assert.doesNotMatch(crossing.r.quote_request,/2026-10-31|2026-11-03/);

  // Ages already given are not asked again; "dois idosos" are two adults.
  const ages=conversation(CAMPAIGN_SEED);
  await ages('Quais os valores do Réveillon?');
  const seven=await ages('Seriam 5 adultos e 2 crianças de 12 anos');
  assert.equal(seven.state.facts.guests,7);assert.equal(seven.state.facts.children_pending,false);
  assert.doesNotMatch(seven.text,/idades das crianças/);
  const elderly=conversation(CAMPAIGN_SEED);
  await elderly('Quais os valores do Réveillon?');
  const couple=await elderly('Dois idosos .Casal');
  assert.equal(couple.state.facts.guests,2);assert.match(couple.text,/Indicada para vocês: Suíte Casal/);
  // Lead of 03/10: "2 adultos e 1 adolescente" is three people, not a couple.
  const teen=await conversation(CAMPAIGN_SEED)('2 adultos e 1 adolescente');
  assert.equal(teen.state.facts.guests,3);assert.match(teen.text,/3 noites · 3 hóspedes/);
  assert.match(teen.text,/Indicada para vocês: Suíte Triplo/);assert.doesNotMatch(teen.text,/Indicada para vocês: Suíte Casal/);
  now=start;
});

// Audit of 02/10/2026, item 5: hesitation and price comparisons get a
// concrete offer; "ok"/emojis/"nenhuma" get one short closing; the
// customer's own away message and acks after a goodbye get nothing.
test('itens 5 da auditoria: indecisão, comparação, ok/emoji/nenhuma e mensagem automática',async()=>{
  now=Date.parse('2026-10-02T15:00:00-03:00');
  const say=conversation(CAMPAIGN_SEED);
  await say('Quais os valores do Réveillon?');await say('2 adultos');
  const think=await say('Vou pensar');
  assert.equal(think.result.match_type,'new_year_hesitation');
  assert.match(think.text,/^Claro, fiquem à vontade! 😊 Para ajudar na decisão: a opção mais em conta para 2 pessoas é a Suíte Casal, R\$ 5\.600,00 pelas 3 noites/);
  assert.match(think.text,/em até 6x de R\$ 933,33 no cartão ou R\$ 5\.040,00 à vista\. É o nosso evento mais procurado do ano\./);
  assert.match(think.text,new RegExp('Quando decidirem, é só me chamar aqui ou garantir direto pelo site: https://reservas\\.hotelsolar\\.tur\\.br/\\?pacote='+RV27_ID));
  const ok=await say('Ok');
  assert.equal(ok.result.quote_request,'ROOM_DONE');assert.equal(ok.text,'');
  const emoji=await say('🤝👍');
  assert.equal(emoji.result.quote_request,'ROOM_DONE');
  const again=await say('Vou falar com meu esposo e retorno');
  assert.equal(again.text,'Combinado! 😊 Se surgir qualquer dúvida, é só me chamar por aqui.');

  const trip=conversation(CAMPAIGN_SEED);
  await trip('Quais os valores do Réveillon?');await trip('Casal');
  const fortaleza=await trip('Prefiro ir pra fortaleza que está 1200 com hospedagem e passagem');
  assert.equal(fortaleza.result.match_type,'new_year_price_objection');
  assert.match(fortaleza.text,/mais em conta para 2 pessoas é a Suíte Casal: R\$ 5\.600,00/);

  const none=conversation(CAMPAIGN_SEED);
  await none('Quais os valores do Réveillon?');
  const nenhuma=await none('Nenhuma');
  assert.equal(nenhuma.text,'Combinado! 😊 Se surgir qualquer dúvida, é só me chamar por aqui.');
  const thanks=conversation(CAMPAIGN_SEED);
  await thanks('Quais os valores do Réveillon?');await thanks('Nenhuma');
  const obrigado=await thanks('Obrigado');
  assert.equal(obrigado.result.quote_request,'ROOM_DONE');
  const firstThanks=await conversation()('Obrigada!');
  assert.match(firstThanks.text,/Por nada! 😊/);

  // An "ok" that may answer the question in the last lines is left to the AI.
  const pending=conversation(CAMPAIGN_SEED);
  await pending('Quais os valores do Réveillon?');
  const okQuestion=await pending('Ok');
  assert.notEqual(okQuestion.result?.match_type,'closing');assert.notEqual(okQuestion.result?.quote_request,'ROOM_DONE');

  for(const away of ['Agradecemos sua mensagem. Não estamos disponíveis no momento, mas responderemos assim que possível.',
    'Olá! Esta é uma mensagem automática. Em breve um atendente vai te responder.']){
    const bot=conversation(CAMPAIGN_SEED);
    await bot('Quais os valores do Réveillon?');
    const reply=await bot(away);
    assert.equal(reply.r.quote_request,'NOQUOTE',away);assert.equal(reply.result.quote_request,'ROOM_DONE',away);
    assert.doesNotMatch(String(reply.text),/Pacotes ativos|Réveillon/,away);
  }

  // "Estamos vendo para 4 pessoas" declares the group; "ok" confirms a picked option.
  const group=conversation(CAMPAIGN_SEED);
  await group('Quais os valores do Réveillon?');
  const four=await group('Estamos vendo para 4 pessoas');
  assert.equal(four.state.facts.guests,4);assert.notEqual(four.result?.match_type,'new_year_hesitation');
  const pick=conversation(CAMPAIGN_SEED);
  await pick('Quais os valores do Réveillon?');await pick('2 adultos');await pick('Sim');
  const confirm=await pick('ok');
  assert.equal(confirm.r.quote_request,'COLETAR');
  now=start;
});

// Audit of 05/10/2026 (97 conversations): informal groups, 5+ people, first
// answer, room capacity, a dry "não", other packages' payment and loops.
test('auditoria 05/10: grupo informal, combinação para 5+, primeira resposta, capacidade, recusa e pergunta repetida',async()=>{
  now=Date.parse('2026-10-05T12:00:00-03:00');
  const read=message=>updateFamilyParty(message,undefined,now);
  for(const [message,guests,ages] of [['Seria o casal',2,[]],['Pra casal',2,[]],['Casal adulto, menina de 18, menina de 14',4,[216,168]],
    ['Casal e crianças, de 15 e 12 anos.',4,[180,144]],['2 adultos Adolescente d 14 anos Criança d 9 anos',4,[168,108]],
    ['São uma moça de 14 anos um rapaz de 8 anos e 2 adultos',4,[168,96]],['3 adultos e 2 crianças 6 anos e 8 anod',5,[72,96]],
    ['Casal e duas criancas de 3a e 6a',4,[36,72]],['Era só pra mim, sou sozinha',1,[]],['eu, meu marido e nossa bebê de 8 meses',3,[8]],
    ['quantos adultos:07 e quantas crianças vão? 07 crianças entre 07 a 12 anos',14,Array(7).fill(84)]]){
    const r=read(message);
    assert.equal(r.guests,guests,message);assert.deepEqual(r.party.ages_months,ages,message);assert.equal(r.children_pending,false,message);
  }
  for(const message of ['Prefiro o casal','Quero a suíte casal','Criança de 7 anos paga?','2 crianças de 8 e 10 anos'])
    assert.notEqual(read(message).guests,2,message);
  assert.deepEqual(read('2 adultos e 2 crianças de 8 e 10 anos').party.ages_months,[96,120]);

  // First answer: starting prices by size, and a group stated with the question gets its card.
  const couple=conversation(CAMPAIGN_SEED);
  const first=await couple('Quais os valores do Réveillon?');
  assert.match(first.text,/Pacote completo, por apartamento/);assert.doesNotMatch(first.text,/LOFT|Programação/);
  const two=await couple('Seria o casal');
  assert.match(two.text,/Indicada para vocês: Suíte Casal\* — \*R\$ 5\.600,00\*/);
  const solo=conversation(CAMPAIGN_SEED);await solo('Quais os valores do Réveillon?');
  assert.match((await solo('Era só pra mim, sou sozinha')).text,/Indicada para você: Suíte Casal/);
  const four=await conversation(CAMPAIGN_SEED)('Ola qual valor do reveillon para 4 pessoas ?');
  assert.equal(four.result.quote_request,'ROOM_LIST');assert.match(four.text,/Indicada para vocês: Suíte Quádruplo\* — \*R\$ 7\.400,00\*/);
  const programme=await conversation(CAMPAIGN_SEED)('Qual a programação para Reveion e valor para este evento?');
  assert.match(programme.text,/Programação e itens inclusos/);

  // 5+ people: the cheapest combination and the team right away, once.
  const five=await conversation(CAMPAIGN_SEED)('Qto o Réveillon pra 05 pessoas , incluindo idosa de 87 anos?');
  assert.equal(five.result.quote_request,'HUMANO');
  assert.match(five.text,/⭐ \*Suíte Casal \+ Suíte Triplo\* — \*R\$ 12\.000,00\*/);
  assert.match(five.text,/Se uma das 5 pessoas for criança de até 6 anos.*R\$ 7\.400,00/);
  const family=conversation(CAMPAIGN_SEED);await family('Quais os valores do Réveillon?');
  const split=await family('4 adulto e 01 criança de 8anos');
  assert.equal(split.result.quote_request,'HUMANO');assert.match(split.text,/Suíte Casal \+ Suíte Triplo/);
  assert.doesNotMatch(split.text,/Posso chamar|Se uma das 5/);
  const loft=await family('O loft dá para todos nós?');
  assert.notEqual(loft.result.quote_request,'HUMANO');assert.doesNotMatch(loft.text,/combinação mais em conta/);
  const ad=await conversation(CAMPAIGN_SEED)('Anúncio do Instagram Mostrar detalhes Olá! 👋 Que bom que você quer virar o ano com a gente no Hotel Solar. Para eu te mandar os valores certinhos, me conta: quantos adultos:07 e quantas crianças vão (com a idade das crianças)? 07 crianças entre 07 a 12 anos');
  assert.equal(ad.state.facts.guests,14);assert.equal(ad.result.quote_request,'HUMANO');
  assert.match(ad.text,/4 apartamentos.*R\$ 27\.600,00/s);

  // Capacity of a named category; a dry "não" after an offer.
  const capacity=conversation(CAMPAIGN_SEED);await capacity('Quais os valores do Réveillon?');
  const loftCapacity=await capacity('O loft da quantas pessoas');
  assert.match(loftCapacity.text,/^O LOFT acomoda até 4 pessoas.*R\$ 9\.500/s);assert.doesNotMatch(loftCapacity.text,/Nenhum item|Cada categoria admite/);
  const no=conversation(CAMPAIGN_SEED);await no('Quais os valores do Réveillon?');
  const dry=await no('Não!');
  assert.equal(dry.result.match_type,'offer_declined');assert.doesNotMatch(dry.text,/🎉|R\$/);
  const card=conversation(CAMPAIGN_SEED);await card('Para 02 pessoas');
  assert.match((await card('Não precisa')).text,/^Tudo bem! 😊 Se mudar de ideia/);

  // Another package's payment: conditions, and a deposit goes to the team.
  const christmas=conversation();
  await christmas('Quero o pacote do Natal');
  const pay=await christmas('Como posso fazer o pagamento do pacote Natal Luz?');
  assert.match(pay.text,/em até 3x/);assert.doesNotMatch(pay.text,/🎉/);
  const deposit=await christmas('Posso dar uma parte para reservar e pagar o restante no dia da hospedagem?');
  assert.equal(deposit.result.quote_request,'HUMANO');assert.match(deposit.text,/combinado com a nossa equipe/);

  // The same group question twice: the team takes over instead of a loop.
  const loop=conversation(CAMPAIGN_SEED);
  await loop('Quero reservar o Réveillon');
  const asked=await loop('Quero reservar sim');assert.match(asked.text,/Quantas pessoas vão se hospedar/);
  const again=await loop('reservar');
  assert.equal(again.result.quote_request,'HUMANO');assert.match(again.text,/vou chamar nossa equipe/);
  // A partial answer is progress, not a loop.
  const ages=conversation(CAMPAIGN_SEED);await ages('Quais os valores do Réveillon?');
  await ages('2 adultos e 2 crianças');
  assert.notEqual((await ages('uma tem 3 anos')).result.quote_request,'HUMANO');
  now=start;
});

test('auditoria 05/10: promessa da IA de falar com a equipe vira encaminhamento real',async()=>{
  now=Date.parse('2026-10-05T12:00:00-03:00');
  const say=async(message,state,ai)=>{now+=60000;
    const p=control({operation:'prepare',user_message:message,state},now);
    const r=control({operation:'route',user_message:message,state:p.state,proposed:p.quote_request,ai_response:ai},now);
    return {r,result:r.quote_request==='NOQUOTE'?await request(resolver,{user_message:message,state:r.state}):undefined};};
  let turn=await say('Gostaria de saber os valores da reserva',undefined,'Para quantas pessoas será a estadia?');
  turn=await say('4 pessoas',turn.result.state,'Quais são as datas de entrada e saída?');
  const promise=await say('Sim',turn.result.state,'Por favor, aguarde um momento enquanto confirmo as informações com a equipe.');
  assert.equal(promise.result.quote_request,'HUMANO');
  const vendor=await say('Encaminhe o catálogo para o setor de compras',undefined,'Encaminharei seu pedido para o setor de compras.');
  assert.equal(vendor.result.quote_request,'HUMANO');
  const plain=await say('Qual o horário do café?',undefined,'O café da manhã é servido das 7h às 10h.');
  assert.equal(plain.result.quote_request,'ROOM_LIST');
  now=start;
});

// Audit of 05/10/2026, item 5: date formats, "final de ano", the restaurants
// and the regular rates when the price is asked again without data.
test('auditoria 05/10 item 5: datas informais, final de ano, Solar 73 e tabela de diárias',async()=>{
  now=Date.parse('2026-10-05T12:00:00-03:00'); // Monday
  const quote=async(message,seed)=>(await conversation(seed)(message)).r.quote_request;
  assert.equal(await quote('Quero reservar de 10.10 a 12.10 para 2 pessoas'),'QUOTE|2026-10-10|2026-10-12|2|NONE');
  assert.equal(await quote('Para 3 pessoas de 31.12 a 03.01'),'QUOTE|2026-12-31|2027-01-03|3|NONE');
  assert.equal(await quote('Qual o valor para duas pessoas de hoje a domingo?'),'QUOTE|2026-10-05|2026-10-11|2|NONE');
  assert.equal(await quote('Entrada 10/10 saída 12 para 2 pessoas'),'QUOTE|2026-10-10|2026-10-12|2|NONE');
  assert.equal(await quote('Quero hospedagem de 31/12 a 03 para 2 pessoas'),'QUOTE|2026-12-31|2027-01-03|2|NONE');
  const denise=conversation();
  await denise('Gostaria de saber os valores da reserva');await denise('4 pessoas');
  assert.equal((await denise('Novembro entrada 05/11saida 06')).r.quote_request,'QUOTE|2026-11-05|2026-11-06|4|NONE');
  // Not dates: a time, a price, a group size.
  for(const message of ['Quero reservar para 2 pessoas, chego às 10.30 do dia 20/10','Valor 5.600 para 2 pessoas no dia 20/10','Quero hospedagem 05/11 a 06 pessoas']){
    const r=await conversation()(message);
    assert.equal(r.state.facts.check_out,undefined,message);assert.doesNotMatch(r.r.quote_request,/^QUOTE/,message);
  }
  // A recommendation request with the whole stay is quoted, not asked again.
  assert.equal(await quote('Faz um orçamento melhor pra mim… Somos uma família de 4 pessoas Todos adultos Entrada 15 de outubro Saída 18 de outubro'),
    'QUOTE|2026-10-15|2026-10-18|4|NONE');

  // "Final de ano" of a campaign lead is the Réveillon; for others, the December list.
  const lead=await conversation(CAMPAIGN_SEED)('Qual valor do pacote de final de ano?');
  assert.equal(lead.result.quote_request,`PACKAGE_ID|${RV27_ID}`);assert.match(lead.text,/Réveillon Solar 2027/);
  assert.equal((await conversation()('Qual valor do pacote de final de ano?')).result.match_type,'list');
  const group=conversation(CAMPAIGN_SEED);
  await group('Seria para 3 pessoas');
  const endOfYear=await group('DO final de ano');
  assert.equal(endOfYear.state.package_context?.id,RV27_ID);assert.match(endOfYear.text,/Indicada para vocês: Suíte Triplo/);

  // Both restaurants, with today's regular hours.
  const restaurant=await conversation()('O restaurante está funcionando hoje ?');
  assert.equal(restaurant.result.match_type,'restaurant_hours');
  assert.match(restaurant.text,/Solar 73 funciona das 11h às 23h/);assert.match(restaurant.text,/Hoje é segunda-feira.*Solar 73 abre.*Reserva Solar não abre/s);

  // Price asked again without the group: the regular rates once, then the team.
  const say=async(message,state,ai)=>{now+=60000;
    const p=control({operation:'prepare',user_message:message,state},now);
    const r=control({operation:'route',user_message:message,state:p.state,proposed:p.quote_request,ai_response:ai},now);
    const result=await request(resolver,{user_message:message,state:r.state});return {result,state:result.state||r.state};};
  let turn=await say('Boa tarde quanto ficaria a estadia',undefined,'Para informar o valor da estadia, preciso saber para quantas pessoas será a hospedagem e as datas.');
  turn=await say('Estadia desses dias?',turn.state,'Para quantas pessoas será a estadia?');
  assert.equal(turn.result.match_type,'regular_price_table');assert.equal(turn.result.quote_request,'ROOM_LIST');
  assert.match(turn.result.conversation_text,/^Valores das diárias fora de férias e feriados/);
  assert.match(turn.result.conversation_text,/Sexta e sábado:\*\n• Suíte Casal \(até 2 pessoas\): R\$ 610\n/);
  assert.match(turn.result.conversation_text,/Domingo a quinta:\*\n• Suíte Casal: R\$ 410\n/);
  turn=await say('Da estadia',turn.state,'Para quantas pessoas será a estadia?');
  assert.notEqual(turn.result.match_type,'regular_price_table');
  const answered=await say('2 pessoas',undefined,'Para quantas pessoas será a estadia?');
  assert.notEqual(answered.result.match_type,'regular_price_table');
  now=start;
});
