// Mapa de tarifas: o que a célula grava e como a mudança de um dia entra
// na lista de ajustes da acomodação.
//
// A célula gravava no banco a cada tecla e a cada passo da rodinha do mouse:
// digitar "910" punha a diária à venda por R$ 9 e por R$ 91 no caminho, e
// rolar a página com o cursor em cima do campo mudava o preço sem ninguém
// ver (em 17/11/2026 o LOFT ficou em R$ 911 assim). Agora o que se digita é
// um rascunho, gravado só ao terminar (Enter ou sair do campo).

import type { RoomDateOverride } from '../types';

/**
 * O número a gravar quando a edição termina, ou null se não há o que gravar:
 * nada foi digitado, o campo ficou vazio, o valor não é um número válido ou
 * é igual ao que já estava.
 */
export function valorParaGravar(rascunho: string | null, atual: unknown): number | null {
  if (rascunho === null) return null;
  const texto = rascunho.trim().replace(',', '.');
  if (texto === '') return null;
  const numero = Number(texto);
  if (!Number.isFinite(numero) || numero < 0) return null;
  if (atual !== undefined && atual !== null && atual !== '' && numero === Number(atual)) return null;
  return numero;
}

/**
 * A lista de ajustes com a mudança de um único dia aplicada. Os outros dias
 * ficam exatamente como vieram, e no dia alterado só mudam os campos pedidos:
 * quem grava parte da lista que está no banco naquele instante, e assim não
 * desfaz o estoque que uma reserva acabou de baixar em outro dia (ou no
 * mesmo dia, se a mudança é só de preço).
 */
export function aplicarDiaNoMapa(
  ajustes: unknown,
  dateIso: string,
  campos: Partial<RoomDateOverride>,
  padrao: { price: number; availableQuantity: number },
): RoomDateOverride[] {
  const lista: RoomDateOverride[] = Array.isArray(ajustes) ? ajustes.filter(a => a && typeof a === 'object') : [];
  const { dateIso: _ignorado, ...mudancas } = campos;
  const indice = lista.findIndex(a => a.dateIso === dateIso);
  if (indice >= 0) {
    return lista.map((a, i) => (i === indice ? { ...a, ...mudancas } : a));
  }
  return [
    ...lista,
    { dateIso, price: padrao.price, availableQuantity: padrao.availableQuantity, isClosed: false, ...mudancas },
  ];
}
