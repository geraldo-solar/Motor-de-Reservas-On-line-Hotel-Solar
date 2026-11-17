import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

const bundle=await build({entryPoints:['utils/recargaAgrupada.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {criarRecargaAgrupada}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

// Relógio de mentira: o teste anda o tempo na mão.
function relogioDeTeste(){
  let agora=0, proximo=1;
  const agendados=new Map();
  return {
    relogio:{
      agora:()=>agora,
      agendar:(fn,ms)=>{const id=proximo++; agendados.set(id,{fn,quando:agora+ms}); return id;},
      desagendar:(id)=>{agendados.delete(id);},
    },
    andar(ms){
      const fim=agora+ms;
      for(;;){
        const vencidos=[...agendados.entries()].filter(([,a])=>a.quando<=fim).sort((a,b)=>a[1].quando-b[1].quando);
        if(vencidos.length===0) break;
        const [id,a]=vencidos[0];
        agendados.delete(id); agora=a.quando; a.fn();
      }
      agora=fim;
    },
    pendentes:()=>agendados.size,
  };
}

// Recarga que o teste termina quando quiser.
function recargaDeTeste(){
  const chamadas=[];
  const recarregar=()=>new Promise((resolve,reject)=>{chamadas.push({resolve,reject});});
  return {recarregar,chamadas};
}

const respiro=()=>new Promise(r=>setImmediate(r));

test('a rajada de 17/11/2026 vira um punhado de recargas, e a última vem depois da última mudança',async()=>{
  const t=relogioDeTeste();
  const recargas=[];
  let ultimoAviso=0;
  const recarga=criarRecargaAgrupada(async()=>{recargas.push(t.relogio.agora());},1500,10000,t.relogio);
  // 66 gravações de tarifa em um minuto, dois avisos do banco para cada uma.
  for(let i=0;i<132;i++){ recarga.pedir(); ultimoAviso=t.relogio.agora(); t.andar(480); await respiro(); }
  t.andar(1500); await respiro();
  assert.ok(recargas.length>=1&&recargas.length<=7,`eram 132 recargas, uma por aviso; foram ${recargas.length}`);
  assert.ok(recargas.at(-1)>=ultimoAviso,'a tela termina com o que ficou no banco depois da última mudança');
  t.andar(60000); await respiro();
  assert.ok(recargas.length<=7,'sem avisos novos, não recarrega de novo');
});

test('avisos seguidos, sem pausa, viram uma recarga só',()=>{
  const t=relogioDeTeste(); const r=recargaDeTeste();
  const recarga=criarRecargaAgrupada(r.recarregar,1500,10000,t.relogio);
  for(let i=0;i<50;i++) recarga.pedir();
  t.andar(1500);
  assert.equal(r.chamadas.length,1);
});

test('espera a rajada acabar antes de recarregar',()=>{
  const t=relogioDeTeste(); const r=recargaDeTeste();
  const recarga=criarRecargaAgrupada(r.recarregar,1500,10000,t.relogio);
  recarga.pedir(); t.andar(1000);
  recarga.pedir(); t.andar(1000);
  assert.equal(r.chamadas.length,0,'ainda dentro da espera depois do segundo aviso');
  t.andar(500);
  assert.equal(r.chamadas.length,1);
});

test('uma mudança isolada recarrega depois da espera',()=>{
  const t=relogioDeTeste(); const r=recargaDeTeste();
  const recarga=criarRecargaAgrupada(r.recarregar,1500,10000,t.relogio);
  recarga.pedir();
  t.andar(1499); assert.equal(r.chamadas.length,0);
  t.andar(1);    assert.equal(r.chamadas.length,1);
});

test('mudança contínua não adia a recarga para sempre',()=>{
  const t=relogioDeTeste(); const r=recargaDeTeste();
  const recarga=criarRecargaAgrupada(r.recarregar,1500,10000,t.relogio);
  for(let i=0;i<10;i++){ recarga.pedir(); t.andar(1000); }
  assert.equal(r.chamadas.length,1,'recarrega ao bater o teto de 10 s, mesmo com avisos chegando');
});

test('nunca roda duas recargas ao mesmo tempo; o que chega durante vira uma só depois',async()=>{
  const t=relogioDeTeste(); const r=recargaDeTeste();
  const recarga=criarRecargaAgrupada(r.recarregar,1500,10000,t.relogio);
  recarga.pedir(); t.andar(1500);
  assert.equal(r.chamadas.length,1);
  // O banco está lento: a recarga não terminou e chegam mais 20 avisos.
  for(let i=0;i<20;i++){ recarga.pedir(); t.andar(2000); }
  assert.equal(r.chamadas.length,1,'não empilha recarga em cima de recarga');
  r.chamadas[0].resolve(true); await respiro();
  t.andar(1500);
  assert.equal(r.chamadas.length,2,'uma única recarga para tudo o que chegou durante a primeira');
  r.chamadas[1].resolve(true); await respiro();
  t.andar(60000);
  assert.equal(r.chamadas.length,2);
});

test('recarga que falha não trava as próximas',async()=>{
  const t=relogioDeTeste(); const r=recargaDeTeste();
  const recarga=criarRecargaAgrupada(r.recarregar,1500,10000,t.relogio);
  recarga.pedir(); t.andar(1500);
  r.chamadas[0].reject(new Error('banco fora')); await respiro();
  recarga.pedir(); t.andar(1500);
  assert.equal(r.chamadas.length,2);
});

test('cancelar desiste do que estava agendado e do que chegaria depois',async()=>{
  const t=relogioDeTeste(); const r=recargaDeTeste();
  const recarga=criarRecargaAgrupada(r.recarregar,1500,10000,t.relogio);
  recarga.pedir(); recarga.cancelar();
  t.andar(60000);
  assert.equal(r.chamadas.length,0);
  assert.equal(t.pendentes(),0);
  recarga.pedir(); t.andar(60000);
  assert.equal(r.chamadas.length,0,'depois de cancelar (painel fechado) não recarrega mais');

  // Cancelar no meio de uma recarga: o que chegou durante não vira outra.
  const t2=relogioDeTeste(); const r2=recargaDeTeste();
  const outra=criarRecargaAgrupada(r2.recarregar,1500,10000,t2.relogio);
  outra.pedir(); t2.andar(1500);
  outra.pedir(); outra.cancelar();
  r2.chamadas[0].resolve(true); await respiro();
  t2.andar(60000);
  assert.equal(r2.chamadas.length,1);
});
