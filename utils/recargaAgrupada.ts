// Recarga do painel pedida pelo banco (Realtime), agrupada.
//
// O painel recarrega tudo (até 1.000 reservas, acomodações, pacotes) quando
// uma reserva ou uma acomodação muda no banco. Era uma recarga por mudança,
// sem limite: em 17/11/2026, 66 gravações de tarifa em um minuto viraram
// centenas de recargas ao mesmo tempo, o banco parou de responder por vários
// minutos (455 de 568 pedidos com tempo esgotado) e o ERP ficou lento junto.
//
// Aqui uma rajada de mudanças vira uma recarga só:
//   - espera um intervalo sem novas mudanças antes de recarregar;
//   - nunca roda duas recargas ao mesmo tempo; o que chegar durante uma
//     recarga vira uma única recarga depois dela;
//   - mudança contínua não adia para sempre: há um teto de espera.

export type RecargaAgrupada = {
  /** Avisa que algo mudou. Pode ser chamado quantas vezes for. */
  pedir: () => void;
  /** Desiste do que estava agendado (o painel foi fechado). */
  cancelar: () => void;
};

type Relogio = {
  agora: () => number;
  agendar: (fn: () => void, ms: number) => unknown;
  desagendar: (id: unknown) => void;
};

const RELOGIO_DO_NAVEGADOR: Relogio = {
  agora: () => Date.now(),
  agendar: (fn, ms) => setTimeout(fn, ms),
  desagendar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export function criarRecargaAgrupada(
  recarregar: () => Promise<unknown>,
  esperaMs = 1500,
  esperaMaximaMs = 10_000,
  relogio: Relogio = RELOGIO_DO_NAVEGADOR,
): RecargaAgrupada {
  let agendada: unknown = null;
  let primeiroPedidoEm: number | null = null;
  let emAndamento = false;
  let chegouDurante = false;
  let cancelada = false;

  const rodar = async () => {
    agendada = null;
    primeiroPedidoEm = null;
    emAndamento = true;
    try {
      await recarregar();
    } catch {
      // Quem recarrega já registra a própria falha; a próxima mudança tenta de novo.
    } finally {
      emAndamento = false;
      if (chegouDurante && !cancelada) {
        chegouDurante = false;
        pedir();
      }
    }
  };

  function pedir() {
    if (cancelada) return;
    if (emAndamento) { chegouDurante = true; return; }
    const agora = relogio.agora();
    if (primeiroPedidoEm === null) primeiroPedidoEm = agora;
    if (agendada !== null) relogio.desagendar(agendada);
    const restante = esperaMaximaMs - (agora - primeiroPedidoEm);
    agendada = relogio.agendar(() => { void rodar(); }, Math.max(0, Math.min(esperaMs, restante)));
  }

  const cancelar = () => {
    cancelada = true;
    chegouDurante = false;
    if (agendada !== null) relogio.desagendar(agendada);
    agendada = null;
  };

  return { pedir, cancelar };
}
