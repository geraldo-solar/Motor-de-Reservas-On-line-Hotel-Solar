import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

const bundle = await build({entryPoints:['utils/lodgingAnswerGuard.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {lodgingPartyConflict, lodgingCommercialAnswer} = await import(
  'data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

test('afirmação explícita da ocupação atual não pode contradizer os fatos', () => {
  for (const text of [
    'Para acomodar vocês cinco, recomendo dois apartamentos.',
    'Para acomodar vocês **5**, podemos consultar a recepção.',
    'Sua hospedagem será para 5 hóspedes.',
    'A sua estadia é para cinco pessoas.',
    'Sua reserva ficou para cinco hóspedes.',
    'Vocês são cinco pessoas ao todo.',
    'Seu grupo totaliza cinco pessoas.',
    'Para vocês cinco, o Loft não é suficiente.',
  ]) {
    assert.equal(lodgingPartyConflict(text,2),true,text);
    assert.equal(lodgingPartyConflict(text,5),false,text);
  }
  for (const text of [
    'Para acomodar vocês dois, sugiro o Loft.',
    'Sua hospedagem será para 2 hóspedes.',
    'Como vão ficar só você e sua esposa, sugiro a categoria Casal para a hospedagem.',
    'A hospedagem será apenas você e sua esposa no Loft.',
    'No Loft ficarão somente você e o seu marido.',
  ]) {
    assert.equal(lodgingPartyConflict(text,5),true,text);
    assert.equal(lodgingPartyConflict(text,2),false,text);
  }
});

test('sem total confiável não deduz conflito nem corrige facts a partir do texto', () => {
  for (const guests of [undefined,null,0,-1,NaN,Infinity,2.5,'2']) {
    assert.equal(lodgingPartyConflict('Para acomodar vocês cinco.',guests),false,String(guests));
  }
  assert.equal(lodgingPartyConflict('',5),false);
  assert.equal(lodgingPartyConflict('Só você e sua esposa podem aproveitar o jantar.',5),false);
});

test('recapitulação explícita e base da cotação também conservam o total atual', () => {
  for (const text of [
    'Entendi, são cinco hóspedes. Posso esclarecer mais alguma coisa?',
    'A cotação considera cinco hóspedes.',
    'São 5 hóspedes.',
    'Certo, então são cinco pessoas.',
    'Esta simulação considera cinco pessoas.',
  ]) {
    assert.equal(lodgingPartyConflict(text,2),true,text);
    assert.equal(lodgingPartyConflict(text,5),false,text);
    assert.equal(lodgingPartyConflict(text),false,text);
  }
  for (const text of [
    'A cotação considera cinco hóspedes?',
    'A cotação anterior considera cinco hóspedes.',
    'Não, a cotação não considera cinco hóspedes.',
    'A cotação considera até cinco hóspedes.',
    'A cotação considera cinco hóspedes por quarto.',
    'A cotação considera 2 adultos e 3 crianças.',
    'A capacidade do barco são cinco hóspedes.',
    'Entendi, são cinco hóspedes no passeio de terceiros.',
    'São cinco pessoas para o café da manhã.',
    'Na categoria Casal, são dois hóspedes por apartamento.',
  ]) assert.equal(lodgingPartyConflict(text,2),false,text);
});

test('capacidade, quartos, parcelas, adultos e idades não são o total da família', () => {
  for (const text of [
    'O Loft acomoda até 4 pessoas mais 1 criança de até 6 anos.',
    'Temos quartos para acomodar até quatro pessoas.',
    'Para acomodar vocês cinco, indico Casal para 2 pessoas e Triplo para 3 pessoas.',
    'Para vocês dois, um Casal; para os três filhos, um Triplo.',
    'Vocês dois ficam no Casal e os três filhos no Triplo.',
    'Podemos distribuir em 2 apartamentos: Casal (2) + Triplo (3).',
    'São 2 adultos e 3 crianças, com idades de 8, 10 e 16 anos.',
    'Vocês são dois adultos e três crianças, com idades de 8, 10 e 16 anos.',
    'Uma criança até 6 anos pode ficar em cortesia no apartamento.',
    'O café é cortesia até 6 anos; de 7 a 12 anos custa R$35.',
    'A hospedagem pode ser parcelada em até 3 vezes.',
    'O quarto de casal tem capacidade para 2 hóspedes.',
    'Sua hospedagem será para 4 pessoas mais 1 criança de até 6 anos.',
    'Sua hospedagem será para quatro pessoas + uma criança de até seis anos.',
    'Sua hospedagem será para 2 hóspedes em cada quarto.',
  ]) assert.equal(lodgingPartyConflict(text,5),false,text);
});

test('perguntas, hipóteses, negações e composição histórica não viram afirmação atual', () => {
  for (const text of [
    'Sua hospedagem será para 5 hóspedes?',
    'Se sua hospedagem será para 5 hóspedes, devemos conferir a configuração.',
    'Caso sejam só você e sua esposa, o Loft é uma opção de hospedagem.',
    'Por exemplo, para acomodar vocês cinco, seria preciso conferir.',
    'Não é para acomodar vocês cinco.',
    'Sua hospedagem não será para 5 hóspedes.',
    'Não vão ficar só você e sua esposa no Loft.',
    'Antes eram 5, agora são 2 pessoas.',
    'Antes sua hospedagem era para 5 hóspedes; agora são 2 pessoas.',
    'Anteriormente sugeri o Loft para vocês cinco. Agora são 2 hóspedes.',
  ]) assert.equal(lodgingPartyConflict(text,2),false,text);
  assert.equal(lodgingPartyConflict('Antes eram 5, agora são 2 pessoas.',5),true);
  assert.equal(lodgingPartyConflict('Seriam cinco se todos fossem. Sua hospedagem será para 2 hóspedes.',5),true);
});

test('preço comercial da acomodação deve ser descartado quando a família muda', () => {
  for (const text of [
    'O Loft para a estadia custa R$ 2.900,00.',
    'Sua hospedagem: R$1000 por duas diárias.',
    'Suíte Casal: BRL 1500.',
    'A diária é de 500 reais.',
    'Loft\nTotal: R$ 2.900,00\nSimulação, sujeita à confirmação da recepção.',
    'Entrada: 18/09; saída: 20/09. Loft: R$ 2900.',
    'Suíte Triplo por R$ 1800, com café da manhã incluído.',
    'Casal — R$ 1000; Triplo — R$ 1500.',
    'O Loft fica por R$2900, com café da manhã e o Kit Lua de Mel.',
    'O pacote de Réveillon custa R$6000.',
    'O pacote de Réveillon custa R$6000, incluindo passeio com terceiros.',
    'A hospedagem custa R$2900, e o café avulso para visitantes custa R$75.',
    'R$2900 pelo Loft.',
  ]) assert.equal(lodgingCommercialAnswer(text),true,text);
});

test('FAQ, capacidade, moeda sem estadia e preços de serviços não são cotação de quarto', () => {
  for (const text of [
    'O Loft comporta até 4 pessoas e uma criança de até 6 anos.',
    'O café da manhã avulso custa R$75.',
    'Um casal paga R$150 pelo café avulso.',
    'No Loft, o frigobar tem itens a partir de R$10.',
    'O Loft tem sacada. O café avulso custa R$75.',
    'O café avulso custa R$75; o Loft tem sacada.',
    'O café avulso custa R$75 para quem não tem hospedagem.',
    'O late checkout custa R$250, conforme a disponibilidade do quarto.',
    'A saída tardia tem valor de R$250 para a estadia.',
    'A decoração de lua de mel no Loft custa R$200.',
    'A hospedagem inclui café da manhã.',
    'O pagamento recebido foi R$1000.',
    'O quarto não possui preço confirmado.',
    'O hotel admite até 4 pessoas por apartamento.',
    'O pacote de passeio de barco no Réveillon custa R$6000.',
    'O pacote de Réveillon da operadora terceira custa R$6000.',
    'O pacote de jantar de Réveillon custa R$250 para o casal.',
    'No Loft, o Kit Lua de Mel custa R$200.',
    'A capacidade é de 4 pessoas no Loft; o passeio custa R$200.',
    'R$75 pelo café da manhã para o casal.',
  ]) assert.equal(lodgingCommercialAnswer(text),false,text);
});
