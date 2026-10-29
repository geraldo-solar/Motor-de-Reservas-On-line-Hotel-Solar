import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

// Orientação da IA no lançamento Solar Sem Limites 2027 (Geraldo, 29/10/2026).
const bundle = await build({
  stdin: { contents: "export {control} from './api/conversation-control.ts'; export {solarSemLimites2027Policy} from './utils/solarSemLimites2027.ts';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const {control, solarSemLimites2027Policy: policy} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const prior = {version:2, facts:{}, history:[], greeted:true};
const contexto = (message, now) =>
  JSON.parse(control({operation:'prepare', state:prior, user_message:message}, now).context);

test('antes da abertura: convida para a Lista VIP e a visita, sem preço nem pressão', () => {
  const p = policy(Date.parse('2026-10-30T13:05:00Z'));
  assert.equal(p.fase, 'antes_da_abertura');
  assert.match(p.datas, /24\/11, às 19h.*25\/11, às 8h.*01\/12, às 23h59/);
  assert.match(p.como_entrar_na_lista_vip, /Entrar na Lista VIP.*Quero entrar na Lista VIP.*hotelsolar\.tur\.br\/vip/);
  assert.match(p.nao_inventar, /Não informe nem estime preço.*parcelamento.*reservas comuns não vale/);
  assert.match(p.tom, /últimas vagas.*sem juros, desconto, sorteio ou ilimitado.*guarás, maré ou clima/);
  assert.match(p.indicacao, /item 10 do regulamento/);
  const texto = JSON.stringify(p);
  assert.doesNotMatch(texto, /R\$|\d+x|3\.?100|3\.?410/, 'nenhum preço ou parcela no contexto');
});

test('vendas abertas de 25/11 às 8h até 01/12 às 23h59, depois encerrado', () => {
  assert.equal(policy(Date.parse('2026-11-25T10:59:59Z')).fase, 'antes_da_abertura');
  assert.equal(policy(Date.parse('2026-11-25T11:00:00Z')).fase, 'vendas_abertas');
  assert.match(policy(Date.parse('2026-11-28T15:00:00Z')).como_responder, /solarsemlimites2027/);
  assert.equal(policy(Date.parse('2026-12-02T02:59:59Z')).fase, 'vendas_abertas');
  assert.equal(policy(Date.parse('2026-12-02T03:00:00Z')).fase, 'encerrado');
});

test('a orientação vai no contexto de toda conversa, sem criar cotação', () => {
  const now = Date.parse('2026-10-30T13:30:00Z');
  for (const message of ['Quero saber mais', 'Quanto custa o Solar Sem Limites?', 'Qual o horário do check-in?']) {
    const ctx = contexto(message, now);
    assert.equal(ctx.politica_solar_sem_limites_2027.fase, 'antes_da_abertura', message);
    const prepared = control({operation:'prepare', state:prior, user_message:message}, now);
    assert.equal(prepared.quote_request, 'NOQUOTE', message);
  }
});
