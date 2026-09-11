import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: { contents: "export {control} from './api/conversation-control.ts'; export {confirmedHotelPolicy} from './utils/hotelPolicy.ts';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const {control, confirmedHotelPolicy: policy} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const now = Date.parse('2026-09-11T17:00:00Z');
const facts = {guests:2, check_in:'2026-10-20', check_out:'2026-10-25', extras:[]};
const prior = {version:2, facts, history:[], greeted:true};
function turn(message) {
  const prepared = control({operation:'prepare', state:prior, user_message:message}, now);
  const routed = control({operation:'route', state:prepared.state, user_message:message,
    proposed:'QUOTE|2026-10-20|2026-10-25|2|NONE', ai_response:'Resposta informativa sintética.'}, now);
  return {context:JSON.parse(prepared.context), state:JSON.parse(routed.state), routed};
}

test('contexto transmite todas as novas políticas confirmadas sem criar transações', () => {
  const {context} = turn('Qual o horário do check-in?');
  assert.deepEqual(context.politicas_hotel_confirmadas, policy);
  assert.equal(policy.confirmed_at, '2026-09-11');
  assert.match(policy.check_in.early, /06h.*diária inteira.*06h.*14h.*R\$250/);
  assert.match(policy.check_in.waiting, /sem taxa de acesso.*Não inclui refeições/);
  assert.match(policy.check_out.late, /12h.*18h.*R\$250.*18h.*diária inteira.*pacote/);
  assert.match(policy.ordinary_installments, /3 vezes sem juros, sem valor mínimo.*pacote prevalecem/);
  assert.deepEqual([policy.room_food_delivery.opens, policy.room_food_delivery.closes, policy.room_food_delivery.delivery_fee_brl], ['08:00','22:00',0]);
  assert.match(policy.room_food_delivery.limits, /sem afirmar aceite, prazo ou entrega/);
  assert.match(policy.accessibility.ground_floor_rooms, /banheiros NÃO são adaptados/);
  assert.match(policy.accessibility.common_areas, /Reserva Solar.*não possui acesso sem degraus/);
  assert.match(policy.accessibility.limits, /equipamento para entrar nas piscinas/);
  assert.match(policy.boat, /terceirizado.*sob consulta.*Não informar preço fixo/);
  assert.equal(policy.guest_guide, 'https://www.hotelsolar.tur.br/guia');
});

test('LocMil responde contato autorizado sem cotar hospedagem ou prometer contratação', () => {
  for (const message of ['Vocês têm passeio de quadriciclo?', 'Qual o contato da LocMil?', 'Quanto custa o quadriciclo?']) {
    const result = turn(message);
    assert.equal(result.routed.quote_request, 'NOQUOTE', message);
    assert.equal(result.routed.can_collect, 'NAO', message);
    assert.deepEqual(result.state.facts, facts, message);
    assert.match(result.routed.answer, /LocMil Turismo.*terceirizada.*5591987657501/);
    assert.match(result.routed.answer, /Valores, horários, disponibilidade e contratação.*diretamente/);
    assert.doesNotMatch(result.routed.answer, /R\$|confirmado|agendado|reservado/i);
  }
});

test('novas dúvidas informativas não substituem datas e ocupação já informadas', () => {
  for (const message of ['Tem cama extra?', 'Há acesso por rampas?', 'Vocês têm room service?', 'Qual o guia do hóspede?']) {
    const result = turn(message);
    assert.equal(result.routed.quote_request, 'NOQUOTE', message);
    assert.deepEqual(result.state.facts, facts, message);
  }
});

test('contato terceirizado não toma precedência de pedido explícito de humano', () => {
  const result = turn('Quero falar com um humano sobre quadriciclo');
  assert.equal(result.routed.quote_request, 'HUMANO');
  assert.doesNotMatch(result.routed.answer, /5591987657501/);
});
