import React, { useState, useEffect } from 'react';
import { X, Tag, Calendar, Percent, ArrowRight, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { DiscountCode } from '../../types';
import { DateRangePickerModal } from './DateRangePickerModal';
import { formatDisplayDate } from '../../utils/dateUtils';

interface DiscountEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    discount: DiscountCode | null;
    onSave: (discount: DiscountCode) => void;
    onDelete?: (code: string) => void;
}

export const DiscountEditorModal: React.FC<DiscountEditorModalProps> = ({ isOpen, onClose, discount, onSave, onDelete }) => {
    const emptyDiscount: DiscountCode = {
        code: '',
        percentage: 0,
        active: true,
        startDate: '',
        endDate: '',
        minNights: 1,
        fullPeriodRequired: false
    };

    const [formData, setFormData] = useState<DiscountCode>(discount || emptyDiscount);
    const [isPickerOpen, setIsPickerOpen] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setFormData(discount || emptyDiscount);
        }
    }, [isOpen, discount]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[500] flex items-center justify-center p-4 backdrop-blur-sm">
            <DateRangePickerModal
                isOpen={isPickerOpen}
                onClose={() => setIsPickerOpen(false)}
                onSelect={(s, e) => { setFormData({ ...formData, startDate: s, endDate: e }); setIsPickerOpen(false); }}
                initialStart={formData.startDate}
                initialEnd={formData.endDate}
            />
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-[#D4AF37] animate-in zoom-in">
                <div className="bg-[#0F2820] p-6 text-[#D4AF37] flex justify-between items-center border-b border-[#D4AF37]/20">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-solar-gold/10 rounded-xl"><Tag size={20} /></div>
                        <h3 className="font-serif font-bold tracking-widest uppercase text-lg">{discount ? 'Editar Cupom' : 'Novo Cupom'}</h3>
                    </div>
                    <button onClick={onClose} className="hover:rotate-90 transition-transform"><X size={24} /></button>
                </div>
                <div className="p-8 space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Código do Cupom</label>
                            <input
                                type="text"
                                value={formData.code}
                                onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                className="w-full border-2 border-gray-100 p-4 rounded-xl text-lg bg-slate-50 focus:border-solar-gold outline-none font-black transition-all tracking-widest uppercase"
                                placeholder="EX: SOLAR10"
                                disabled={!!discount}
                            />
                            {discount && <p className="text-[8px] text-slate-400 italic">O código não pode ser alterado após criado.</p>}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Desconto (%)</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={formData.percentage}
                                        onChange={e => setFormData({ ...formData, percentage: Number(e.target.value) })}
                                        className="w-full border-2 border-gray-100 p-4 rounded-xl text-sm bg-slate-50 focus:border-solar-gold outline-none pr-10 font-bold"
                                    />
                                    <Percent size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-solar-gold" />
                                </div>
                            </div>
                            <div className="flex flex-col justify-end">
                                <button
                                    onClick={() => setFormData({ ...formData, active: !formData.active })}
                                    className={`w-full py-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border-2 flex items-center justify-center gap-2 ${formData.active ? 'bg-green-50 border-green-200 text-green-600' : 'bg-red-50 border-red-200 text-red-500'}`}
                                >
                                    {formData.active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                    {formData.active ? 'Ativo' : 'Inativo'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-inner">
                        <div className="flex items-center gap-2 text-[#0F2820] border-b border-slate-200 pb-2 mb-2">
                            <Calendar size={14} className="text-solar-gold" />
                            <h4 className="text-[10px] font-bold uppercase tracking-widest">Validade do Código</h4>
                        </div>

                        <button
                            onClick={() => setIsPickerOpen(true)}
                            className="w-full flex items-center justify-between bg-white border-2 border-white p-4 rounded-xl hover:border-solar-gold transition-all text-left shadow-sm group"
                        >
                            <div className="flex items-center gap-4">
                                <div className="flex flex-col">
                                    <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">Início</span>
                                    <span className="font-bold text-xs text-solar-green">
                                        {formatDisplayDate(formData.startDate)}
                                    </span>
                                </div>
                                <ArrowRight size={14} className="text-slate-100" />
                                <div className="flex flex-col">
                                    <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">Fim</span>
                                    <span className="font-bold text-xs text-solar-green">
                                        {formatDisplayDate(formData.endDate)}
                                    </span>
                                </div>
                            </div>
                            <Calendar className="text-solar-gold opacity-50 group-hover:opacity-100 transition-opacity" size={20} />
                        </button>
                        <p className="text-[9px] text-slate-400 italic text-center">Vazio = Válido permanentemente</p>
                    </div>

                    <div className="pt-4 space-y-3">
                        <button onClick={() => onSave(formData)} className="w-full bg-[#0F2820] text-[#D4AF37] py-5 rounded-2xl font-bold uppercase tracking-[0.3em] hover:bg-[#1a3c30] transition-all shadow-2xl active:scale-95">Salvar Cupom</button>
                        {discount && onDelete && (
                            <button
                                onClick={() => { if (window.confirm(`Excluir cupom ${discount.code} permanentemente?`)) { onDelete(discount.code); } }}
                                className="w-full text-red-300 py-2 text-[9px] font-bold uppercase tracking-[0.2em] hover:text-red-500 hover:underline transition-all flex items-center justify-center gap-2"
                            >
                                <Trash2 size={12} /> Excluir Registro
                            </button>
                        )}
                        {!discount && (
                            <button onClick={onClose} className="w-full text-slate-400 py-2 text-[10px] font-bold uppercase tracking-widest hover:text-slate-600 font-bold">Descartar</button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
