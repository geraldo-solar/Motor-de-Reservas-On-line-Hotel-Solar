import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

const bundle=await build({entryPoints:['utils/contagemPacote.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {contagemRegressiva}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

test('conta os dias que faltam dentro da janela de 30 dias',()=>{
  assert.equal(contagemRegressiva('2026-11-19','2026-11-15'),'Faltam 4 dias');
  assert.equal(contagemRegressiva('2026-12-15','2026-11-15'),'Faltam 30 dias');
});

test('troca o número por texto na véspera e no dia',()=>{
  assert.equal(contagemRegressiva('2026-11-16','2026-11-15'),'Começa amanhã');
  assert.equal(contagemRegressiva('2026-11-15','2026-11-15'),'Começa hoje');
});

test('pacote em andamento aparece como acontecendo agora',()=>{
  assert.equal(contagemRegressiva('2026-11-14','2026-11-15'),'Acontecendo agora');
});

test('fora da janela de 30 dias, ou sem data, não mostra contagem',()=>{
  assert.equal(contagemRegressiva('2026-12-24','2026-11-15'),'');
  assert.equal(contagemRegressiva('2027-02-06','2026-11-15'),'');
  assert.equal(contagemRegressiva('','2026-11-15'),'');
  assert.equal(contagemRegressiva(undefined,'2026-11-15'),'');
});

test('atravessa a virada do ano sem errar a conta',()=>{
  assert.equal(contagemRegressiva('2027-01-03','2026-12-31'),'Faltam 3 dias');
});
