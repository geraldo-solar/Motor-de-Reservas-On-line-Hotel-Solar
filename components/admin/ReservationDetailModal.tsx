import React from 'react';
import { X, Mail, Send, Type, ArrowRight, MessageSquare, QrCode, CreditCard, Edit2, Check } from 'lucide-react';
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
    const [localSuccess, setLocalSuccess] = React.useState<boolean>(false);

    const [isEditingPrice, setIsEditingPrice] = React.useState(false);
    const [priceInput, setPriceInput] = React.useState('');

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
        setLocalSuccess(false);

        try {
            if (type === 'CONFIRM') {
                const emailRes = await sendPaymentConfirmedEmail(reservation);
                const statusRes = await onUpdateStatus(reservation.id, 'CONFIRMED');
                if (statusRes) {
                    setLocalSuccess(true);
                    if (!emailRes.success) setLocalError('Confirmado no banco, mas e-mail falhou: ' + emailRes.error);
                } else {
                    setLocalError('Erro ao atualizar no banco de dados.');
                }
            } else {
                await sendReservationCanceledEmail(reservation, cancelReason);
                const statusRes = await onUpdateStatus(reservation.id, 'CANCELED', cancelReason);
                if (statusRes) {
                    setLocalSuccess(true);
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
                    <button onClick={() => { setLocalError(null); setLocalSuccess(false); onClose(); }} className="hover:rotate-90 transition-transform"><X size={24} /></button>
                </div>
                <div className="p-8 space-y-6 overflow-y-auto max-h-[80vh]">
                    {localError && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs font-bold animate-in slide-in-from-top-2">
                            ⚠️ {localError}
                        </div>
                    )}

                    {localSuccess && (
                        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-xs font-bold animate-in slide-in-from-top-2">
                            ✅ Operação realizada com sucesso! E-mail enviado.
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-bold text-gray-400 uppercase border-b pb-1 tracking-widest">Dados do Hóspede</h4>
                            <p className="text-sm font-bold text-[#0F2820]">{reservation.mainGuest.name}</p>
                            <div className="space-y-2">
                                <p className="text-xs text-slate-500 flex items-center gap-2 bg-slate-50 p-2 rounded-lg"><Mail size={12} className="text-solar-gold" /> {reservation.mainGuest.email}</p>
                                <p className="text-xs text-slate-500 flex items-center gap-2 bg-slate-50 p-2 rounded-lg"><Send size={12} className="text-solar-gold" /> {reservation.mainGuest.phone}</p>
                                <p className="text-xs text-slate-500 flex items-center gap-2 bg-slate-50 p-2 rounded-lg"><Type size={12} className="text-solar-gold" /> CPF: {reservation.mainGuest.cpf}</p>
                            </div>
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

                            <div className="flex justify-between items-center pt-4">
                                <span className="font-serif font-bold text-lg text-[#0F2820]">Total da Reserva</span>
                                {isEditingPrice ? (
                                    <div className="flex items-center gap-2 animate-in fade-in">
                                        <div className="relative">
                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 font-serif text-sm">R$</span>
                                            <input
                                                type="number"
                                                value={priceInput}
                                                onChange={(e) => setPriceInput(e.target.value)}
                                                className="w-32 bg-white border border-solar-gold rounded-lg py-1 pl-8 pr-2 text-right font-serif font-bold text-lg outline-none focus:ring-2 ring-solar-gold/20"
                                            />
                                        </div>
                                        <button
                                            onClick={async () => {
                                                const val = parseFloat(priceInput);
                                                if (!isNaN(val) && val >= 0) {
                                                    const success = await onUpdateReservation(reservation.id, { totalPrice: val });
                                                    if (success) {
                                                        setIsEditingPrice(false);
                                                        setLocalSuccess(true);
                                                        setTimeout(() => setLocalSuccess(false), 3000);
                                                    } else {
                                                        setLocalError('Erro ao atualizar valor.');
                                                    }
                                                }
                                            }}
                                            className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                                            title="Salvar"
                                        >
                                            <Check size={16} />
                                        </button>
                                        <button
                                            onClick={() => setIsEditingPrice(false)}
                                            className="p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                                            title="Cancelar"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3 group/price">
                                        <button
                                            onClick={() => {
                                                setPriceInput(reservation.totalPrice.toString());
                                                setIsEditingPrice(true);
                                            }}
                                            className="opacity-0 group-hover/price:opacity-100 p-1.5 text-slate-400 hover:text-solar-gold transition-all"
                                            title="Editar Valor"
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                        <span className="font-serif font-bold text-2xl text-solar-gold">R$ {reservation.totalPrice.toLocaleString()}</span>
                                    </div>
                                )}
                            </div>
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
                                            <button
                                                type="button"
                                                onClick={() => setConfirmType('CONFIRM')}
                                                className={`w-full py-3.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2 ${reservation.status === 'CONFIRMED' ? 'bg-green-100 text-green-600 cursor-default' : 'bg-green-600 text-white hover:bg-green-700 active:scale-95'}`}
                                                disabled={reservation.status === 'CONFIRMED' || localSuccess}
                                            >
                                                Confirmar Pagamento
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setConfirmType('CANCEL')}
                                                className={`w-full py-3.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2 ${reservation.status === 'CANCELED' ? 'bg-red-100 text-red-600 cursor-default' : 'bg-red-600 text-white hover:bg-red-700 active:scale-95'}`}
                                                disabled={reservation.status === 'CANCELED' || localSuccess}
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
