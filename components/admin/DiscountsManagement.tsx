import React from 'react';
import { Plus, Trash2, Tag, Percent, Calendar, Check, XCircle, Layers } from 'lucide-react';
import { DiscountCode } from '../../types';

interface DiscountsManagementProps {
    discounts: DiscountCode[];
    onEditDiscount: (discount: DiscountCode) => void;
    onNewDiscount: () => void;
    onDeleteDiscount: (code: string) => Promise<boolean>;
    onUpdateDiscounts: React.Dispatch<React.SetStateAction<DiscountCode[]>>;
}

export const DiscountsManagement: React.FC<DiscountsManagementProps> = ({ discounts, onEditDiscount, onNewDiscount, onDeleteDiscount, onUpdateDiscounts }) => {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div>
                    <h2 className="text-xl font-serif font-bold text-solar-green uppercase tracking-widest">Cupons de Desconto</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Gestão de ofertas promocionais e códigos</p>
                </div>
                <button
                    onClick={onNewDiscount}
                    className="bg-[#0F2820] text-[#D4AF37] px-8 py-4 rounded-xl font-bold uppercase text-[10px] tracking-[0.2em] flex items-center gap-3 hover:bg-[#1a3c30] transition shadow-xl active:scale-95"
                >
                    <Plus size={18} /> Novo Cupom
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {discounts.map(discount => (
                    <div
                        key={discount.code}
                        className={`group bg-white rounded-3xl p-8 border transition-all duration-500 hover:shadow-2xl relative flex flex-col justify-between min-h-[280px] ${discount.active ? 'border-l-8 border-l-green-500 border-slate-100' : 'border-l-8 border-l-red-500 border-slate-100 opacity-80'}`}
                    >
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-2xl font-black text-solar-green uppercase tracking-[0.2em]">{discount.code}</h3>
                                <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest block mt-1">Código Promocional</span>
                            </div>
                            <div className="bg-solar-gold/5 p-4 rounded-2xl border border-solar-gold/10">
                                <Percent size={24} className="text-solar-gold" />
                            </div>
                        </div>

                        <div className="space-y-4 flex-1">
                            <div className="flex items-end gap-1">
                                {discount.discountType === 'fixed' ? (
                                    <>
                                        <span className="text-xl font-serif font-bold text-solar-gold mb-1">R$</span>
                                        <span className="text-5xl font-serif font-black text-solar-gold">{discount.fixedValue}</span>
                                        <span className="text-xl font-serif font-bold text-solar-gold mb-1">OFF</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-5xl font-serif font-black text-solar-gold">{discount.percentage}</span>
                                        <span className="text-xl font-serif font-bold text-solar-gold mb-1">% OFF</span>
                                    </>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {(discount.startDate || discount.endDate) ? (
                                    <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                        <Calendar size={12} className="text-slate-400" />
                                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">
                                            {discount.startDate ? new Date(discount.startDate + 'T12:00:00').toLocaleDateString() : '∞'} — {discount.endDate ? new Date(discount.endDate + 'T12:00:00').toLocaleDateString() : '∞'}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 px-2 py-1 bg-green-50 rounded-lg border border-green-100 text-[9px] font-bold text-green-600 uppercase tracking-widest">
                                        <Check size={12} /> Validade Permanente
                                    </div>
                                )}

                                {discount.maxUses && (
                                    <div className="flex items-center gap-2 px-2 py-1 bg-amber-50 rounded-lg border border-amber-100 text-[9px] font-bold text-amber-600 uppercase tracking-widest">
                                        <Tag size={12} /> {discount.usedCount || 0}/{discount.maxUses} Usos
                                    </div>
                                )}

                                {discount.stackable && (
                                    <div className="flex items-center gap-2 px-2 py-1 bg-blue-50 rounded-lg border border-blue-100 text-[9px] font-bold text-blue-600 uppercase tracking-widest">
                                        <Layers size={12} /> Acumulativo
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="pt-8 flex items-center gap-3">
                            <button
                                onClick={() => onEditDiscount(discount)}
                                className="flex-1 bg-[#0F2820] text-[#D4AF37] py-4 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] shadow-lg hover:bg-solar-gold hover:text-solar-green transition-all active:scale-95"
                            >
                                Configurar
                            </button>
                            <button
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    if (window.confirm(`Excluir cupom ${discount.code}?`)) {
                                        const success = await onDeleteDiscount(discount.code);
                                        if (success) onUpdateDiscounts(prev => prev.filter(d => d.code !== discount.code));
                                    }
                                }}
                                className="p-4 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>

                        <div className="absolute top-4 right-4 flex gap-2">
                            {!discount.active && <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest">Inativo</span>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
