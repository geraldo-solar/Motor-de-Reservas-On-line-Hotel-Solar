import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundled = await build({
  entryPoints: ['utils/guestFacilities.ts'], bundle: true, write: false,
  platform: 'node', format: 'esm',
});
const { confirmedGuestFacilitiesPolicy, guestFacilityInquiry,
  guestFacilityServiceRequest, guestFacilityAnswer } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);

test('copa baby tem confirmação do responsável com data e escopo auditáveis', () => {
  assert.equal(confirmedGuestFacilitiesPolicy.status, 'owner_confirmed');
  assert.equal(confirmedGuestFacilitiesPolicy.confirmed_at, '2026-09-08');
  assert.match(confirmedGuestFacilitiesPolicy.confirmed_by, /Geraldo Barros/);
  assert.match(confirmedGuestFacilitiesPolicy.source, /26\/08\/2026/);
  assert.deepEqual(confirmedGuestFacilitiesPolicy.copa_baby, {
    available: true, audience: 'hóspedes', appliance: 'micro-ondas',
    purpose: 'aquecer alimentos', location: 'copa baby', hours: 'sem horário específico de uso',
  });
});

test('FAQ informa micro-ondas na copa baby para hóspedes sem inventar comodidades ou serviço', () => {
  for (const message of [
    'Posso esquentar comida?', 'Tem microondas?', 'Vocês têm micro-ondas?',
    'Tem micro ondas no hotel?', 'Tem copa baby?', 'Onde fica a copa do bebê?',
    'Onde posso aquecer a comida do bebê?', 'Quero aquecer minha marmita',
    'Posso esquentar a papinha?', 'Pode esquentar comida?',
    'Qual o horário para usar o micro-ondas?', 'A copa baby tem horário?',
    'Tem micro-ondas dentro do quarto?', 'A copa baby fica disponível de madrugada?',
    'Posso esquentar a comida e levar para meu quarto?',
  ]) {
    assert.equal(guestFacilityInquiry(message), 'copa_baby', message);
    assert.equal(guestFacilityServiceRequest(message), false, message);
    const answer = guestFacilityAnswer(message);
    assert.match(answer, /hóspedes.*micro-ondas da copa baby.*aquecer alimentos/i, message);
    assert.match(answer, /sem horário específico de uso/i, message);
    assert.doesNotMatch(answer, /24|funcionári|equipe|entrega|quarto|forno|fogão|refrigerador|adaptad|gratuito|grátis|todas as/i, message);
  }
});

test('pedido dirigido à equipe é operacional e não recebe promessa de aquecimento ou entrega', () => {
  for (const message of [
    'Podem aquecer e trazer?', 'Podem aquecer a minha comida?',
    'Vocês podem esquentar a papinha?', 'Pode esquentar minha comida?',
    'Por favor, aqueçam minha comida e tragam para o quarto',
    'Esquentem a marmita e levem ao quarto', 'Quero que vocês esquentem minha comida',
    'Podem esquentar a comida no micro-ondas e entregar?', 'Pode aquecer e levar ao quarto?',
  ]) {
    assert.equal(guestFacilityServiceRequest(message), true, message);
    assert.equal(guestFacilityInquiry(message), undefined, message);
    assert.equal(guestFacilityAnswer(message), undefined, message);
  }
});

test('pedido retirado e dúvida de procedimento não viram solicitação operacional', () => {
  for (const message of [
    'Não preciso que aqueçam minha comida', 'Não quero que vocês esquentem minha comida',
    'Não aqueçam minha comida e não tragam ao quarto',
    'Pode cancelar o pedido de aquecer minha comida e trazer?',
    'Como posso pedir para aquecer minha comida?',
    'Quero saber se vocês podem aquecer minha comida',
    'Posso aquecer a comida e trazer para o quarto?',
    'Podem aquecer a piscina?',
  ]) assert.equal(guestFacilityServiceRequest(message), false, message);
});

test('instalações não confirmadas, visitantes, fotos, falhas e reservas permanecem fora da FAQ', () => {
  for (const message of [
    '', 'Qual horário da piscina?', 'A piscina é aquecida?',
    'Tem forno e fogão na copa baby?', 'Posso guardar comida na geladeira da copa baby?',
    'A copa baby é adaptada para cadeirante?', 'Posso cozinhar na copa baby?',
    'Quem não está hospedado pode usar o microondas?', 'Visitantes podem usar a copa baby?',
    'Não sou hospedado, posso esquentar comida?', 'Quero fotos da copa baby',
    'Pode enviar a imagem do microondas?', 'O microondas está quebrado',
    'O microondas não está funcionando', 'O microondas não aquece minha comida',
    'Quero reservar quarto com microondas',
    'Quero cotar hospedagem com copa baby', 'Quero falar com um humano sobre a copa baby',
    'Não quero esquentar comida', 'Qual o preço do café da manhã?',
  ]) assert.equal(guestFacilityAnswer(message), undefined, message);
});
