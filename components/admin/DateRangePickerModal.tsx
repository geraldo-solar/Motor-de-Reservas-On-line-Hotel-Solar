import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { toLocalISO, formatDisplayDate } from '../../utils/dateUtils';

interface DateRangePickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (start: string, end: string) => void;
    initialStart?: string;
    initialEnd?: string;
}


export const DateRangePickerModal: React.FC<DateRangePickerModalProps> = ({
    isOpen,
    onClose,
    onSelect,
    initialStart,
    initialEnd
}) => {
    const [start, setStart] = useState(initialStart || '');
    const [end, setEnd] = useState(initialEnd || '');
    const [currentMonth, setCurrentMonth] = useState(new Date());

    useEffect(() => {
        if (isOpen) {
            setStart(initialStart || '');
            setEnd(initialEnd || '');
        }
    }, [isOpen, initialStart, initialEnd]);

    if (!isOpen) return null;

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const handleDateClick = (day: number) => {
        const date = toLocalISO(new Date(year, month, day));
        if (!start || (start && end)) {
            setStart(date);
            setEnd('');
        } else {
            if (date < start) {
                setEnd(start);
                setStart(date);
            } else {
                setEnd(date);
            }
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[600] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-[#D4AF37] animate-in zoom-in">
                <div className="bg-[#0F2820] p-4 text-[#D4AF37] flex justify-between items-center">
                    <h3 className="font-serif font-bold tracking-widest uppercase text-sm">Selecionar Período</h3>
                    <button onClick={onClose} className="hover:rotate-90 transition-transform duration-300"><X size={20} /></button>
                </div>
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))} className="p-2 hover:bg-gray-100 rounded-full transition"><ChevronLeft size={20} /></button>
                        <span className="font-bold uppercase text-xs tracking-widest text-[#0F2820]">{currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
                        <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))} className="p-2 hover:bg-gray-100 rounded-full transition"><ChevronRight size={20} /></button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 mb-6 text-center">
                        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(d => <div key={d} className="text-[10px] font-bold text-gray-400 py-2">{d}</div>)}
                        {Array(firstDay).fill(null).map((_, i) => <div key={`empty-${i}`} />)}
                        {daysArray.map(d => {
                            const iso = toLocalISO(new Date(year, month, d));
                            const isSelected = iso === start || iso === end;
                            const inRange = start && end && iso > start && iso < end;
                            return (
                                <button
                                    key={d}
                                    onClick={() => handleDateClick(d)}
                                    className={`h-10 rounded-lg text-xs transition-all ${isSelected ? 'bg-[#0F2820] text-white font-bold shadow-md scale-110 z-10' : inRange ? 'bg-[#D4AF37]/20 text-[#0F2820]' : 'hover:bg-gray-100 text-gray-600'}`}
                                >
                                    {d}
                                </button>
                            );
                        })}
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                            <span className="text-[8px] font-bold text-gray-400 uppercase block mb-1">Check-in</span>
                            <span className="text-xs font-bold text-[#0F2820]">{formatDisplayDate(start)}</span>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                            <span className="text-[8px] font-bold text-gray-400 uppercase block mb-1">Check-out</span>
                            <span className="text-xs font-bold text-[#0F2820]">{formatDisplayDate(end)}</span>
                        </div>
                    </div>
                    <button
                        onClick={() => { onSelect(start, end); onClose(); }}
                        disabled={!start || !end}
                        className="w-full bg-[#D4AF37] text-[#0F2820] py-4 rounded-xl font-bold text-xs uppercase tracking-widest disabled:opacity-50 hover:bg-[#b8952b] transition shadow-lg active:scale-95"
                    >
                        Confirmar Seleção
                    </button>
                </div>
            </div>
        </div>
    );
};
