import type { DiscountCode, Reservation } from '../types';
import { mapReservationRow, mapReservations } from '../utils/mapReservation';

// O que o site público faz com reservas passa pelo servidor
// (api/check-reservation). O navegador não lê nem grava reservas, hóspedes,
// estoque ou cupons direto no banco (VEN-10, fase 2).

const ROTA = '/api/check-reservation';

async function pedir<T>(acao: string, dados: Record<string, unknown>): Promise<{ ok: true; dados: T } | { ok: false; erro: string; status: number }> {
  try {
    const r = await fetch(ROTA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao, ...dados }),
    });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, erro: corpo?.error || 'Não foi possível concluir agora. Tente de novo em instantes.', status: r.status };
    return { ok: true, dados: corpo as T };
  } catch {
    return { ok: false, erro: 'Sem conexão com o servidor. Confira a internet e tente de novo.', status: 0 };
  }
}

export type ReservaEncontrada = { reserva: Reservation | null; grupo: Reservation[] };

const ordenarPorQuarto = (lista: Reservation[]) =>
  [...lista].sort((a, b) => (a.rooms[0]?.name || '').localeCompare(b.rooms[0]?.name || ''));

function montar(dados: { reserva: any; grupo: any[] }): ReservaEncontrada {
  const grupo = ordenarPorQuarto(mapReservations(dados?.grupo || []));
  const reserva = dados?.reserva ? mapReservationRow(dados.reserva) : grupo[0] || null;
  return { reserva, grupo };
}

/** Pelo número completo (link do e-mail) ou pelo código curto + e-mail do hóspede. */
export async function buscarReserva(busca: { id: string } | { codigo: string; email: string }) {
  const r = await pedir<{ reserva: any; grupo: any[] }>('buscar', busca);
  return 'dados' in r ? { ok: true as const, ...montar(r.dados) } : r;
}

export function gravarReservaDoSite(reserva: Reservation) {
  return pedir<{ ok: true }>('criar', { reserva });
}

export async function cancelarReservaDoSite(id: string, quartos: number[] = [], extras: number[] = []) {
  const r = await pedir<{ tipo: 'total' | 'parcial'; reserva: any; cancelados?: { rooms?: string[]; extras?: string[] } }>('cancelar', { id, quartos, extras });
  if (!('dados' in r)) return r;
  return {
    ok: true as const,
    tipo: r.dados.tipo,
    reserva: r.dados.reserva ? mapReservationRow(r.dados.reserva) : null,
    cancelados: r.dados.cancelados,
  };
}

export function enviarPreCheckin(dados: {
  id: string;
  hospede: Record<string, unknown>;
  acompanhantes: Record<string, unknown>[];
  quartos: Array<{ id: string; main_guest: unknown; additional_guests: unknown[] }>;
}) {
  return pedir<{ ok: true }>('pre-checkin', dados);
}

export async function consultarCupom(codigo: string): Promise<DiscountCode | null> {
  const r = await pedir<{ cupom: DiscountCode }>('cupom', { codigo });
  return 'dados' in r ? r.dados.cupom : null;
}
