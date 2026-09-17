import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {build} from 'esbuild';

let now=Date.parse('2026-09-13T09:00:00-03:00');
const realNow=Date.now;Date.now=()=>now;after(()=>{Date.now=realNow;});
const b=await build({stdin:{contents:`export {control,handleConversation} from './api/conversation-control.ts';export {default as resolver} from './api/resolve-package.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'no-provider',setup(builder){builder.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'blocked',namespace:'blocked'}));builder.onLoad({filter:/.*/,namespace:'blocked'},()=>({contents:'export function createClient(){throw Error("Unexpected provider access")}'}));}}]});
const {control,handleConversation,resolver}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const facts={extras:[],guests:2,check_in:'2026-10-10',check_out:'2026-10-12'};
const empty=()=>({version:2,history:[],facts,greeted:true});
function turn(message,state=empty(),model='Informação factual simulada, sem ações executadas.'){
  const p=control({operation:'prepare',user_message:message,state},now);
  const r=control({operation:'route',user_message:message,state:p.state,proposed:'QUOTE|2026-09-18|2026-09-20|3|NONE',ai_response:model},now);
  return {p,r,state:JSON.parse(r.state)};
}
async function resolve(message,state){let result;await resolver({method:'POST',body:{user_message:message,state},query:{}},{status(code){assert.equal(code,200);return this;},json(value){result=value;return value;}});return result;}

test('W08 literal: quinta/sexta e uma criança de12anos continuam café, atéàlacarte',async()=>{
  now=Date.parse('2026-09-09T08:53:00-03:00');let state=empty(),last;
  for(const message of ['Bom dia! Qual o valor do café da manhã avulso?','Quinta e sexta','Um adulto e uma criança de 12 anos','Sendo a lá carte, quem não está hospedado pode?']){
    last=turn(message,state);state=last.state;
    assert.equal(state.guest_inquiry.kind,'dining',message);assert.deepEqual(state.facts,facts,message);
    assert.equal(state.family_party,undefined);assert.equal(last.r.quote_request,'NOQUOTE',message);
    now+=60000;
  }
  assert.match(last.r.resolved_message,/Café da manhã avulso/);
  for(const fragment of [/R\$35/,/R\$75/,/Até 6 anos há cortesia/,/agendar previamente/,/inclusive.*la carte/])assert.match(last.r.answer,fragment);
  const result=await resolve('Sendo a lá carte, quem não está hospedado pode?',last.r.state);
  assert.equal(result.quote_request,'ROOM_LIST');assert.match(result.conversation_text,/R\$35/);
  assert.doesNotMatch(result.conversation_text,/quantas pessoas|agendamento confirmado|hospedagem por/i);
});

test('W09 literal: pergunta de entrada usa somente referência recente ao Reserva Solar',async()=>{
  now=Date.parse('2026-09-11T12:15:00-03:00');
  const first=turn('O restaurante Reserva Solar é necessário reserva para não hóspedes ?');
  const last=turn('Entrada é gratuita ou paga ?',first.state,'A entrada custa R$40 e vou reservar sua hospedagem.');
  assert.equal(last.state.guest_inquiry.kind,'dining');assert.deepEqual(last.state.facts,facts);
  assert.equal(last.r.quote_request,'NOQUOTE');assert.match(last.r.answer,/gratuita como regra/);assert.doesNotMatch(last.r.answer,/R\$40/);
  const result=await resolve('Entrada é gratuita ou paga ?',last.r.state);
  assert.match(result.conversation_text,/gratuita como regra/);assert.equal(result.quote_request,'ROOM_LIST');
});

test('dining não migra café de pacote, restaurante diferente, datas nem referência expirada',()=>{
  now=Date.parse('2026-09-13T09:00:00-03:00');
  const first=turn('Qual o café da manhã avulso?');
  const other=turn('Quero hospedagem para 2 adultos de 18/09 a 20/09',first.state);
  assert.equal(other.state.guest_inquiry,undefined);assert.doesNotMatch(other.r.resolved_message,/Café da manhã avulso:/);
  const expired=turn('Sendo a lá carte, quem não está hospedado pode?',{...first.state,guest_inquiry:{kind:'dining',at:now-31*60000}});
  assert.doesNotMatch(expired.r.resolved_message,/Café da manhã avulso:/);assert.doesNotMatch(expired.r.answer,/R\$35/);
  const restaurant=turn('O restaurante Solar 73 aceita visitantes?');
  const entry=turn('Entrada é gratuita ou paga ?',restaurant.state);
  assert.doesNotMatch(entry.r.answer,/Reserva Solar é gratuita/);
});

test('W18 áudio preserva alternativas e datas originais, sem condensar a pedido genérico',async()=>{
  now=Date.parse('2026-09-11T16:28:00-03:00');
  const message='Qual valor para quarto duplo solteiro ou dois quartos solteiros para entrar hoje e sair segunda?';
  const audio='https://fixture.invalid/comparison.ogg';
  const p=await handleConversation({operation:'prepare',user_message:audio,state:{...empty(),facts:{extras:[]}}},'',async()=>message,now);
  const r=control({operation:'route',user_message:audio,state:p.state,proposed:'QUOTE|2026-09-11|2026-09-14|2|NONE'},now);
  const state=JSON.parse(r.state);
  assert.equal(r.quote_request,'HUMANO');assert.equal(state.facts.check_in,'2026-09-11');assert.equal(state.facts.check_out,undefined);assert.equal(state.facts.guests,undefined);
  assert.equal(state.stay_date_pending.reason,'relative_checkout');
  assert.equal(state.stay_date_pending.suggested_check_out,'2026-09-14');
  assert.match(state.audio.text,/duplo solteiro ou dois quartos/);assert.match(r.answer,/comparar as duas alternativas/);
  const result=await resolve(audio,r.state);assert.equal(result.quote_request,'HUMANO');assert.match(result.conversation_text,/dois quartos individuais/);
});

test('modelo/remember_response não transforma companhia incerta em fatos ou troca pacote',()=>{
  now=Date.parse('2026-09-13T09:00:00-03:00');
  const package_context={id:'reveillon',name:'Réveillon',start_date:'2026-12-31',end_date:'2027-01-03',updated_at:now};
  const message='No pacote de Réveillon meu filho ainda não confirmou ir. Caso ele vá, posso adicionar uma cama?';
  const first=turn(message,{...empty(),topic:'package_info',topic_at:now,package_context});
  const remembered=control({operation:'remember_response',state:first.r.state,response_text:'Confirmei três pessoas e cama extra gratuita.',package_context:{id:'new',name:'Outro',start_date:'2026-12-20',end_date:'2026-12-25'}},now);
  assert.deepEqual(JSON.parse(remembered.state).facts,facts);assert.equal(JSON.parse(remembered.state).package_context.id,'reveillon');assert.equal(JSON.parse(remembered.state).family_party,undefined);
});

test('sessão de fotos consulta autorização; fotos do hotel continuam mídia sem licença implícita',async()=>{
  now=Date.parse('2026-09-13T09:00:00-03:00');
  for(const message of ['Posso fazer uma sessão de fotos na piscina?','Se eu me hospedar, posso trazer fotógrafo externo?']){
    const result=turn(message,empty(),'Sim, está autorizado e agendado.');
    assert.equal(result.r.quote_request,'NOQUOTE');assert.match(result.r.answer,/consulte previamente a recepção/);
    assert.deepEqual(result.state.facts,facts);assert.notEqual(result.state.topic,'extra_photos');
    const resolved=await resolve(message,result.r.state);assert.equal(resolved.match_type,'confirmed_hotel_policy');assert.match(resolved.conversation_text,/não confirma agendamento/);
  }
  const photo=turn('Me envie fotos das piscinas');assert.equal(photo.state.topic,'extra_photos');assert.doesNotMatch(photo.r.answer,/ensaios|sessões/);
});
