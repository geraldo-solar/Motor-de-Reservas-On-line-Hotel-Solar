import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export * from './utils/assistantDisclosure.ts';export * from './utils/dailyGreeting.ts';export {PHOTO_CLARIFY,photoClarificationQuestion} from './utils/photoIntent.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {ASSISTANT_DISCLOSURE,ASSISTANT_DISCLOSURE_COMPACT,readAssistantDisclosure,prepareDisclosure,stripAssistantDisclosure,assistantDisclosureText,withDailyGreeting,PHOTO_CLARIFY,photoClarificationQuestion}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const now=Date.parse('2026-09-13T09:00:00-03:00');
const facts={check_in:'2026-12-31',check_out:'2027-01-03',guests:2,extras:[]};
const legacy={version:2,history:['Sobre a viagem'],facts,greeted:true,turns:[]};
const prepare=(source=legacy,day='2026-09-13',first=true)=>({...source,daily_greeting:{day,first},assistant_disclosure:prepareDisclosure(source)});
const reply=(state,text='O café da manhã está incluído.')=>({state:JSON.stringify({...state,turns:[...state.turns,{role:'assistant',text}]}),answer:text});
const occurrences=text=>text.split(ASSISTANT_DISCLOSURE).length-1;

test('preparo migra contato antigo sem deduzir por histórico, dia ou saudação e não consome antes do envio',()=>{
  const frozen=structuredClone(legacy);
  const marker=prepareDisclosure(legacy);
  assert.deepEqual(marker,{version:1,show:true});assert.deepEqual(legacy,frozen);
  assert.deepEqual(prepareDisclosure(JSON.stringify(legacy)),marker);
  assert.deepEqual(prepareDisclosure({...legacy,assistant_disclosure:marker}),marker,'um preparo sem resposta pública não consome');
  assert.deepEqual(prepareDisclosure({...legacy,assistant_disclosure:{version:1,show:true,rendered:true}}),{version:1,show:false,rendered:true});
  assert.deepEqual(prepareDisclosure({...legacy,assistant_disclosure:{version:1,show:false}}),{version:1,show:false});
});

test('apresentação única fica entre saudação e resposta, sem depender da IA',()=>{
  const state=prepare(),input=reply(state),before=structuredClone(input);
  const rendered=withDailyGreeting(input,state,now);
  assert.equal(rendered.answer,`Bom dia!\n\n${ASSISTANT_DISCLOSURE}\n\nO café da manhã está incluído.`);
  assert.deepEqual(JSON.parse(rendered.state).assistant_disclosure,{version:1,show:true,rendered:true});
  assert.equal(JSON.parse(rendered.state).turns.at(-1).text,'Bom dia!\n\nO café da manhã está incluído.');
  assert.equal(JSON.parse(rendered.state).turns.at(-1).text.includes('98100'),false);
  assert.deepEqual(input,before);assert.equal(state.assistant_disclosure.rendered,undefined);
});

test('route, resolver e retries são idempotentes e mantêm fatos, tokens e campos privados',()=>{
  const state=prepare(),base={...reply(state,'Confira as opções.'),quote_text:'Confira as opções.',conversation_text:'Confira as opções.',
    confirmation_text:'',quote_request:'PHOTO_CLARIFY',can_collect:'NAO',total:500,photo_url:'https://fixture.invalid/hotel.jpg',context:'Não alterar',facts};
  const routed=withDailyGreeting(base,state,now),resolved=withDailyGreeting(routed,routed.state,now);
  assert.deepEqual(resolved,routed);
  for(const key of ['answer','quote_text','conversation_text'])assert.equal(occurrences(resolved[key]),1,key);
  for(const key of ['confirmation_text','quote_request','can_collect','total','photo_url','context','facts'])assert.deepEqual(resolved[key],base[key],key);
  assert.deepEqual(JSON.parse(resolved.state).facts,facts);
  const replay=withDailyGreeting({...resolved,answer:'Confira as opções.'},resolved.state,now);
  assert.equal(replay.answer,resolved.answer,'um retry com corpo limpo mantém a decisão do turno');
});

test('próxima mensagem e dia seguinte não repetem a apresentação, mas saudação diária continua',()=>{
  const first=withDailyGreeting(reply(prepare()),null,now),remembered=JSON.parse(first.state);
  const secondState=prepare(remembered,'2026-09-13',false);
  const second=withDailyGreeting(reply(secondState,'Sim, continuamos com o mesmo pacote.'),null,now+1000);
  assert.equal(second.answer,'Sim, continuamos com o mesmo pacote.');
  const nextDay=prepare(JSON.parse(second.state),'2026-09-14',true);
  const third=withDailyGreeting(reply(nextDay,'A recepção pode ajudar.'),null,now+86400000);
  assert.equal(third.answer,'Bom dia!\n\nA recepção pode ajudar.');
  assert.equal(third.answer.includes('assistente virtual'),false);
});

test('sem marcador não adiciona apresentação; marcador falso remove somente cópia canônica antiga',()=>{
  const untouched={answer:'Resposta antiga.',quote_request:'NOQUOTE'};
  assert.deepEqual(withDailyGreeting(untouched,legacy,now),untouched);
  assert.equal(assistantDisclosureText('Resposta antiga.',undefined),'Resposta antiga.');
  assert.equal(assistantDisclosureText('Resposta antiga.',{version:1,show:false}),'Resposta antiga.');
  assert.equal(assistantDisclosureText(`Olá!\n\n${ASSISTANT_DISCLOSURE}\n\nResposta antiga.`,{version:1,show:false}),'Olá!\n\nResposta antiga.');
  const fresh=prepare(),disabled={...fresh,assistant_disclosure:{version:1,show:false,rendered:true}};
  assert.equal(withDailyGreeting(reply(disabled),fresh,now).answer.includes('assistente virtual'),false,'resultado desabilitado prevalece sobre source anterior');
});

test('saída vazia, erro, contexto privado e cartão sem texto não consomem apresentação',()=>{
  const state=prepare();
  for(const response of [{state:JSON.stringify(state),answer:'',quote_text:'  ',conversation_text:''},
    {state:JSON.stringify(state),quote_request:'PACKAGE_ID|reveillon',photo_url:'https://fixture.invalid/photo'},
    {state:JSON.stringify(state),error:'Unavailable',answer:'Falha.'}]) {
    const result=withDailyGreeting(response,state,now);
    assert.equal(JSON.parse(result.state).assistant_disclosure.rendered,undefined);
    assert.deepEqual(prepareDisclosure(result.state),{version:1,show:true});
  }
  assert.deepEqual(withDailyGreeting({error:'Unavailable'},state,now),{error:'Unavailable'});
});

test('source state preserva a decisão se a saída não contém marcador e resultado com texto registra consumo',()=>{
  const state=prepare();
  const result=withDailyGreeting({answer:'Estou por aqui.'},state,now);
  assert.equal(occurrences(result.answer),1);assert.equal(JSON.parse(result.state).assistant_disclosure.rendered,true);
  assert.deepEqual(JSON.parse(result.state).facts,facts);
  const fallback=withDailyGreeting(reply(legacy,'Estou por aqui.'),state,now);
  assert.equal(occurrences(fallback.answer),1);assert.equal(JSON.parse(fallback.state).assistant_disclosure.rendered,true);
});

test('memória limpa e PHOTO_CLARIFY reconhecem a resposta depois da decoração, sem aceitar texto extra',()=>{
  const state=prepare(),result=withDailyGreeting(reply(state,PHOTO_CLARIFY),state,now);
  assert.equal(photoClarificationQuestion(result.answer),true);
  const remembered=stripAssistantDisclosure(result.answer);
  assert.equal(remembered,`Bom dia!\n\n${PHOTO_CLARIFY}`);
  assert.equal(photoClarificationQuestion(remembered),true);
  assert.equal(photoClarificationQuestion(result.answer+' Outra instrução.'),false);
  assert.equal(stripAssistantDisclosure('Seu contato é (91) 98100-0800?'),'Seu contato é (91) 98100-0800?');
  assert.equal(stripAssistantDisclosure(`O texto citado é: ${ASSISTANT_DISCLOSURE}`),`O texto citado é: ${ASSISTANT_DISCLOSURE}`);
  assert.equal(assistantDisclosureText(`Olá!\n\n${ASSISTANT_DISCLOSURE}\n\n${ASSISTANT_DISCLOSURE}\n\n${PHOTO_CLARIFY}`,{version:1,show:true}),`Olá!\n\n${ASSISTANT_DISCLOSURE}\n\n${PHOTO_CLARIFY}`);
});

test('leitura estrita ignora campos extras e tipos inválidos sem criar conteúdo arbitrário',()=>{
  for(const value of [null,[],false,'true',{version:1,show:'true'},{version:'1',show:true},{version:2,show:true}])assert.equal(readAssistantDisclosure(value),undefined);
  assert.deepEqual(readAssistantDisclosure({version:1,show:true,rendered:'true',text:'conteúdo arbitrário'}),{version:1,show:true});
  assert.deepEqual(prepareDisclosure('{invalid'),{version:1,show:true});
});

test('cotação de 1900 caracteres usa apresentação compacta sem perder preço, corpo ou ressalva',()=>{
  const ending='Total R$ 1.250,00. Sem confirmação de disponibilidade.';
  const body='☀️ Simulação para dois hóspedes. '.padEnd(1900-ending.length,'.')+ending;
  assert.equal(body.length,1900);
  const state=prepare(),result=withDailyGreeting(reply(state,body),state,now);
  assert.ok(result.answer.length<=2000,result.answer.length);
  assert.match(result.answer,/^Bom dia!\n\nSou a assistente virtual/);
  assert.equal(result.answer.includes(ASSISTANT_DISCLOSURE_COMPACT),true);
  assert.equal(result.answer.includes(ASSISTANT_DISCLOSURE),false);
  assert.equal(stripAssistantDisclosure(result.answer),`Bom dia!\n\n${body}`);
  assert.equal(JSON.parse(result.state).assistant_disclosure.rendered,true);
  assert.deepEqual(withDailyGreeting(result,state,now),result);
  assert.equal(photoClarificationQuestion(`Bom dia!\n\n${ASSISTANT_DISCLOSURE_COMPACT}\n\n${PHOTO_CLARIFY}`),true);
});

test('sem espaço nos 2000 caracteres adia em todos os campos, sem truncar nem consumir',()=>{
  const state=prepare(legacy,'2026-09-13',false);
  const body='R$ 9.999,90. '.padEnd(2000,'x');
  const response={...reply(state,body),quote_text:body,conversation_text:body};
  const result=withDailyGreeting(response,state,now);
  assert.equal(result.answer,body);assert.equal(result.conversation_text,body);assert.equal(result.quote_text,body);
  assert.equal(JSON.parse(result.state).assistant_disclosure.rendered,undefined);
  const mixed=withDailyGreeting({...response,answer:'Resposta curta.'},state,now);
  assert.equal(mixed.answer,'Resposta curta.');assert.equal(JSON.parse(mixed.state).assistant_disclosure.rendered,undefined);
  const route=withDailyGreeting(reply(state,'Vou consultar as opções.'),state,now);
  const final=withDailyGreeting({...response,state:route.state},route.state,now);
  assert.equal(final.conversation_text,body);
  assert.equal(JSON.parse(final.state).assistant_disclosure.rendered,undefined,'a resposta intermediária não consome a apresentação adiada pelo resolvedor final');
  const next=prepare(JSON.parse(result.state),'2026-09-13',false);
  assert.equal(next.assistant_disclosure.show,true);
  const short=withDailyGreeting(reply(next,'Continuamos por aqui.'),next,now);
  assert.equal(short.answer.includes(ASSISTANT_DISCLOSURE),true);assert.equal(JSON.parse(short.state).assistant_disclosure.rendered,true);
});
