import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Share2, LogIn, LogOut, EyeOff, Calendar, ChevronDown, CheckCircle2 } from 'lucide-react';
import { HolidayPackage, Room } from '../types';
import { parseISODate, toLocalISO, formatDisplayDate } from '../utils/dateUtils';

interface DateSelectorBarProps {
    currentCalendarDate: Date;
    setCurrentCalendarDate: React.Dispatch<React.SetStateAction<Date>>;
    checkIn: Date | null;
    checkOut: Date | null;
    packages: HolidayPackage[];
    rooms: Room[];
    onDateClick: (day: number) => void;
    onShareDates: () => void;
}

export const DateSelectorBar: React.FC<DateSelectorBarProps> = ({
    currentCalendarDate,
    setCurrentCalendarDate,
    checkIn,
    checkOut,
    packages,
    rooms,
    onDateClick,
    onShareDates
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const activeRooms = rooms.filter(r => r.active);

    React.useEffect(() => {
        if (isOpen) {
            setTimeout(() => {
                const element = document.getElementById('reserva-section');
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 200);
        }
    }, [isOpen]);

    return (
        <div id="reserva-section" className="relative -mt-10 max-w-5xl mx-auto px-4 z-40">
            <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden backdrop-blur-md">
                {/* Compact View / Toggle Bar */}
                <div
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex flex-col md:flex-row items-center cursor-pointer hover:bg-slate-50 transition-all duration-300 divide-y md:divide-y-0 md:divide-x divide-slate-100"
                >
                    <div className="flex-1 w-full p-6 flex items-center gap-4 group">
                        <div className="bg-solar-gold/10 p-3 rounded-xl text-solar-gold group-hover:scale-110 transition-transform">
                            <LogIn size={20} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Check-in</span>
                            <span className="text-sm font-bold text-solar-green">
                                {checkIn ? formatDisplayDate(toLocalISO(checkIn)) : 'Selecione a data'}
                            </span>
                        </div>
                    </div>

                    <div className="flex-1 w-full p-6 flex items-center gap-4 group">
                        <div className="bg-solar-gold/10 p-3 rounded-xl text-solar-gold group-hover:scale-110 transition-transform">
                            <LogOut size={20} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Check-out</span>
                            <span className="text-sm font-bold text-solar-green">
                                {checkOut ? formatDisplayDate(toLocalISO(checkOut)) : 'Selecione a data'}
                            </span>
                        </div>
                    </div>

                    <div className="md:w-auto w-full p-6 flex items-center justify-between gap-6 bg-solar-green text-white hover:bg-solar-moss transition-colors">
                        <div className="flex items-center gap-3">
                            <Calendar size={20} className="text-solar-gold" />
                            <span className="text-xs font-bold uppercase tracking-[0.2em]">
                                {checkIn && checkOut ? 'Alterar Datas' : 'Ver Calendário'}
                            </span>
                        </div>
                        <ChevronDown size={20} className={`transition-transform duration-500 ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                </div>

                {/* Expanded View (Calendar) */}
                <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isOpen ? 'max-h-[800px] opacity-100 border-t border-slate-100' : 'max-h-0 opacity-0'}`}>
                    <div className="p-8 md:p-12">
                        <div className="flex flex-col md:flex-row items-center gap-12">
                            <div className="flex-1 w-full space-y-4">
                                <div className="flex items-center justify-between mb-8">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setCurrentCalendarDate(new Date(currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1))); }}
                                        className="p-3 hover:bg-slate-50 rounded-full transition-colors text-solar-green"
                                    >
                                        <ChevronLeft size={24} />
                                    </button>
                                    <h3 className="text-xl font-serif font-bold text-solar-green uppercase tracking-widest text-center flex-1">
                                        {currentCalendarDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
                                    </h3>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setCurrentCalendarDate(new Date(currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1))); }}
                                        className="p-3 hover:bg-slate-50 rounded-full transition-colors text-solar-green"
                                    >
                                        <ChevronRight size={24} />
                                    </button>
                                </div>

                                <div className="grid grid-cols-7 gap-1 md:gap-3">
                                    {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'].map(d => (
                                        <div key={d} className="text-center text-[10px] font-bold text-slate-300 py-2">{d}</div>
                                    ))}
                                    {Array.from({ length: new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1).getDay() }).map((_, i) => (
                                        <div key={i}></div>
                                    ))}
                                    {Array.from({ length: new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 0).getDate() }).map((_, i) => {
                                        const d = i + 1;
                                        const date = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), d);
                                        const dateIso = toLocalISO(date);
                                        const checkInIso = checkIn ? toLocalISO(checkIn) : null;
                                        const checkOutIso = checkOut ? toLocalISO(checkOut) : null;

                                        const isSelected = (checkInIso && dateIso === checkInIso) || (checkOutIso && dateIso === checkOutIso);
                                        const inRange = checkIn && checkOut && dateIso > checkInIso! && dateIso < checkOutIso!;
                                        const isPast = date.getTime() < new Date().setHours(0, 0, 0, 0);

                                        const noCheckInAny = activeRooms.some(r =>
                                            r.overrides?.some(o => o.dateIso === dateIso && (o.noCheckIn === true || o.noCheckIn === 'true'))
                                        );
                                        const noCheckInGlobal = activeRooms.length > 0 && activeRooms.every(r =>
                                            r.overrides?.some(o => o.dateIso === dateIso && (o.noCheckIn === true || o.noCheckIn === 'true'))
                                        );
                                        const noCheckOutAny = activeRooms.some(r =>
                                            r.overrides?.some(o => o.dateIso === dateIso && (o.noCheckOut === true || o.noCheckOut === 'true'))
                                        );
                                        const noCheckOutGlobal = activeRooms.length > 0 && activeRooms.every(r =>
                                            r.overrides?.some(o => o.dateIso === dateIso && (o.noCheckOut === true || o.noCheckOut === 'true'))
                                        );
                                        const isClosedAny = activeRooms.some(r =>
                                            r.overrides?.some(o => o.dateIso === dateIso && (o.isClosed === true || o.isClosed === 'true'))
                                        );
                                        const isClosedGlobal = activeRooms.length > 0 && activeRooms.every(r =>
                                            r.overrides?.some(o => o.dateIso === dateIso && (o.isClosed === true || o.isClosed === 'true'))
                                        );
                                        const isSoldOutGlobal = activeRooms.length > 0 && activeRooms.every(r => {
                                            const ov = r.overrides?.find(o => o.dateIso === dateIso);
                                            return (ov?.availableQuantity ?? r.totalQuantity) <= 0;
                                        });

                                        const packageForDate = packages.filter(p => p.active).find(pkg => {
                                            return dateIso >= pkg.startIsoDate && dateIso <= pkg.endIsoDate;
                                        });
                                        const hasPackage = !!packageForDate;

                                        let isDisabled = isPast || (isClosedGlobal && activeRooms.length > 0);
                                        if (!checkIn || (checkIn && checkOut)) {
                                            if (noCheckInGlobal && activeRooms.length > 0) isDisabled = true;
                                        } else if (checkIn && !checkOut) {
                                            if (date > checkIn && noCheckOutGlobal && activeRooms.length > 0) isDisabled = true;
                                        }

                                        return (
                                            <div key={d} className="relative group/day">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onDateClick(d); if (checkIn && !checkOut && date > checkIn) setIsOpen(false); }}
                                                    disabled={isDisabled}
                                                    className={`w-full h-11 md:h-16 text-xs md:text-sm rounded-xl border transition-all duration-300 relative overflow-hidden flex flex-col items-center justify-center gap-0.5
                                                        ${isDisabled
                                                            ? 'bg-slate-50 border-transparent text-slate-300 cursor-not-allowed opacity-60'
                                                            : isSelected
                                                                ? 'bg-solar-gold border-solar-gold text-white font-bold shadow-lg scale-105 z-10'
                                                                : inRange
                                                                    ? 'bg-solar-sand/30 border-transparent text-solar-green'
                                                                    : hasPackage && !isPast
                                                                        ? 'bg-purple-50 border-purple-200 hover:border-purple-400 text-purple-700'
                                                                        : isSoldOutGlobal
                                                                            ? 'bg-red-50/30 border-red-100 text-red-300'
                                                                            : 'bg-white border-slate-100 hover:border-solar-gold text-slate-600'
                                                        }`}
                                                >
                                                    <span className={(hasPackage && !isPast && !isSelected) ? 'font-semibold' : ''}>{d}</span>
                                                    {!isSelected && !inRange && !isPast && (
                                                        <div className="flex gap-0.5">
                                                            {noCheckInAny && <LogIn size={8} className={`${noCheckInGlobal ? 'text-orange-500' : 'text-orange-400/50'}`} title={noCheckInGlobal ? "Chegada Restrita" : "Algumas Acomodações Restritas"} />}
                                                            {noCheckOutAny && <LogOut size={8} className={`${noCheckOutGlobal ? 'text-red-500' : 'text-red-400/50'}`} title={noCheckOutGlobal ? "Saída Restrita" : "Algumas Acomodações Restritas"} />}
                                                            {isClosedAny && <EyeOff size={8} className={`${isClosedGlobal ? 'text-gray-500' : 'text-gray-400/50'}`} title={isClosedGlobal ? "Vendas Suspensas" : "Vendas Parciais Sustensas"} />}
                                                        </div>
                                                    )}
                                                    {isSoldOutGlobal && !isPast && !isSelected && !isClosedGlobal && (
                                                        <span className="text-[6px] uppercase font-bold opacity-40">Lotado</span>
                                                    )}
                                                </button>
                                                {hasPackage && !isPast && (
                                                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-max px-0.5 pointer-events-none z-20">
                                                        <div className="bg-purple-500 text-white text-[6px] md:text-[7px] font-bold rounded px-1 py-0.5 text-center shadow-sm whitespace-nowrap">
                                                            {packageForDate.name}
                                                        </div>
                                                    </div>
                                                )}
                                                {(noCheckInGlobal || noCheckOutGlobal || isClosedGlobal) && !isPast && (
                                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/day:block z-50">
                                                        <div className="bg-slate-800 text-white text-[8px] font-bold rounded px-2 py-1 shadow-xl whitespace-nowrap">
                                                            {isClosedGlobal
                                                                ? 'Vendas Suspensas'
                                                                : (noCheckInGlobal && noCheckOutGlobal)
                                                                    ? 'Entrada e Saída Restritas'
                                                                    : noCheckInGlobal
                                                                        ? 'Entrada Restrita'
                                                                        : 'Saída Restrita'}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {checkIn && checkOut && (
                                    <div className="mt-10 flex flex-col items-center animate-in fade-in slide-in-from-top-4 duration-500 gap-4">
                                        <div className="flex items-center gap-2 text-solar-green bg-solar-gold/10 px-4 py-2 rounded-full border border-solar-gold/20">
                                            <CheckCircle2 size={16} className="text-solar-gold" />
                                            <span className="text-[10px] font-bold uppercase tracking-widest">Período Selecionado com Sucesso</span>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onShareDates(); }}
                                            className="flex items-center gap-2 px-6 py-3 bg-white text-solar-gold rounded-full hover:bg-slate-50 transition-all font-bold text-[10px] uppercase tracking-widest border border-slate-200 shadow-sm"
                                        >
                                            <Share2 size={16} /> Compartilhar Datas
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
