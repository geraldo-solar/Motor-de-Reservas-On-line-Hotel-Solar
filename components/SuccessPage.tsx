import React from 'react';
import { CheckCircle, QrCode, Copy, CreditCard, Home } from 'lucide-react';
import { Reservation } from '../types';

interface SuccessPageProps {
    reservation: Reservation;
    onGoHome: () => void;
    onCopyPix: (code: string) => void;
}

export const SuccessPage: React.FC<SuccessPageProps> = ({ reservation, onGoHome, onCopyPix }) => {
    return (
        <div className="max-w-2xl mx-auto px-4 py-12 text-center animate-in fade-in slide-in-from-bottom-12 duration-700">
            <div className="bg-white p-8 md:p-12 rounded-[2rem] shadow-2xl border border-solar-gold/10 space-y-8">
                <div className="w-20 h-20 bg-solar-gold/5 rounded-full flex items-center justify-center mx-auto border-2 border-solar-gold/20">
                    <CheckCircle size={40} className="text-solar-gold" />
                </div>
                <div className="space-y-3">
                    <h2 className="text-3xl md:text-4xl font-serif text-solar-green">Reserva Confirmada!</h2>
                    <p className="text-slate-400 text-xs uppercase tracking-widest">Prepare as malas, o sol te espera</p>
                </div>
                <div className="bg-solar-green/5 p-6 rounded-2xl border border-solar-green/10">
                    <span className="text-[9px] uppercase tracking-[0.3em] font-bold text-slate-400 block mb-2">Protocolo de Reserva</span>
                    <span className="text-2xl md:text-3xl font-serif text-solar-gold tracking-widest block mb-4">{reservation.id}</span>
                    <div className="pt-4 border-t border-solar-green/10">
                        <span className="text-[9px] uppercase tracking-[0.3em] font-bold text-slate-400 block mb-1">Total da Reserva</span>
                        <span className="text-2xl font-serif text-solar-green">R$ {reservation.totalPrice.toLocaleString('pt-BR')}</span>
                    </div>
                </div>

                {/* Seção de Pagamento PIX */}
                {reservation.paymentMethod === 'PIX' && (
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

                {/* Seção de Pagamento Cartão */}
                {reservation.paymentMethod === 'CREDIT_CARD' && reservation.cardDetails && (
                    <div className="bg-solar-green/5 p-6 rounded-2xl border border-solar-green/10 text-left space-y-3">
                        <div className="flex items-center gap-2 text-solar-green">
                            <CreditCard size={20} className="text-solar-gold" />
                            <span className="text-xs font-bold uppercase tracking-widest">Pagamento via Cartão de Crédito</span>
                        </div>
                        <p className="text-sm text-slate-600">Seu pagamento será processado em até <strong>{reservation.cardDetails.installments}x</strong> no cartão final <strong>****{reservation.cardDetails.number.slice(-4)}</strong>.</p>
                    </div>
                )}

                <button onClick={onGoHome} className="w-full bg-solar-green text-white py-4 rounded-2xl font-bold uppercase tracking-widest hover:bg-solar-gold transition-all flex items-center justify-center gap-3 shadow-xl text-sm">
                    <Home size={18} /> Voltar ao Início
                </button>
            </div>
        </div>
    );
};
