import React from 'react';
import { CheckCircle, QrCode, Copy, CreditCard, Home, Clock, ArrowRight } from 'lucide-react';
import { Reservation } from '../types';
import { linkPagamentoReserva } from '../services/cieloPaymentLink';

interface SuccessPageProps {
    reservation: Reservation;
    onGoHome: () => void;
    onCopyPix: (code: string) => void;
}

export const SuccessPage: React.FC<SuccessPageProps> = ({ reservation, onGoHome, onCopyPix }) => {
    // A reserva nasce PENDING e só vira CONFIRMED quando o dinheiro entra. Antes
    // desta tela dizer "Reserva Confirmada!" para todo mundo, o hóspede do cartão
    // saía achando que já tinha acabado e pagava dias depois — ou não pagava.
    const aguardandoPagamento = reservation.status !== 'CONFIRMED';
    const isCartao = reservation.paymentMethod === 'CREDIT_CARD';
    const isPix = reservation.paymentMethod === 'PIX';
    const valorFormatado = `R$ ${reservation.totalPrice.toLocaleString('pt-BR')}`;

    const titulo = !aguardandoPagamento
        ? 'Reserva Confirmada!'
        : isCartao
            ? 'Falta pagar para garantir sua reserva'
            : 'Falta o PIX para garantir sua reserva';

    const subtitulo = !aguardandoPagamento
        ? 'Prepare as malas, o sol te espera'
        : 'Reserva registrada · pagamento pendente';

    return (
        <div className="max-w-2xl mx-auto px-4 py-12 text-center animate-in fade-in slide-in-from-bottom-12 duration-700">
            <div className="bg-white p-8 md:p-12 rounded-[2rem] shadow-2xl border border-solar-gold/10 space-y-8">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto border-2 ${aguardandoPagamento ? 'bg-amber-50 border-amber-300' : 'bg-solar-gold/5 border-solar-gold/20'}`}>
                    {aguardandoPagamento
                        ? <Clock size={40} className="text-amber-500" />
                        : <CheckCircle size={40} className="text-solar-gold" />}
                </div>
                <div className="space-y-3">
                    <h2 className={`text-3xl md:text-4xl font-serif ${aguardandoPagamento ? 'text-amber-700' : 'text-solar-green'}`}>{titulo}</h2>
                    <p className="text-slate-400 text-xs uppercase tracking-widest">{subtitulo}</p>
                </div>

                {/* Seção de Pagamento Cartão — vem antes do protocolo: é o que falta fazer. */}
                {isCartao && (
                    <div className={`p-6 rounded-2xl text-left space-y-4 ${aguardandoPagamento ? 'bg-amber-50 border-2 border-amber-300' : 'bg-solar-green/5 border border-solar-green/10'}`}>
                        <div className="flex items-center gap-2 text-solar-green">
                            <CreditCard size={20} className={aguardandoPagamento ? 'text-amber-500' : 'text-solar-gold'} />
                            <span className="text-xs font-bold uppercase tracking-widest">Pagamento via Cartão de Crédito</span>
                        </div>
                        {!aguardandoPagamento ? (
                            <p className="text-sm text-slate-700">Pagamento confirmado. Nada mais a fazer por aqui — seu apartamento está bloqueado no seu nome.</p>
                        ) : reservation.checkoutUrl ? (
                            <>
                                <p className="text-sm text-slate-700">
                                    <strong className="text-amber-700">Sua reserva ainda não está garantida.</strong> O apartamento só fica bloqueado no seu nome depois que o pagamento for aprovado. Pague agora na página segura da Cielo, à vista ou em até <strong>{reservation.cardDetails?.maxInstallments || 1}x sem juros</strong>.
                                </p>
                                <a href={linkPagamentoReserva(reservation.id)} className="flex items-center justify-center gap-3 w-full text-center bg-solar-gold text-solar-green py-5 rounded-2xl font-bold uppercase tracking-widest hover:bg-solar-green hover:text-white transition-all text-sm shadow-lg">
                                    Pagar agora {valorFormatado}
                                    <ArrowRight size={18} />
                                </a>
                                <p className="text-[11px] text-slate-500">O link confere sua reserva antes de abrir a Cielo. O hotel não recebe os dados do seu cartão. O mesmo botão está no e-mail de confirmação, caso prefira pagar depois — mas a vaga só é sua após o pagamento.</p>
                            </>
                        ) : (
                            <p className="text-sm text-slate-700">
                                <strong className="text-amber-700">Sua reserva ainda não está garantida.</strong> Nossa equipe vai enviar o link para pagar no cartão pelo WhatsApp e pelo e-mail. O apartamento só fica bloqueado no seu nome depois do pagamento.
                            </p>
                        )}
                    </div>
                )}

                {/* Seção de Pagamento PIX */}
                {isPix && (
                    <div className="bg-[#FDF8F0] p-6 md:p-8 rounded-2xl border-2 border-dashed border-solar-gold/40 space-y-6">
                        <div className="flex flex-col items-center gap-3">
                            <QrCode size={40} className="text-solar-gold" />
                            <h3 className="text-2xl md:text-3xl font-serif text-solar-green">Pagamento via PIX</h3>
                            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-solar-gold">Aguardando transferência para confirmação</p>
                        </div>

                        <div className="text-left space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white p-4 rounded-xl border border-slate-100 col-span-2">
                                    <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400 block mb-1">Favorecido</span>
                                    <span className="text-sm font-bold text-solar-green">J Ramos Barros Hotelaria e Eventos Me</span>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-100">
                                    <span className="text-[9px] uppercase tracking-widest font-bold text-solar-gold block mb-1">Banco</span>
                                    <span className="text-sm font-bold text-solar-green">Caixa Econômica</span>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-100">
                                    <span className="text-[9px] uppercase tracking-widest font-bold text-solar-gold block mb-1">Agência</span>
                                    <span className="text-sm font-bold text-solar-green">3632</span>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-100">
                                    <span className="text-[9px] uppercase tracking-widest font-bold text-solar-gold block mb-1">Conta</span>
                                    <span className="text-sm font-bold text-solar-green">386-6</span>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-100">
                                    <span className="text-[9px] uppercase tracking-widest font-bold text-solar-gold block mb-1">Operação</span>
                                    <span className="text-sm font-bold text-solar-green">03</span>
                                </div>
                            </div>

                            <div className="text-center">
                                <span className="text-[10px] uppercase tracking-widest font-bold text-solar-gold block mb-3">Chave PIX (Celular)</span>
                                <div className="flex items-center justify-center gap-2">
                                    <div className="bg-solar-green text-white px-6 py-4 rounded-xl font-mono text-lg md:text-xl tracking-widest flex-1">
                                        91981000800
                                    </div>
                                    <button
                                        onClick={() => onCopyPix('91981000800')}
                                        className="bg-solar-gold text-solar-green p-4 rounded-xl hover:bg-solar-gold/80 transition-all"
                                    >
                                        <Copy size={20} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded-xl border border-solar-gold/20">
                            <p className="text-sm text-slate-600 italic">
                                <strong className="text-solar-green">Atenção:</strong> Após o pagamento, envie o comprovante para nosso WhatsApp para que possamos validar sua reserva.
                            </p>
                        </div>
                    </div>
                )}

                <div className="bg-solar-green/5 p-6 rounded-2xl border border-solar-green/10">
                    <span className="text-[9px] uppercase tracking-[0.3em] font-bold text-slate-400 block mb-2">Protocolo de Reserva</span>
                    <span className="text-2xl md:text-3xl font-serif text-solar-gold tracking-widest block mb-4">{reservation.id}</span>
                    <div className="pt-4 border-t border-solar-green/10">
                        <span className="text-[9px] uppercase tracking-[0.3em] font-bold text-slate-400 block mb-1">Total da Reserva</span>
                        <span className="text-2xl font-serif text-solar-green">{valorFormatado}</span>
                    </div>
                </div>

                {/* Com pagamento pendente, sair da página não pode competir com pagar. */}
                {aguardandoPagamento ? (
                    <button onClick={onGoHome} className="w-full text-slate-400 hover:text-solar-green py-2 text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2">
                        <Home size={14} /> Voltar ao início sem pagar agora
                    </button>
                ) : (
                    <button onClick={onGoHome} className="w-full bg-solar-green text-white py-4 rounded-2xl font-bold uppercase tracking-widest hover:bg-solar-gold transition-all flex items-center justify-center gap-3 shadow-xl text-sm">
                        <Home size={18} /> Voltar ao Início
                    </button>
                )}
            </div>
        </div>
    );
};
