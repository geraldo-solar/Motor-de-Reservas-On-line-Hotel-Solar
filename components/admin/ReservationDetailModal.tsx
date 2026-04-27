import React from 'react';
import { X, Check, Edit2, MessageSquare, Mail, Phone, Calendar, Clock, CreditCard, ChevronRight, User, AlertTriangle, ArrowRight, Send, Type, QrCode, Plus, Users } from 'lucide-react';
import { Reservation, ReservationStatus } from '../../types';
import { sendPaymentConfirmedEmail, sendReservationCanceledEmail } from '../../services/emailService';
import { formatDisplayDate, formatDisplayDateTime } from '../../utils/dateUtils';

interface ReservationDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    reservation: Reservation | null;
    onUpdateStatus: (id: string, status: ReservationStatus, reason?: string) => Promise<boolean | void> | void;
    onUpdateReservation: (id: string, updates: Partial<Reservation>) => Promise<boolean>;
}

const getShortReservationId = (id: string): string => {
    if (!id) return '---';
    return id.replace('RES-', '').replace(/-/g, '').substring(0, 8).toUpperCase();
};

export const ReservationDetailModal: React.FC<ReservationDetailModalProps> = ({
    isOpen,
    onClose,
    reservation,
    onUpdateStatus,
    onUpdateReservation
}) => {
    const [localError, setLocalError] = React.useState<string | null>(null);

    const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
    const [isEditingPrice, setIsEditingPrice] = React.useState(false);
    const [priceInput, setPriceInput] = React.useState('');
    const [optimisticPaid, setOptimisticPaid] = React.useState<number | null>(null);

    // Reset optimistic state when reservation changes
    React.useEffect(() => {
        setOptimisticPaid(null);
    }, [reservation?.id]);

    const currentPaid = optimisticPaid ?? reservation?.amountPaid ?? 0;

    const [confirmType, setConfirmType] = React.useState<'CONFIRM' | 'CANCEL' | null>(null);
    const [cancelReason, setCancelReason] = React.useState<string>('');

    const executeAction = async (type: 'CONFIRM' | 'CANCEL', e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!reservation) return;
        const btn = e.currentTarget as HTMLButtonElement;
        const originalContent = btn.innerHTML;

        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin mr-2">⏳</span> Processando...';
        setLocalError(null);
        setSuccessMessage(null);

        try {
            if (type === 'CONFIRM') {
                // FORCE: Use optimistic data for the email to prevent race conditions
                const effectiveReservation = { ...reservation, amountPaid: currentPaid };
                const emailRes = await sendPaymentConfirmedEmail(effectiveReservation);

                const statusRes = await onUpdateStatus(reservation.id, 'CONFIRMED');
                if (statusRes) {
                    setSuccessMessage('Pagamento confirmado e e-mail enviado com sucesso!');
                    if (!emailRes.success) setLocalError('Confirmado no banco, mas e-mail falhou: ' + emailRes.error);
                } else {
                    setLocalError('Erro ao atualizar no banco de dados.');
                }
            } else {
                await sendReservationCanceledEmail(reservation, cancelReason);
                const statusRes = await onUpdateStatus(reservation.id, 'CANCELED', cancelReason);
                if (statusRes) {
                    setSuccessMessage('Reserva cancelada e e-mail enviado.');
                } else {
                    setLocalError('Erro ao cancelar no banco de dados.');
                }
            }
            setConfirmType(null);
            setCancelReason('');
        } catch (err: any) {
            console.error('[Admin] Erro:', err);
            setLocalError('Erro técnico: ' + (err.message || String(err)));
        } finally {
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }
    };

    if (!isOpen || !reservation) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-[#D4AF37] animate-in zoom-in">
                <div className="bg-[#0F2820] p-5 text-[#D4AF37] flex justify-between items-center border-b border-[#D4AF37]/20">
                    <h3 className="font-serif font-bold tracking-widest uppercase text-lg">Detalhes da Reserva #{getShortReservationId(reservation.id)}</h3>
                    <button onClick={() => { setLocalError(null); setSuccessMessage(null); onClose(); }} className="hover:rotate-90 transition-transform"><X size={24} /></button>
                </div>
                <div className="p-8 space-y-6 overflow-y-auto max-h-[80vh]">
                    {localError && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs font-bold animate-in slide-in-from-top-2">
                            ⚠️ {localError}
                        </div>
                    )}

                    {successMessage && (
                        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-xs font-bold animate-in slide-in-from-top-2">
                            ✅ {successMessage}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-bold text-gray-400 uppercase border-b pb-1 tracking-widest">Dados do Hóspede</h4>
                            <p className="text-sm font-bold text-[#0F2820]">{reservation.mainGuest.name || "Não Informado"}</p>
                            {reservation.companyName && (
                                <p className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200 uppercase tracking-widest inline-flex items-center gap-1 mt-1">
                                    🏢 EMPRESA: {reservation.companyName}
                                </p>
                            )}
                            <div className="space-y-2 mt-2">
                                <p className="text-xs text-slate-500 flex items-center gap-2 bg-slate-50 p-2 rounded-lg"><Mail size={12} className="text-solar-gold" /> {reservation.mainGuest.email}</p>
                                <p className="text-xs text-slate-500 flex items-center gap-2 bg-slate-50 p-2 rounded-lg"><Send size={12} className="text-solar-gold" /> {reservation.mainGuest.phone}</p>
                                <p className="text-xs text-slate-500 flex items-center gap-2 bg-slate-50 p-2 rounded-lg"><Type size={12} className="text-solar-gold" /> CPF: {reservation.mainGuest.cpf}</p>
                            </div>
                            
                            {reservation.additionalGuests && reservation.additionalGuests.length > 0 && (
                                <div className="mt-4 border-t border-slate-100 pt-3">
                                    <h5 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Users size={10} /> Acompanhantes</h5>
                                    <div className="flex flex-col gap-1.5">
                                        {reservation.additionalGuests.map((guest, i) => {
                                            const guestType = (guest as any).type || (guest as any).age || '';
                                            return (
                                                <div key={i} className="flex justify-between items-center bg-slate-50 border border-slate-100 p-2 rounded-md text-xs">
                                                    <span className="font-bold text-slate-700">{guest.name || "Sem nome"}</span>
                                                    {guestType && (
                                                        <span className="text-[9px] font-bold bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded uppercase">{String(guestType)}</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-bold text-gray-400 uppercase border-b pb-1 tracking-widest">Período de Estadia</h4>
                            <div className="bg-gray-50 p-4 rounded-xl flex items-center justify-between border border-gray-100 shadow-inner">
                                <div>
                                    <span className="block text-[8px] font-black text-gray-400 uppercase mb-1">Check-in</span>
                                    <span className="text-sm font-bold text-solar-green">{formatDisplayDate(reservation.checkIn)}</span>
                                </div>
                                <div className="bg-white p-2 rounded-full shadow-sm border border-gray-100">
                                    <ArrowRight size={14} className="text-solar-gold" />
                                </div>
                                <div className="text-right">
                                    <span className="block text-[8px] font-black text-gray-400 uppercase mb-1">Check-out</span>
                                    <span className="text-sm font-bold text-solar-green">{formatDisplayDate(reservation.checkOut)}</span>
                                </div>
                            </div>
                            <div className="flex justify-center">
                                <span className="bg-solar-gold/10 text-solar-gold px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border border-solar-gold/20">
                                    {reservation.nights} {reservation.nights === 1 ? 'Noite' : 'Noites'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                        <h4 className="text-[10px] font-bold text-gray-400 uppercase border-b border-slate-200 pb-2 tracking-widest">Resumo Financeiro</h4>
                        <div className="space-y-2">
                            {reservation.rooms.map((room, i) => (
                                <div key={i} className="flex justify-between text-xs py-2 border-b border-slate-100">
                                    <span className="font-medium text-slate-600">{room.name}</span>
                                    <span className="font-bold text-[#0F2820]">R$ {room.priceSnapshot.toLocaleString()}</span>
                                </div>
                            ))}
                            {reservation.extras.map((extra, i) => (
                                <div key={i} className="flex justify-between text-xs py-2 border-b border-slate-100 text-slate-500 italic">
                                    <span>{extra.name} (x{extra.quantity})</span>
                                    <span className="font-bold">R$ {(extra.priceSnapshot * extra.quantity).toLocaleString()}</span>
                                </div>
                            ))}
                            {reservation.discountApplied && (
                                <div className="flex justify-between text-xs py-2 border-b border-slate-100 text-green-600 font-bold bg-green-50 px-2 rounded">
                                    <span>Desconto ({reservation.discountApplied.code})</span>
                                    <span>- R$ {reservation.discountApplied.amount.toLocaleString()}</span>
                                </div>
                            )}
                            {reservation.packageDiscountApplied && (
                                <div className="flex justify-between text-xs py-2 border-b border-slate-100 text-solar-gold font-bold bg-solar-gold/5 px-2 rounded">
                                    <span>Desconto de Pacote ({reservation.packageDiscountApplied.percentage}%)</span>
                                    <span>- R$ {reservation.packageDiscountApplied.amount.toLocaleString()}</span>
                                </div>
                            )}

                            <div className="flex justify-between items-center pt-4 border-t border-slate-200 mt-2">
                                <span className="font-serif font-bold text-lg text-[#0F2820]">Total da Reserva</span>
                                <span className="font-serif font-bold text-2xl text-solar-gold">R$ {reservation.totalPrice.toLocaleString()}</span>
                            </div>

                            <div className="flex flex-col gap-2 pt-2">
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-xs uppercase tracking-widest text-slate-500">Histórico de Pagamentos</span>
                                    {!isEditingPrice && (
                                        <button
                                            onClick={() => {
                                                setPriceInput('');
                                                setIsEditingPrice(true);
                                            }}
                                            className="text-[10px] bg-solar-gold/10 text-solar-gold px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider hover:bg-solar-gold hover:text-white transition-all flex items-center gap-1"
                                        >
                                            <Plus size={12} /> Adicionar Pagamento
                                        </button>
                                    )}
                                </div>

                                {/* Lista de Pagamentos (Histórico) */}
                                <div className="space-y-1 my-2">
                                    {reservation.paymentHistory && reservation.paymentHistory.length > 0 ? (
                                        reservation.paymentHistory.map((payment, idx) => (
                                            <div key={idx} className="flex justify-between items-center text-xs bg-slate-50 p-2 rounded border border-slate-100">
                                                <span className="text-slate-500">{formatDisplayDate(payment.date)}</span>
                                                <span className="font-bold text-slate-700">R$ {payment.amount.toLocaleString()}</span>
                                            </div>
                                        ))
                                    ) : (
                                        // Fallback para reservas antigas sem histórico (mostra apenas o total se > 0)
                                        currentPaid > 0 && (
                                            <div className="flex justify-between items-center text-xs bg-slate-50 p-2 rounded border border-slate-100 italic">
                                                <span className="text-slate-400">Pagamento inicial (sem data)</span>
                                                <span className="font-bold text-slate-700">R$ {currentPaid.toLocaleString()}</span>
                                            </div>
                                        )
                                    )}
                                    {(!reservation.paymentHistory?.length && currentPaid === 0) && (
                                        <p className="text-[10px] text-slate-400 italic text-center py-2">Nenhum pagamento registrado.</p>
                                    )}
                                </div>

                                {/* Total Pago */}
                                <div className="flex justify-between items-center border-t border-slate-100 pt-2">
                                    <span className="font-bold text-xs text-slate-600">Total Pago</span>
                                    <span className={`font-bold text-lg ${currentPaid >= reservation.totalPrice ? 'text-green-600' : 'text-slate-700'}`}>
                                        R$ {currentPaid.toLocaleString()}
                                    </span>
                                </div>

                                {/* Formulário de Adição */}
                                {isEditingPrice && (
                                    <div className="flex flex-col gap-3 w-full animate-in fade-in bg-slate-50 p-4 rounded-xl border border-slate-200 mt-2">
                                        <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                Valor do Novo Pagamento
                                            </span>
                                            <button
                                                onClick={() => {
                                                    const pending = reservation.totalPrice - currentPaid;
                                                    setPriceInput(pending > 0 ? pending.toString() : '');
                                                }}
                                                className="text-[9px] bg-green-100 text-green-700 px-3 py-1.5 rounded-full font-bold uppercase tracking-wider hover:bg-green-200 transition-colors flex items-center gap-1"
                                            >
                                                Completar Restante
                                            </button>
                                        </div>

                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">R$</span>
                                            <input
                                                autoFocus
                                                type="number"
                                                className="w-full bg-white border-2 border-solar-gold/30 rounded-lg pl-10 pr-4 py-3 text-xl font-bold text-slate-700 focus:outline-none focus:border-solar-gold focus:ring-4 focus:ring-solar-gold/10 transition-all placeholder:text-slate-200"
                                                placeholder="0,00"
                                                value={priceInput}
                                                onChange={(e) => setPriceInput(e.target.value)}
                                            />
                                        </div>

                                        <div className="flex items-center justify-end gap-3 pt-1">
                                            <button
                                                onClick={() => {
                                                    setIsEditingPrice(false);
                                                    setPriceInput('');
                                                }}
                                                className="text-xs text-slate-400 hover:text-slate-600 font-bold uppercase tracking-wider px-3 py-2"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    const val = parseFloat(priceInput);
                                                    if (!isNaN(val) && val > 0) {
                                                        const newTotal = currentPaid + val;
                                                        const newHistory = [
                                                            ...(reservation.paymentHistory || []),
                                                            { 
                                                                date: new Date().toISOString(), 
                                                                amount: val,
                                                                method: reservation.paymentMethod === 'CREDIT_CARD' ? 'Cartão de Crédito' : 'PIX',
                                                                transaction_info: reservation.paymentMethod === 'CREDIT_CARD' && reservation.cardDetails ? `Aprovado via Motor de Reservas (${reservation.cardDetails.installments}x)` : 'Confirmado via Motor de Reservas'
                                                            }
                                                        ];

                                                        // Se não tinha histórico mas tinha valor, adiciona o valor antigo como entrada inicial
                                                        if ((!reservation.paymentHistory || reservation.paymentHistory.length === 0) && currentPaid > 0) {
                                                            newHistory.unshift({ 
                                                                date: reservation.createdAt.toISOString(), 
                                                                amount: currentPaid,
                                                                method: reservation.paymentMethod === 'CREDIT_CARD' ? 'Cartão de Crédito' : 'PIX',
                                                                transaction_info: 'Pagamento Inicial'
                                                            });
                                                        }

                                                        // 1. Update Amount & History
                                                        const success = await onUpdateReservation(reservation.id, {
                                                            amountPaid: newTotal,
                                                            paymentHistory: newHistory
                                                        });

                                                        if (success) {
                                                            try {
                                                                // 2. Send Email
                                                                const effectiveReservation = {
                                                                    ...reservation,
                                                                    amountPaid: newTotal,
                                                                    paymentHistory: newHistory
                                                                };
                                                                await sendPaymentConfirmedEmail(effectiveReservation);

                                                                // 3. Confirm Status (se ainda não estiver)
                                                                if (reservation.status !== 'CONFIRMED') {
                                                                    await onUpdateStatus(reservation.id, 'CONFIRMED');
                                                                }

                                                                setSuccessMessage("Novo pagamento registrado e notificado!");
                                                                setIsEditingPrice(false);
                                                                setOptimisticPaid(newTotal);
                                                                setTimeout(() => setSuccessMessage(null), 4000);
                                                            } catch (err) {
                                                                console.error("Erro no fluxo de novo pagamento:", err);
                                                                setLocalError("Pagamento salvo, mas erro ao enviar e-mail.");
                                                            }
                                                        } else {
                                                            setLocalError("Erro ao salvar pagamento. Tente novamente.");
                                                        }
                                                    }
                                                }}
                                                className="bg-green-600 text-white px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-green-700 shadow-lg active:scale-95 transition-all flex items-center gap-2"
                                            >
                                                <Check size={16} /> Registrar & Enviar
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Mostrar saldo devedor se houver */}
                            {(() => {
                                const effectivePaid = isEditingPrice
                                    ? currentPaid + (parseFloat(priceInput) || 0)
                                    : currentPaid;
                                const pending = reservation.totalPrice - effectivePaid;

                                return pending > 0 ? (
                                    <div className="flex justify-end pt-1">
                                        <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">
                                            Pendente: R$ {pending.toLocaleString()}
                                        </span>
                                    </div>
                                ) : null;
                            })()}
                        </div>
                    </div>

                    {reservation.observations && (
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-bold text-gray-400 uppercase border-b pb-1 flex items-center gap-2"><MessageSquare size={12} /> Observações do Cliente</h4>
                            <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 shadow-sm">
                                <p className="text-sm text-gray-700 italic">"{reservation.observations}"</p>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-inner">
                            <span className="block text-[8px] font-bold text-gray-400 uppercase mb-3 tracking-widest">Método de Pagamento</span>
                            <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200">
                                {reservation.paymentMethod === 'PIX' ? <QrCode size={24} className="text-solar-gold" /> : <CreditCard size={24} className="text-solar-gold" />}
                                <span className="text-xs font-bold uppercase tracking-[0.2em]">{reservation.paymentMethod}</span>
                            </div>
                            {reservation.cardDetails && (
                                <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
                                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Dados do Cartão</p>
                                    <div className="grid grid-cols-1 gap-1 text-[11px] text-slate-600">
                                        <p><span className="font-bold">Titular:</span> {reservation.cardDetails.holderName}</p>
                                        <p><span className="font-bold">Número:</span> {reservation.cardDetails.number}</p>
                                        <p><span className="font-bold">Expiração:</span> {reservation.cardDetails.expiry}</p>
                                        <p className="text-red-500"><span className="font-bold">CVV:</span> {reservation.cardDetails.cvv}</p>
                                        <p className="text-[#0F2820] bg-solar-gold/10 p-2 rounded-lg mt-2 font-bold text-center">Parcelamento: {reservation.cardDetails.installments}x</p>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex flex-col justify-between">
                            <div>
                                <span className="block text-[8px] font-bold text-gray-400 uppercase mb-4 tracking-widest">Alterar Status da Reserva</span>
                                <div className="flex flex-col gap-3">
                                    {confirmType === null ? (
                                        <>
                                            {/* Botão de confirmar removido conforme solicitação de unificação */}
                                            <button
                                                type="button"
                                                onClick={() => setConfirmType('CANCEL')}
                                                className={`w-full py-3.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2 ${reservation.status === 'CANCELED' ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700 active:scale-95'}`}
                                                disabled={reservation.status === 'CANCELED' || !!successMessage}
                                            >
                                                Cancelar Reserva
                                            </button>
                                        </>
                                    ) : (
                                        <div className="bg-white p-4 rounded-xl border-2 border-solar-gold/30 animate-in zoom-in-95">
                                            <p className="text-[10px] font-bold text-center mb-3 uppercase tracking-widest text-[#0F2820]">
                                                {confirmType === 'CONFIRM' ? 'Confirmar pagamento e enviar e-mail?' : 'Confirmar cancelamento da reserva?'}
                                            </p>

                                            {confirmType === 'CANCEL' && (
                                                <div className="mb-4">
                                                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Motivo do Cancelamento</label>
                                                    <textarea
                                                        value={cancelReason}
                                                        onChange={(e) => setCancelReason(e.target.value)}
                                                        placeholder="Ex: Pagamento não identificado / Cliente desistiu..."
                                                        className="w-full h-20 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs outline-none focus:border-solar-gold transition-all resize-none"
                                                    />
                                                </div>
                                            )}

                                            <div className="flex gap-2">
                                                <button
                                                    onClick={(e) => executeAction(confirmType, e)}
                                                    className="flex-1 py-3 bg-solar-green text-white rounded-lg text-[10px] font-bold uppercase px-2 hover:bg-green-700 transition-colors"
                                                >
                                                    Sim, Continuar
                                                </button>
                                                <button
                                                    onClick={() => setConfirmType(null)}
                                                    className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase hover:bg-slate-200 transition-colors"
                                                >
                                                    Não, Voltar
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-200">
                                <span className="text-[9px] text-slate-400 italic block text-center">Efetuada em: {formatDisplayDateTime(reservation.createdAt)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
