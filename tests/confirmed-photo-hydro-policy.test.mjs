import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

const built=await build({stdin:{contents:`
  export {photoSessionInquiry,photoSessionAnswer} from './utils/photoSession.ts';
  export {confirmedHotelPolicy,hotelPolicyInquiry,hydromassageInquiry,confirmedHotelAnswer} from './utils/hotelPolicy.ts';
`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {photoSessionInquiry:session,photoSessionAnswer,confirmedHotelPolicy:policy,
  hotelPolicyInquiry:inquiry,hydromassageInquiry:hydro,confirmedHotelAnswer:answer}=await import(
    `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

test('políticas novas têm confirmação específica de 13/09 sem reescrever a data legada',()=>{
  assert.equal(policy.confirmed_at,'2026-09-11');
  assert.equal(policy.hydromassage.confirmed_at,'2026-09-13');
  assert.equal(policy.hydromassage.pools,2);
  assert.equal(policy.hydromassage.heating_confirmed,false);
  assert.equal(policy.photo_sessions.confirmed_at,'2026-09-13');
  assert.equal(policy.photo_sessions.prior_reception_consultation_required,true);
});

test('perguntas de realizar sessão, inclusive literal, fotógrafo externo e continuação não são acervo',()=>{
  for(const message of [
    'Bom dia , gostaria de saber se , se hospedando no hotel pode ser fazer uma sessão de fotos ?',
    'Queria fazer as fotos no dia 16',
    'Posso fazer uma sessão de fotos na piscina?',
    'Sou hóspede, posso fazer um ensaio fotográfico na capela?',
    'Durante a hospedagem posso tirar fotos nas áreas comuns?',
    'Podemos levar um fotógrafo externo?',
    'Posso trazer meu fotógrafo para o hotel?',
    'O fotógrafo pode entrar para nosso ensaio fotográfico?',
    'Qual a regra para sessões fotográficas?',
    'Gostaria de ver se posso realizar uma sessão de fotos no hotel',
  ]) {
    assert.equal(session(message),true,message);
    assert.equal(inquiry(message),true,message);
    assert.equal(answer(message),photoSessionAnswer,message);
  }
  assert.match(photoSessionAnswer,/consulte previamente a recepção/);
  assert.match(photoSessionAnswer,/áreas comuns.*fotógrafo externo/);
  assert.doesNotMatch(photoSessionAnswer,/gratuit|R\$|autorizad[oa]|agendad[oa]|exclusiv/);
});

test('fotos do acervo e documentos não recebem política de ensaio, nem perdem intenção original',()=>{
  for(const message of ['Mande fotos da piscina','Quero ver fotos do quarto','Tem fotos da hidro?',
    'Me envie fotos do ensaio fotográfico','Vocês têm fotos da sessão de fotos?',
    'Posso tirar foto do comprovante?','Queria fazer uma foto do meu documento',
    'Vou enviar uma imagem do comprovante','O PDF não abriu',
  ]) {assert.equal(session(message),false,message);assert.equal(answer(message),undefined,message);}
});

test('duas hidromassagens são compartilhadas, nunca uma promessa de uso privado',()=>{
  for(const message of ['São duas hidromassagens?', 'Tem hidro privativa no quarto?',
    'A jacuzzi é exclusiva da suíte?', 'As hidros são para todos os hóspedes?']) {
    assert.equal(hydro(message),true,message);
    assert.equal(inquiry(message),true,message);
    assert.match(answer(message),/duas piscinas de hidromassagem.*compartilhado dos hóspedes/);
    assert.match(answer(message),/não são privativas nem exclusivas/);
    assert.doesNotMatch(answer(message),/aquecid|gratuit|24h|reservad|R\$/i);
  }
  assert.match(answer('A hidromassagem é aquecida?'),/Sobre aquecimento e temperatura, consulte a recepção/);
  assert.equal(answer('Quero falar com a recepção sobre as hidromassagens'),undefined);
  assert.equal(answer('Falar com a recepção'),undefined);
  assert.equal(answer('A hidro está com defeito'),undefined);
  assert.equal(answer('Qual o horário da piscina principal?'),undefined);
});
