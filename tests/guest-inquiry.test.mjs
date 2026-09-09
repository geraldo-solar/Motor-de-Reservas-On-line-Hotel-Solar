import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

const bundle = await build({entryPoints:['utils/guestInquiry.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {guestInquiry, explicitLodgingRequest} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('FAQ observada não é cotação só por mencionar diária, hospedagem, reserva ou quarto', () => {
  for (const message of [
    'café incluso na diária',
    'pets na hospedagem',
    'pagamento da reserva',
    'horário para entrar no quarto',
    'O café da manhã está incluído na hospedagem?',
    'Vocês aceitam cachorros na hospedagem?',
    'Qual o horário de check-in e check-out?',
    'Que horas posso entrar no quarto?',
    'Qual o horário da recepção para entrar no quarto?',
    'Como funciona o pagamento da reserva?',
    'A diária pode ser paga com cartão?',
    'Qual a capacidade do quarto?',
    'O quarto tem banheira?',
    'O Loft possui sacada?',
    'Criança de 5 anos paga hospedagem?',
    'Preciso informar CPF para reservar?',
    'Como faço para reservar um quarto?',
  ]) {
    assert.equal(guestInquiry(message),'lodging_faq',message);
    assert.equal(explicitLodgingRequest(message),false,message);
  }
});

test('day use e contagem de participantes não são hóspedes de quarto', () => {
  for (const message of [
    'Quanto custa o day use para 2 adultos?',
    'Quero day use para duas pessoas',
    'Quero reservar o day-use para um casal e uma criança',
    'Quero reservar o day use sem hospedagem',
    'Qual o valor do dayuse?',
    'Quero passar o dia no hotel para 3 pessoas',
    'Quero passar somente o dia, sem hospedagem',
    'No day use podemos usar a piscina?',
  ]) {
    assert.equal(guestInquiry(message),'day_use',message);
    assert.equal(explicitLodgingRequest(message),false,message);
  }
});

test('gastronomia e reserva de mesa não iniciam hospedagem', () => {
  for (const message of [
    'Quero almoçar para 2 pessoas',
    'Quanto custa o almoço para um casal?',
    'Quero reservar uma mesa para jantar',
    'Quero reservar uma mesa no hotel, não hospedagem',
    'Quero tomar café da manhã para 2 adultos',
    'Qual o cardápio do restaurante Reserva Solar?',
    'Quanto custa jantar no hotel?',
    'Quero uma reserva no restaurante Solar 73',
    'O restaurante aceita pets?',
    'Quem não está hospedado pode tomar café da manhã no hotel?',
  ]) {
    assert.equal(guestInquiry(message),'dining',message);
    assert.equal(explicitLodgingRequest(message),false,message);
  }
});

test('pedido explícito de hospedagem é preservado mesmo com café, pet ou jantar', () => {
  for (const message of [
    'Quero reservar um quarto para 2 pessoas',
    'Gostaria de cotar a hospedagem com café da manhã',
    'Preciso de hospedagem para duas pessoas com um pet',
    'Pode simular uma estadia para 2 adultos?',
    'Orçamento de hospedagem para três pessoas',
    'Cotação para uma suíte',
    'Quero fazer uma reserva no Hotel Solar',
    'Quero me hospedar no Hotel Solar',
    'Quero reservar o Loft com café da manhã',
    'Quero um quarto e também jantar no restaurante',
    'Quero reservar hospedagem e saber o valor do day use',
    'Qual o valor da diária com café incluso?',
    'Quanto custa uma hospedagem para 3 pessoas?',
    'Tem disponibilidade de quartos?',
    'Tem um quarto para três pessoas?',
    'Vocês têm quartos disponíveis?',
    'Reservar uma suíte para duas pessoas',
  ]) {
    assert.equal(explicitLodgingRequest(message),true,message);
    assert.equal(guestInquiry(message),undefined,message);
  }
});

test('negação ou pergunta de procedimento não vira solicitação explícita de reserva', () => {
  for (const message of [
    'Não quero reservar um quarto, só saber se aceitam pets',
    'Gostaria de saber como posso reservar um quarto',
    'Quero conhecer o Loft',
    'Como funciona uma reserva no hotel?',
    'Preciso enviar documentos para reservar hospedagem?',
    'Pagamento da reserva de hospedagem',
  ]) assert.equal(explicitLodgingRequest(message),false,message);
  assert.equal(explicitLodgingRequest('Não quero day use; quero reservar um quarto'),true);
});

test('rotas especializadas não são capturadas pelo guard de FAQ', () => {
  for (const message of [
    'Quero fotos do café da manhã',
    'Quero uma imagem do café da manhã',
    'Fotos dos quartos com banheira',
    'Quero falar com um humano sobre o pagamento da reserva',
    'Quero falar com a recepção para reservar um quarto',
    'Quero reembolso da reserva',
    'Quero um aniversário com almoço para 40 pessoas',
    'Orçamento para um casamento com jantar e hospedagem',
    'Quero reservar o passeio de barco para duas pessoas',
    'Qual o valor da mesa posta?',
    'Kit lua de mel inclui jantar?',
    'O Réveillon inclui café da manhã?',
    'Qual o pagamento do pacote?',
  ]) assert.equal(guestInquiry(message),undefined,message);
});

test('mensagens ambíguas e fatos isolados continuam para o contexto existente', () => {
  for (const message of [
    '', 'Olá', 'duas pessoas', 'somos um casal e uma criança de 5 anos',
    'Seria para 03 pessoas', '15/09/26', 'Aniversário do meu pai',
    '20/09 a 22/09', 'Quero reservar', 'Loft', 'Tem piscina?',
    'O que você me indica para três pessoas?',
  ]) assert.equal(guestInquiry(message),undefined,message);
});

test('normalização aceita acentos, caixa e espaços sem alterar política ou preços', () => {
  assert.equal(guestInquiry('  CAFÉ INCLUSO NA DIÁRIA?  '),'lodging_faq');
  assert.equal(guestInquiry('PETS   na HOSPEDAGEM'),'lodging_faq');
  assert.equal(guestInquiry('QUERO ALMOÇAR PARA 2 PESSOAS'),'dining');
  assert.equal(guestInquiry('Quanto custa o DAY-USE para 2 adultos?'),'day_use');
});

test('esclarecer base do valor anterior não inicia outra cotação nem interpreta diárias como nova estadia', () => {
  for (const message of [
    'Esse total é pelas 3 diárias ou por dia?',
    'Esse valor é por diária ou pelo pacote?',
    'Esse valor é por pessoa ou pelo quarto?',
    'Esse total é pelas três diárias ou por dia?',
    'O valor informado é por pessoa ou pelo quarto?',
    'Esse valor da diária é por pessoa?',
  ]) {
    assert.equal(guestInquiry(message),'lodging_faq',message);
    assert.equal(explicitLodgingRequest(message),false,message);
  }
  for (const message of ['Qual o valor da diária?', 'Quanto custa uma diária?', 'Quero cotar a hospedagem']) {
    assert.equal(explicitLodgingRequest(message),true,message);
    assert.equal(guestInquiry(message),undefined,message);
  }
  assert.equal(guestInquiry('Esse valor do day use é por pessoa?'),'day_use');
  assert.equal(guestInquiry('Esse valor do almoço é por pessoa?'),'dining');
  assert.equal(guestInquiry('Esse valor do Réveillon é por diária ou pelo pacote?'),undefined);
  assert.equal(explicitLodgingRequest('Esse valor é por diária? Quero cotar uma hospedagem para 3 pessoas'),true);
});

test('declaração de datas de check-in/check-out não é confundida com FAQ de horários', () => {
  for (const message of [
    'Dia 08/07 checkin e check out dia 11/07',
    'Check-in 08/07/2026 e check-out 11/07/2026',
    'Checkin 2026-07-08 checkout 2026-07-11',
    'Checkin 8 de julho e checkout 11 de julho',
  ]) {
    assert.equal(explicitLodgingRequest(message),true,message);
    assert.equal(guestInquiry(message),undefined,message);
  }
  for (const message of [
    'Qual o horário de check-in?',
    'Qual o horário do checkin no dia 08/07?',
    'Como funciona o check-out no dia 11/07?',
    'Posso antecipar o check-in para o dia 08/07?',
  ]) {
    assert.equal(explicitLodgingRequest(message),false,message);
    assert.equal(guestInquiry(message),'lodging_faq',message);
  }
});

test('declaração real de julho chega aos fatos com o ano correto e composição familiar permanece 4 hóspedes', async () => {
  const bundled = await build({entryPoints:['api/conversation-control.ts'],bundle:true,write:false,platform:'node',format:'esm'});
  const {control} = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  for (const [today,year] of [['2026-07-01T16:00:00Z','2026'],['2026-07-12T16:00:00Z','2027']]) {
    const now = Date.parse(today);
    const initial = {version:2,history:[],facts:{extras:[]},greeted:true};
    const dates = control({operation:'prepare',user_message:'Dia 08/07 checkin e check out dia 11/07',state:initial},now);
    assert.equal(JSON.parse(dates.state).facts.check_in,`${year}-07-08`);
    assert.equal(JSON.parse(dates.state).facts.check_out,`${year}-07-11`);
    assert.equal(JSON.parse(dates.context).atendimento_informativo_em_foco,null);
    const party = control({operation:'prepare',user_message:'2 adultos e 2 crianças de 2 e 5 anos',state:dates.state},now + 1000);
    assert.deepEqual(JSON.parse(party.state).facts,{
      extras:[],check_in:`${year}-07-08`,check_out:`${year}-07-11`,guests:4,children_pending:false,
    });
  }
});
