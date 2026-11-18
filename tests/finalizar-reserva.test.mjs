import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

// Do clique em "Finalizar Reserva Agora" até a página da Cielo (17/11/2026).
// O hóspede ficava de 12 a 20 segundos esperando, e durante boa parte deles o
// botão parecia parado: quem clicava de novo achava que só o segundo clique
// funcionava. O comportamento do botão é conferido no navegador; aqui ficam
// as duas regras do código que não podem voltar atrás.

const trecho=(arquivo,inicio,fim)=>{
  const texto=readFileSync(arquivo,'utf8');
  const i=texto.indexOf(inicio); const j=texto.indexOf(fim,i+inicio.length);
  assert.ok(i>=0&&j>i,`${arquivo}: trecho "${inicio}" não encontrado`);
  return texto.slice(i,j);
};

test('gravar a reserva não espera recarregar os dados do site', ()=>{
  // A recarga baixa todas as acomodações e pacotes de novo (2,6 MB naquele
  // dia): eram vários segundos antes de pedir a página da Cielo.
  const gravar=trecho('hooks/useSupabaseData.ts','const saveReservationToSupabase','const updateReservation');
  assert.match(gravar,/gravarReservaDoSite\(reservation\)/);
  assert.doesNotMatch(gravar,/await\s+loadFromSupabase/);
});

test('o botão de finalizar fica ocupado do clique até a página mudar', ()=>{
  const formulario=readFileSync('components/BookingForm.tsx','utf8');
  const envio=trecho('components/BookingForm.tsx','const handleFinalSubmit','if (step === 1)');
  // Liga antes de mandar e só desliga se não deu certo.
  assert.match(envio,/setEnviando\(true\);\s*const success = await onAddReservation\(reservation\);/);
  assert.match(envio,/if \(!success\) \{[^}]*setEnviando\(false\)/);
  assert.match(formulario,/disabled=\{!agreedToPolicies \|\| isSaving \|\| enviando\}/);
});
