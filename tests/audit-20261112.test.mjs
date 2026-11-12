// Auditoria do atendimento de 12/11/2026 (15 conversas do Inbox).
// Cada teste reproduz a mensagem real que recebeu a resposta errada.
import './relogio-fixo.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

// Quinta-feira, 12/11/2026, 09h46 de Belém: o Reserva Solar não abre nesse dia.
const now=Date.parse('2026-11-12T09:46:00-03:00'),realNow=Date.now;Date.now=()=>now;
const bundle=await build({stdin:{contents:`export {control,handleConversation} from './api/conversation-control.ts';export {default as resolver} from './api/resolve-package.ts';export * from './utils/assistantDisclosure.ts';export * from './utils/humanIntent.ts';export {isStickerInput,isAttachmentInput} from './utils/attachmentAnalysis.ts';export {visitorAccessAnswer,openingEllipsis,restaurantTodayNote} from './utils/diningPolicy.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',
  define:{'process.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','process.env.VITE_SUPABASE_ANON_KEY':'"fixture"'},
  plugins:[{name:'audit-fixture-only',setup(b){
    b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'test'}));
    b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`const data={extras:[],packages:[],room_types:[{id:'casal',name:'Suíte Casal',capacity:2,active:true,base_price:500,images:['https://fixture.invalid/casal.jpg']}]};
      export function createClient(){return {from(table){if(!(table in data))throw Error('Unexpected table '+table);return {select(){let rows=data[table];const q={eq(k,v){rows=rows.filter(x=>x[k]===v);return q;},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve);}};return q;}};}};}`}));
  }}]});
const {control,handleConversation,resolver,ASSISTANT_DISCLOSURE,ASSISTANT_DISCLOSURE_COMPACT,stripAssistantDisclosure,namedStaffRequest,namedStaffAnswer,
  isStickerInput,isAttachmentInput,visitorAccessAnswer,openingEllipsis,restaurantTodayNote}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
test.after(()=>{Date.now=realNow;});

const AI='Resposta do modelo.';
// Contato já apresentado e já cumprimentado hoje: as respostas chegam sem decoração.
const presented={version:2,history:[],facts:{extras:[]},greeted:true,assistant_disclosure:{version:1,show:false,rendered:true},daily_greeting:{day:'2026-11-12',first:true}};
const prepare=(message,state=presented,time=now)=>control({operation:'prepare',user_message:message,state,quote_state:null},time);
const route=(message,state,answer=AI,time=now)=>control({operation:'route',user_message:message,state,quote_state:null,ai_response:answer},time);
const turn=(message,state=presented,answer=AI,time=now)=>route(message,prepare(message,state,time).state,answer,time);
const sticker='https://manybot-files.manychat.io/156918594386969/wa/2026/11/12/original_b7c5a84019c9129ac7faa3ed6297baf1.webp';

test('"acesso para não hóspedes" é dúvida de visitante, não cotação de hospedagem',()=>{
  for(const message of ['Como funciona o acesso para não hóspedes?','Quem não está hospedado pode entrar?','Posso visitar o hotel sem estar hospedado?','Vocês atendem quem não é hóspede?']){
    const r=turn(message),state=JSON.parse(r.state);
    assert.equal(r.quote_request,'NOQUOTE',message);
    assert.match(r.answer,/Quem não está hospedado é bem-vindo nos nossos restaurantes/,message);
    assert.match(r.answer,/A piscina é exclusiva para hóspedes/);
    assert.doesNotMatch(r.answer,/quantas pessoas|datas de entrada/);
    assert.equal(state.awaiting,undefined);assert.equal(state.facts.guests,undefined);
    assert.equal(state.guest_inquiry.kind,'dining');
  }
  // Assuntos com rota própria continuam nela.
  for(const message of ['Não hóspede pode usar a piscina?','Tem day use para não hóspedes?','Café da manhã para não hóspedes, quanto custa?'])
    assert.equal(visitorAccessAnswer(message),undefined,message);
  // Um pedido de hospedagem continua sendo hospedagem.
  const lodging=turn('Quero reservar um quarto para 2 hóspedes de 20 a 22/12');
  assert.match(lodging.quote_request,/^QUOTE\|2026-12-20\|2026-12-22\|2\|/);
});

test('"Hoje segue aberto normalmente?" depois do cardápio fala dos restaurantes e do dia da semana',()=>{
  let state=turn('Precisa pagar algum valor fora o consumo pra almoçar aí?',presented,'Não há cobrança além do consumo.').state;
  state=turn('Gostaria do cardápio simm',state,'Aqui está o cardápio.').state;
  const r=turn('Hoje segue aberto normalmente?',state),next=JSON.parse(r.state);
  assert.equal(r.quote_request,'NOQUOTE');
  assert.match(r.answer,/Hoje é quinta-feira/);assert.match(r.answer,/o Solar 73 abre das 11h às 23h, e o Reserva Solar não abre/);
  assert.doesNotMatch(r.answer,/datas de entrada/);
  assert.equal(next.awaiting,undefined);assert.equal(next.stay_date_pending,undefined);assert.equal(next.facts.check_in,undefined);
  assert.equal(next.guest_inquiry.kind,'dining');
  // Em um sábado o Reserva Solar entra na resposta como aberto.
  const saturday=Date.parse('2026-11-14T09:46:00-03:00');
  let weekend=turn('Qual o cardápio do restaurante?',presented,'Aqui está o cardápio.',saturday).state;
  assert.match(turn('Abre hoje?',weekend,AI,saturday).answer,/Hoje é sábado: pelo horário habitual, o Solar 73 abre das 11h às 23h e o Reserva Solar também abre/);
  // Sem assunto de restaurante, só vale quando a pergunta cita o dia.
  assert.equal(openingEllipsis('Hoje está aberto?',false),true);
  assert.equal(openingEllipsis('Está aberto?',false),false);assert.equal(openingEllipsis('Está aberto?',true),true);
  for(const message of ['Como funciona o pacote?','A piscina está aberta hoje?','Hoje tem vaga aberta para casal?','A recepção funciona hoje?'])
    assert.equal(openingEllipsis(message,true),false,message);
  // "Hoje" em pedido de hospedagem continua sendo data de entrada.
  const stay=turn('Hoje tem vaga para casal?');
  assert.match(stay.answer,/datas de entrada e saída/);assert.equal(JSON.parse(stay.state).facts.guests,2);
});

test('o modelo recebe o dia da semana e o funcionamento habitual dos restaurantes',()=>{
  assert.match(restaurantTodayNote(now),/^Hoje é quinta-feira\. .*o Reserva Solar não abre hoje/);
  assert.match(restaurantTodayNote(Date.parse('2026-11-13T12:00:00-03:00')),/^Hoje é sexta-feira\. .*o Reserva Solar também abre, das 10h às 18h/);
  const context=JSON.parse(prepare('Só pretendo ir almoçar hoje').context);
  assert.equal(context.funcionamento_habitual_restaurantes_hoje,restaurantTodayNote(now));
  assert.match(context.regra_funcionamento_hoje,/Nunca afirme que o Reserva Solar abre/);
  assert.match(context.regra_dados_da_cotacao,/de uma vez, na mesma mensagem/);
});

test('cotação pede pessoas, idades e datas em uma única pergunta e entende respostas parciais',()=>{
  const question='Para quantas pessoas será a estadia e quais as datas de entrada e saída? Se houver crianças, me diga também as idades.';
  const first=turn('Gostaria de saber quais sãos os valores das diárias no hotel?');
  assert.equal(first.answer,question);assert.equal(JSON.parse(first.state).awaiting,'stay');
  // Tudo em uma resposta: segue direto para a cotação.
  assert.match(turn('Dois adultos e duas crianças de 3 e 8 anos, de 20 a 23 de dezembro',first.state).quote_request,/^QUOTE\|2026-12-20\|2026-12-23\|4\|/);
  // Só o grupo: falta a data, e a resposta curta de data é entendida.
  const group=turn('4',first.state);
  assert.equal(JSON.parse(group.state).facts.guests,4);assert.match(group.answer,/^Quais são as datas de entrada e saída\?/);
  assert.match(turn('sexta a domingo',group.state).quote_request,/^QUOTE\|2026-11-13\|2026-11-15\|4\|/);
  // Só as datas: falta o grupo, sem pedir as datas de novo.
  const dates=turn('de 20 a 23/12',first.state);
  assert.equal(dates.answer,'Para quantas pessoas será a estadia? Se houver crianças, me diga as idades.');assert.equal(JSON.parse(dates.state).awaiting,'guests');
  assert.match(turn('casal',dates.state).quote_request,/^QUOTE\|2026-12-20\|2026-12-23\|2\|/);
});

test('apresentação diz o que a assistente resolve e não chega colada a um "obrigado"',()=>{
  assert.doesNotMatch(ASSISTANT_DISCLOSURE,/98100|Falar com a recepção|atendimento humano/);
  assert.match(ASSISTANT_DISCLOSURE,/^Sou a assistente virtual do Hotel Solar\./);
  assert.equal(ASSISTANT_DISCLOSURE.includes(ASSISTANT_DISCLOSURE_COMPACT),false);
  // A apresentação antiga ainda é retirada de uma resposta ecoada pelo fluxo.
  const legacy='Sou a assistente virtual do Hotel Solar. ☀️ Se preferir atendimento humano, toque em “Falar com a recepção”, escreva “recepção” ou ligue para (91) 98100-0800.';
  assert.equal(stripAssistantDisclosure(`Bom dia!\n\n${legacy}\n\nO café está incluído.`),'Bom dia!\n\nO café está incluído.');
  // Conversa iniciada em outro fluxo: "Ok obrigado !" é o primeiro turno aqui.
  const fresh={version:2,history:[],facts:{extras:[]},greeted:false};
  for(const message of ['Ok obrigado !','👍','Obrigada!']){
    const thanks=turn(message,fresh,'Por nada!');
    assert.equal(thanks.answer.includes(ASSISTANT_DISCLOSURE),false,message);
    assert.equal(JSON.parse(thanks.state).assistant_disclosure,undefined,message);
    // A próxima pergunta de verdade recebe a apresentação, uma única vez.
    const question=turn('Qual o horário do café da manhã?',thanks.state,'O café é servido das 7h às 10h.');
    assert.equal(question.answer.split(ASSISTANT_DISCLOSURE).length-1,1,message);
    assert.deepEqual(JSON.parse(question.state).assistant_disclosure,{version:1,show:true,rendered:true});
    assert.equal(turn('E o check-in?',question.state,'A partir das 14h.').answer.includes(ASSISTANT_DISCLOSURE),false);
  }
  // Uma pergunta como primeiro turno continua apresentando a assistente.
  assert.equal(turn('Tem estacionamento?',fresh,'Sim, gratuito.').answer.includes(ASSISTANT_DISCLOSURE),true);
});

test('figurinha é uma reação, não um anexo encaminhado à equipe',async()=>{
  assert.equal(isStickerInput(sticker),true);assert.equal(isStickerInput(sticker.replace('.webp','.jpeg')),false);
  assert.equal(isStickerInput('Veja a figurinha '+sticker),false);
  let analyzed=0;const analyze=async()=>{analyzed++;return {kind:'other',summary:''};};
  const p=await handleConversation({operation:'prepare',user_message:sticker,state:presented},'',undefined,now,analyze);
  assert.equal(analyzed,0);assert.equal(p.input_type,undefined);assert.equal(JSON.parse(p.state).attachment,undefined);
  assert.doesNotMatch(JSON.stringify(JSON.parse(p.state).history),/manybot-files|webp/);
  const r=route(sticker,p.state);
  assert.equal(r.quote_request,'NOQUOTE');assert.doesNotMatch(r.answer,/anexo|encaminh/i);
  // Depois de uma despedida, a figurinha não recebe resposta.
  const bye=turn('Obrigado!',presented,'Por nada!');
  assert.match(bye.answer,/é só me chamar por aqui/);
  assert.equal(turn(sticker,bye.state).answer,'');
  // O resolvedor de pacotes lê a figurinha do mesmo jeito.
  let resolved;await resolver({method:'POST',body:{user_message:sticker,state:r.state},query:{}},
    {status(code){assert.equal(code,200);return this;},json(value){resolved=value;return value;}});
  assert.notEqual(resolved.match_type,'attachment');assert.doesNotMatch(JSON.stringify(resolved),/Recebi seu anexo|ANEXO_/);
  // Uma foto ou documento continua indo para a equipe.
  const photo=sticker.replace('.webp','.jpeg');
  assert.equal(isAttachmentInput(photo),true);
  const attached=await handleConversation({operation:'prepare',user_message:photo,state:presented},'',undefined,now,analyze);
  assert.equal(analyzed,1);assert.equal(attached.input_type,'attachment');
  assert.equal(route(photo,attached.state).quote_request,'ANEXO_SETOR');
});

test('pedido para falar com o Geraldo ou com o gerente chama a equipe; citação não',()=>{
  for(const message of ['Quero falar com o Geraldo','Preciso falar com o gerente','O gerente está aí?','Me passa o contato do Geraldo','Chama o Geraldo por favor','Gostaria de falar diretamente com o dono']){
    assert.equal(namedStaffRequest(message),true,message);
    const r=turn(message);
    assert.equal(r.quote_request,'HUMANO',message);assert.equal(r.answer,namedStaffAnswer,message);
  }
  for(const message of ['Não! depois converso com o Geraldo','Já falei com o Geraldo e ele me passou o valor','O Geraldo me indicou o hotel','Não quero falar com o gerente','Vou falar com o Geraldo amanhã']){
    assert.equal(namedStaffRequest(message),false,message);
    assert.notEqual(turn(message).quote_request,'HUMANO',message);
  }
  const context=JSON.parse(prepare('Não! depois converso com o Geraldo').context);
  assert.equal(context.pessoa_da_equipe_citada,true);
  assert.match(context.regra_pessoa_da_equipe_citada,/escrever “recepção”/);
  assert.equal(JSON.parse(prepare('Qual o valor da diária?').context).pessoa_da_equipe_citada,undefined);
});
