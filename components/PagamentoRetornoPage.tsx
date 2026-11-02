import React from 'react';
import { Loader2, AlertCircle, CreditCard, Home, MessageCircle } from 'lucide-react';
import { consultarPagamento, pagamentoAprovado, pagamentoRecusado, type SituacaoPagamento } from '../services/pagamentoCartao';
import { linkPagamentoReserva } from '../services/cieloPaymentLink';

interface PagamentoRetornoPageProps {
    reservationId: string;
    /** Chamado uma única vez, quando a Cielo confirma o pagamento. */
    onAprovado: () => void;
    onGoHome: () => void;
}

const WHATSAPP = 'https://wa.me/5591981000800';
// A Cielo pode demorar a registrar o pagamento que o cliente acabou de fazer.
const INTERVALO_MS = 4000;
const TENTATIVAS = 30; // ~2 minutos

export const PagamentoRetornoPage: React.FC<PagamentoRetornoPageProps> = ({ reservationId, onAprovado, onGoHome }) => {
    const [situacao, setSituacao] = React.useState<SituacaoPagamento | null>(null);
    const [desfecho, setDesfecho] = React.useState<'conferindo' | 'recusado' | 'demorou' | 'erro'>('conferindo');
    const avisado = React.useRef(false);

    React.useEffect(() => {
        let vivo = true;
        let tentativas = 0;

        const conferir = async () => {
            const p = await consultarPagamento(reservationId);
            if (!vivo) return;
            if (p === 'erro') {
                // Uma falha de rede não condena o pagamento: segue tentando.
                if (++tentativas >= TENTATIVAS) setDesfecho('erro');
                else setTimeout(conferir, INTERVALO_MS);
                return;
            }
            setSituacao(p);
            if (pagamentoAprovado(p)) {
                if (!avisado.current) { avisado.current = true; onAprovado(); }
                return;
            }
            if (pagamentoRecusado(p)) { setDesfecho('recusado'); return; }
            if (++tentativas >= TENTATIVAS) { setDesfecho('demorou'); return; }
            setTimeout(conferir, INTERVALO_MS);
        };

        conferir();
        return () => { vivo = false; };
    }, [reservationId, onAprovado]);

    const Moldura: React.FC<{ children: React.ReactNode }> = ({ children }) => (
        <div className="max-w-2xl mx-auto px-4 py-12 text-center animate-in fade-in duration-500">
            <div className="bg-white p-8 md:p-12 rounded-[2rem] shadow-2xl border border-solar-gold/10 space-y-8">
                {children}
            </div>
        </div>
    );

    if (desfecho === 'conferindo') {
        return (
            <Moldura>
                <div className="w-20 h-20 bg-solar-gold/5 rounded-full flex items-center justify-center mx-auto border-2 border-solar-gold/20">
                    <Loader2 size={40} className="text-solar-gold animate-spin" />
                </div>
                <div className="space-y-3">
                    <h2 className="text-3xl md:text-4xl font-serif text-solar-green">Confirmando seu pagamento</h2>
                    <p className="text-slate-400 text-xs uppercase tracking-widest">Não feche esta página</p>
                </div>
                <p className="text-sm text-slate-500">
                    Estamos conferindo com a Cielo. Assim que o pagamento for aprovado, sua reserva aparece aqui confirmada, com o número de protocolo.
                </p>
                {situacao?.texto && <p className="text-[11px] uppercase tracking-widest text-slate-400">{situacao.texto}</p>}
            </Moldura>
        );
    }

    const recusado = desfecho === 'recusado';
    const titulo = recusado ? 'Pagamento não concluído' : desfecho === 'erro' ? 'Não conseguimos conferir agora' : 'Pagamento ainda em análise';
    const explicacao = recusado
        ? 'A Cielo não aprovou este pagamento, então a reserva ainda não está garantida. Você pode tentar de novo agora — nada foi cobrado.'
        : desfecho === 'erro'
            ? 'Não conseguimos falar com a Cielo para confirmar. Se você pagou, não pague de novo: fale com a recepção que conferimos para você.'
            : 'A Cielo ainda não finalizou a análise deste pagamento. Se você pagou, não pague de novo — assim que for aprovado, enviamos a confirmação por e-mail.';

    return (
        <Moldura>
            <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto border-2 border-amber-300">
                <AlertCircle size={40} className="text-amber-500" />
            </div>
            <div className="space-y-3">
                <h2 className="text-3xl md:text-4xl font-serif text-amber-700">{titulo}</h2>
                <p className="text-slate-400 text-xs uppercase tracking-widest">Reserva registrada · pagamento pendente</p>
            </div>
            <div className="bg-amber-50 border-2 border-amber-300 p-6 rounded-2xl text-left space-y-4">
                <div className="flex items-center gap-2 text-solar-green">
                    <CreditCard size={20} className="text-amber-500" />
                    <span className="text-xs font-bold uppercase tracking-widest">Sua reserva #{reservationId.slice(0, 8).toUpperCase()}</span>
                </div>
                <p className="text-sm text-slate-700">{explicacao}</p>
                {situacao?.texto && <p className="text-[11px] uppercase tracking-widest text-amber-700">{situacao.texto}</p>}
                {recusado && (
                    <a href={linkPagamentoReserva(reservationId)} className="block w-full text-center bg-solar-gold text-solar-green py-5 rounded-2xl font-bold uppercase tracking-widest hover:bg-solar-green hover:text-white transition-all text-sm shadow-lg">
                        Tentar o pagamento de novo
                    </a>
                )}
                <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full text-center border-2 border-solar-green text-solar-green py-4 rounded-2xl font-bold uppercase tracking-widest hover:bg-solar-green hover:text-white transition-all text-xs">
                    <MessageCircle size={16} /> Falar com a recepção
                </a>
            </div>
            <button onClick={onGoHome} className="w-full text-slate-400 hover:text-solar-green py-2 text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2">
                <Home size={14} /> Voltar ao início
            </button>
        </Moldura>
    );
};
