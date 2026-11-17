// Mapa de tarifas do painel: grava a mudança de um dia de uma acomodação.
//
// Antes a célula mandava a acomodação inteira, com a lista de ajustes que
// estava na tela. Se uma reserva tivesse baixado o estoque depois de a tela
// carregar, gravar um preço devolvia o estoque antigo. Aqui cada gravação lê
// a lista que está no banco naquele instante, muda só os campos pedidos
// daquele dia e grava só a lista.
//
// O estoque das reservas continua sendo do gatilho do banco
// (sync_inventory_from_reservation). Este arquivo é só para o que a pessoa
// altera à mão no mapa.

import type { RoomDateOverride } from '../types';
import { aplicarDiaNoMapa } from '../utils/celulaDoMapa';

// O pedaço do cliente do Supabase que esta gravação usa (o teste passa um de mentira).
type Banco = { from: (tabela: string) => any };

export async function gravarDiaNoBanco(
  banco: Banco,
  roomId: string,
  dateIso: string,
  campos: Partial<RoomDateOverride>,
): Promise<RoomDateOverride[]> {
  const { data, error } = await banco
    .from('room_types')
    .select('base_price, total_quantity, overrides')
    .eq('id', roomId)
    .single();
  if (error || !data) throw error || new Error('Acomodação não encontrada.');

  const overrides = aplicarDiaNoMapa(data.overrides, dateIso, campos, {
    price: data.base_price || 0,
    availableQuantity: data.total_quantity || 1,
  });

  const { error: erroAoGravar } = await banco.from('room_types').update({ overrides }).eq('id', roomId);
  if (erroAoGravar) throw erroAoGravar;
  return overrides;
}
