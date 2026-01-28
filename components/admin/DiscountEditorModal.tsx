import React, { useState, useEffect } from 'react';
import { X, Tag, Calendar, Percent, ArrowRight, ToggleLeft, ToggleRight, Trash2, Check } from 'lucide-react';
import { DiscountCode, Room } from '../../types';
import { DateRangePickerModal } from './DateRangePickerModal';
import { formatDisplayDate } from '../../utils/dateUtils';

interface DiscountEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    discount: DiscountCode | null;
    onSave: (discount: DiscountCode) => void;
    onDelete?: (code: string) => void;
    rooms: Room[];
}

export const DiscountEditorModal: React.FC<DiscountEditorModalProps> = ({ isOpen, onClose, discount, onSave, onDelete, rooms }) => {
    const emptyDiscount: DiscountCode = {
        code: '',
        percentage: 0,
        active: true,
        startDate: '',
        endDate: '',
        minNights: 1,
        fullPeriodRequired: false,
        validDays: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], // Default to all days
        validRoomTypes: [] // Default to all rooms (empty)
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
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-[#D4AF37] animate-in zoom-in flex flex-col max-h-[90vh] relative">
                <div className="bg-[#0F2820] p-6 text-[#D4AF37] flex justify-between items-center border-b border-[#D4AF37]/20 shrink-0 rounded-t-3xl z-20 relative">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-solar-gold/10 rounded-xl"><Tag size={20} /></div>
                        <h3 className="font-serif font-bold tracking-widest uppercase text-lg">{discount ? 'Editar Cupom' : 'Novo Cupom'}</h3>
                    </div>
                    <button onClick={onClose} className="hover:rotate-90 transition-transform"><X size={24} /></button>
                </div>

                <div className="p-8 space-y-6 flex-1 overflow-y-auto custom-scrollbar relative z-0">
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Código do Cupom</label>
                            <input
                                type="text"
                                value={formData.code}
                                onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                className="w-full border-2 border-gray-100 p-4 rounded-xl text-lg bg-slate-50 focus:border-solar-gold outline-none font-black transition-all tracking-widest uppercase"
                                placeholder="EX: SOLAR10"
                                disabled={false}
                            />
                            {discount && <p className="text-[8px] text-solar-gold italic">Alterar o código renomeará o cupom.</p>}
                        </div>

                        <div className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-inner">
                            <div className="flex items-center gap-2 text-[#0F2820] border-b border-slate-200 pb-2 mb-2">
                                <Tag size={14} className="text-solar-gold" />
                                <h4 className="text-[10px] font-bold uppercase tracking-widest">Regras de Uso</h4>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Tipo de Desconto</label>
                                    <div className="flex bg-white rounded-xl border-2 border-slate-100 p-1">
                                        <button
                                            onClick={() => setFormData({ ...formData, discountType: 'percentage', fixedValue: undefined })}
                                            className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${(!formData.discountType || formData.discountType === 'percentage') ? 'bg-solar-green text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
                                        >
                                            % Porcentagem
                                        </button>
                                        <button
                                            onClick={() => setFormData({ ...formData, discountType: 'fixed', percentage: 0 })}
                                            className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${(formData.discountType === 'fixed') ? 'bg-solar-green text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
                                        >
                                            R$ Fixo
                                        </button>
                                    </div>
                                </div>

                                {formData.discountType === 'fixed' ? (
                                    <div className="space-y-1.5 animate-in fade-in slide-in-from-left-2">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Valor Fixo (R$)</label>
                                        <input
                                            type="number"
                                            value={formData.fixedValue || ''}
                                            onChange={e => setFormData({ ...formData, fixedValue: Number(e.target.value) })}
                                            className="w-full border-2 border-gray-100 p-3 rounded-xl text-sm bg-white focus:border-solar-gold outline-none font-bold"
                                            placeholder="0,00"
                                        />
                                    </div>
                                ) : (
                                    <div className="space-y-1.5 animate-in fade-in slide-in-from-right-2">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Porcentagem (%)</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                value={formData.percentage}
                                                onChange={e => setFormData({ ...formData, percentage: Number(e.target.value) })}
                                                className="w-full border-2 border-gray-100 p-3 rounded-xl text-sm bg-white focus:border-solar-gold outline-none pr-8 font-bold"
                                            />
                                            <Percent size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-solar-gold" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Limite de Uso</label>
                                    <input
                                        type="number"
                                        value={formData.maxUses || ''}
                                        onChange={e => setFormData({ ...formData, maxUses: e.target.value ? Number(e.target.value) : undefined })}
                                        className="w-full border-2 border-gray-100 p-3 rounded-xl text-sm bg-white focus:border-solar-gold outline-none font-bold"
                                        placeholder="Ilimitado"
                                    />
                                    <p className="text-[8px] text-slate-400 italic ml-1">Deixe vazio para ilimitado</p>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Acumulativo?</label>
                                    <button
                                        onClick={() => setFormData({ ...formData, stackable: !formData.stackable })}
                                        className={`w-full p-3 rounded-xl border-2 text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 ${formData.stackable ? 'bg-green-50 border-green-200 text-green-600' : 'bg-white border-slate-100 text-slate-400'}`}
                                    >
                                        {formData.stackable ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                        {formData.stackable ? 'Sim' : 'Não'}
                                    </button>
                                </div>
                                <div className="space-y-1.5 pt-4 border-t border-slate-100 mt-4">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Dias Válidos (Check-in)</label>
                                    <div className="flex gap-1 overflow-x-auto pb-1">
                                        {[
                                            { id: 'sun', label: 'D' }, { id: 'mon', label: 'S' }, { id: 'tue', label: 'T' },
                                            { id: 'wed', label: 'Q' }, { id: 'thu', label: 'Q' }, { id: 'fri', label: 'S' }, { id: 'sat', label: 'S' }
                                        ].map(day => {
                                            const isSelected = !formData.validDays || formData.validDays.includes(day.id);
                                            return (
                                                <button
                                                    key={day.id}
                                                    onClick={() => {
                                                        const current = formData.validDays || ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
                                                        const newDays = current.includes(day.id)
                                                            ? current.filter(d => d !== day.id)
                                                            : [...current, day.id];
                                                        setFormData({ ...formData, validDays: newDays });
                                                    }}
                                                    className={`w-8 h-8 rounded-lg text-[10px] font-bold flex items-center justify-center transition-all ${isSelected ? 'bg-solar-gold text-[#0F2820]' : 'bg-slate-100 text-slate-300'}`}
                                                >
                                                    {day.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="space-y-1.5 pt-4 border-t border-slate-100">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Acomodações Válidas</label>
                                    <div className="max-h-32 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                                        {rooms.map(room => {
                                            const isSelected = !formData.validRoomTypes || formData.validRoomTypes.length === 0 || formData.validRoomTypes.includes(room.id);
                                            return (
                                                <button
                                                    key={room.id}
                                                    onClick={() => {
                                                        let current = formData.validRoomTypes || [];
                                                        if (current.length === 0) {
                                                            current = [room.id];
                                                        } else {
                                                            if (current.includes(room.id)) {
                                                                current = current.filter(id => id !== room.id);
                                                            } else {
                                                                current = [...current, room.id];
                                                            }
                                                        }
                                                        if (current.length === rooms.length) current = [];

                                                        setFormData({ ...formData, validRoomTypes: current });
                                                    }}
                                                    className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-bold border transition-all flex items-center justify-between ${isSelected ? 'bg-solar-gold/10 border-solar-gold text-[#0F2820]' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                                                >
                                                    <span>{room.name}</span>
                                                    {isSelected && <Check size={12} className="text-solar-gold" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="text-[8px] text-slate-400 italic ml-1">Selecione para restringir (todas selecionadas = válido para todas)</p>
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
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-slate-100 bg-white shrink-0 rounded-b-3xl z-30 relative">
                    <button
                        onClick={() => {
                            if (!formData.code) {
                                alert('Por favor, insira o código do cupom.');
                                return;
                            }
                            if (formData.discountType === 'percentage' && !formData.percentage) {
                                alert('Por favor, defina a porcentagem de desconto.');
                                return;
                            }
                            if (formData.discountType === 'fixed' && !formData.fixedValue) {
                                alert('Por favor, defina o valor fixo de desconto.');
                                return;
                            }
                            onSave(formData);
                        }}
                        className="w-full bg-[#0F2820] text-[#D4AF37] py-5 rounded-2xl font-bold uppercase tracking-[0.3em] hover:bg-[#1a3c30] transition-all shadow-2xl active:scale-95 cursor-pointer relative z-50"
                    >
                        Salvar Cupom
                    </button>
                    {discount && onDelete && (
                        <button
                            onClick={() => { if (window.confirm(`Excluir cupom ${discount.code} permanentemente?`)) { onDelete(discount.code); } }}
                            className="w-full text-red-300 py-4 mt-2 text-[9px] font-bold uppercase tracking-[0.2em] hover:text-red-500 hover:underline transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <Trash2 size={12} /> Excluir Registro
                        </button>
                    )}
                    {!discount && (
                        <button onClick={onClose} className="w-full text-slate-400 py-4 text-[10px] font-bold uppercase tracking-widest hover:text-slate-600 font-bold cursor-pointer">Descartar</button>
                    )}
                </div>
            </div>
        </div>
    );
};
