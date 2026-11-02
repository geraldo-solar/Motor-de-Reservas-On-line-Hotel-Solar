// Situação do pagamento no cartão, conferida pelo ERP direto na Cielo.
// É esta consulta que decide se o hóspede vê a reserva confirmada: o aviso
// da Cielo não é assinado, então ninguém confia no que volta pela URL.
import { ERP_URL } from './cieloPaymentLink';

export type SituacaoPagamento = {
    situacao: string;
    texto: string;
    divergencia: string | null;
    pagoCentavos: number | null;
    esperadoCentavos: number;
    parcelas: number | null;
    bandeira: string | null;
    final: string | null;
};

/** A Cielo ainda não decidiu: vale perguntar de novo daqui a pouco. */
const EM_ABERTO = new Set(['aguardando', 'pendente', 'autorizado', 'desconhecido', 'nao_finalizado']);
/** A Cielo decidiu que não houve pagamento: não adianta esperar mais. */
const RECUSADO = new Set(['negado', 'expirado', 'cancelado']);

export const pagamentoAprovado = (p: SituacaoPagamento | null) =>
    Boolean(p && p.situacao === 'pago' && !p.divergencia);

export const pagamentoRecusado = (p: SituacaoPagamento | null) =>
    Boolean(p && RECUSADO.has(p.situacao));

export const pagamentoEmAberto = (p: SituacaoPagamento | null) =>
    p === null || Boolean(p && EM_ABERTO.has(p.situacao));

/** `null` = a Cielo ainda não registrou tentativa; `'erro'` = consulta falhou. */
export async function consultarPagamento(reservationId: string): Promise<SituacaoPagamento | null | 'erro'> {
    try {
        const r = await fetch(`${ERP_URL}/api/reservas/pagamento-cartao?reservationId=${encodeURIComponent(reservationId)}`);
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d?.ok !== true) return 'erro';
        return (d?.pagamento ?? null) as SituacaoPagamento | null;
    } catch {
        return 'erro';
    }
}
