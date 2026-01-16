import React, { useState } from 'react';
import { Grid, ChevronLeft, ChevronRight, Eye, EyeOff, Layers, Calendar as CalendarIcon, LogIn as LoginIcon, LogOut as LogoutIcon } from 'lucide-react';
import { Room, RoomDateOverride } from '../../types';
import { DateRangePickerModal } from './DateRangePickerModal';
import { toLocalISO, parseISODate, formatDisplayDate } from '../../utils/dateUtils';

interface InventoryMapProps {
    rooms: Room[];
    onUpdateRoomOverride: (roomId: string, override: RoomDateOverride) => void;
    onBulkUpdate: (startIso: string, endIso: string, roomId: string, selectedDays: number[], updates: Partial<RoomDateOverride> | null, priceOp?: any) => void;
    isSaving?: boolean;
}


const ROOM_ORDER = ['casal', 'triplo', 'sacada', 'quadruplo', 'quádruplo', 'varanda', 'loft'];

const sortRoomsByPriority = (rooms: Room[]): Room[] => {
    return [...rooms].sort((a, b) => {
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();
        const getOrderIndex = (name: string) => {
            for (let i = 0; i < ROOM_ORDER.length; i++) {
                if (name.includes(ROOM_ORDER[i])) return i;
            }
            return ROOM_ORDER.length;
        };
        return getOrderIndex(nameA) - getOrderIndex(nameB);
    });
};

const MapCell: React.FC<{
    type: 'price' | 'qty' | 'restr';
    value: any;
    onChange: (val: any) => void;
    isClosed?: boolean;
    noCheckIn?: boolean;
    noCheckOut?: boolean;
}> = ({ type, value, onChange, isClosed, noCheckIn, noCheckOut }) => {
    if (type === 'restr') {
        return (
            <div className={`flex items-center justify-center gap-1.5 h-full ${isClosed ? 'opacity-40' : ''}`}>
                <button
                    type="button"
                    title={noCheckIn ? "Permitir Check-in" : "Bloquear Check-in"}
                    onClick={(e) => {
                        e.stopPropagation();
                        onChange({ noCheckIn: !noCheckIn });
                    }}
                    className={`p-1.5 rounded-lg transition-all border ${noCheckIn ? 'bg-orange-500 border-orange-600 text-white shadow-sm' : 'bg-white border-gray-200 text-gray-400 hover:border-orange-200 hover:text-orange-500'}`}
                >
                    <LoginIcon size={14} />
                </button>
                <button
                    type="button"
                    title={noCheckOut ? "Permitir Check-out" : "Bloquear Check-out"}
                    onClick={(e) => {
                        e.stopPropagation();
                        onChange({ noCheckOut: !noCheckOut });
                    }}
                    className={`p-1.5 rounded-lg transition-all border ${noCheckOut ? 'bg-red-500 border-red-600 text-white shadow-sm' : 'bg-white border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500'}`}
                >
                    <LogoutIcon size={14} />
                </button>
            </div>
        );
    }
    return (
        <input
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            value={value}
            onChange={e => onChange(Number(e.target.value))}
            disabled={isClosed}
            className={`w-full h-full text-center text-[11px] font-bold bg-transparent outline-none border-none focus:bg-[#D4AF37]/20 transition ${isClosed ? 'text-gray-400' : 'text-[#0F2820] cursor-text'}`}
            placeholder="-"
        />
    );
};

export const InventoryMap: React.FC<InventoryMapProps> = ({ rooms, onUpdateRoomOverride, onBulkUpdate, isSaving }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [currentDate, setCurrentDate] = useState(new Date());
    const [bulkStart, setBulkStart] = useState('');
    const [bulkEnd, setBulkEnd] = useState('');
    const [bulkRoomId, setBulkRoomId] = useState('all');
    const [bulkPrice, setBulkPrice] = useState('');
    const [bulkQty, setBulkQty] = useState('');
    const [bulkPriceMode, setBulkPriceMode] = useState<'fixed' | 'inc_pct' | 'dec_pct'>('fixed');
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
    const [bulkIsClosed, setBulkIsClosed] = useState<boolean | null>(null);
    const [bulkNoCheckIn, setBulkNoCheckIn] = useState<boolean | null>(null);
    const [bulkNoCheckOut, setBulkNoCheckOut] = useState<boolean | null>(null);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1).filter(d => {
        const date = new Date(year, month, d);
        return date >= today;
    });

    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const viewingMonthStart = new Date(year, month, 1);
    const canGoPrev = viewingMonthStart > currentMonthStart;

    const toggleDay = (day: number) => {
        setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
    };

    const handleBulkApply = () => {
        if (!bulkStart || !bulkEnd) { alert("Selecione o período."); return; }
        if (selectedDays.length === 0) { alert("Selecione pelo menos um dia da semana."); return; }
        const updates: Partial<RoomDateOverride> = {};
        if (bulkQty !== '') updates.availableQuantity = Number(bulkQty);
        if (bulkIsClosed !== null) updates.isClosed = bulkIsClosed;
        if (bulkNoCheckIn !== null) updates.noCheckIn = bulkNoCheckIn;
        if (bulkNoCheckOut !== null) updates.noCheckOut = bulkNoCheckOut;
        onBulkUpdate(bulkStart, bulkEnd, bulkRoomId, selectedDays, updates, bulkPrice !== '' ? { mode: bulkPriceMode, value: Number(bulkPrice) } : undefined);
        setBulkPrice('');
        setBulkQty('');
        setBulkIsClosed(null);
        setBulkNoCheckIn(null);
        setBulkNoCheckOut(null);
    };

    const updateOverrideField = (roomId: string, dateIso: string, field: keyof RoomDateOverride, val: any) => {
        const room = rooms.find(r => r.id === roomId);
        if (!room) return;
        const existing = room.overrides?.find(o => o.dateIso === dateIso) || { dateIso, price: room.price, availableQuantity: room.totalQuantity, isClosed: false };
        onUpdateRoomOverride(roomId, { ...existing, [field]: val });
    };

    const dayLabels = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

    return (
        <div className="space-y-4 animate-in fade-in duration-500">
            <DateRangePickerModal
                isOpen={isPickerOpen}
                onClose={() => setIsPickerOpen(false)}
                onSelect={(s, e) => { setBulkStart(s); setBulkEnd(e); }}
                initialStart={bulkStart}
                initialEnd={bulkEnd}
            />

            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3 text-[#0F2820]">
                        <Layers size={20} className="text-[#D4AF37]" />
                        <h3 className="font-bold text-sm font-serif uppercase tracking-widest">Ajustes Rápidos em Massa</h3>
                    </div>
                    <div className="flex gap-1.5 bg-gray-50 p-1 rounded-full border border-gray-100">
                        {dayLabels.map((label, i) => (
                            <button
                                key={i}
                                onClick={() => toggleDay(i)}
                                className={`w-7 h-7 md:w-8 md:h-8 rounded-full text-[10px] font-bold border transition-all ${selectedDays.includes(i)
                                    ? 'bg-[#D4AF37] border-[#D4AF37] text-[#0F2820] shadow-sm'
                                    : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 items-stretch lg:items-end">
                    <div className="lg:col-span-3">
                        <label className="text-[9px] font-bold text-gray-400 uppercase mb-1.5 block tracking-widest">Acomodação</label>
                        <select
                            value={bulkRoomId}
                            onChange={e => setBulkRoomId(e.target.value)}
                            className="w-full border-2 border-gray-100 p-3 rounded-xl text-xs bg-gray-50 outline-none h-11 focus:border-[#D4AF37] transition-all"
                        >
                            <option value="all">Todas as Acomodações</option>
                            {sortRoomsByPriority(rooms.filter(r => r.active)).map(r => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="lg:col-span-3 grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[9px] font-bold text-gray-400 uppercase mb-1.5 block tracking-widest">Período Início</label>
                            <button onClick={() => setIsPickerOpen(true)} className="w-full flex items-center justify-between border-2 border-gray-100 p-3 rounded-xl text-xs bg-gray-50 hover:border-[#D4AF37] transition-all h-11 text-left group">
                                <span className="truncate group-hover:text-[#0F2820]">{formatDisplayDate(bulkStart)}</span>
                                <CalendarIcon size={14} className="text-[#D4AF37]" />
                            </button>
                        </div>
                        <div>
                            <label className="text-[9px] font-bold text-gray-400 uppercase mb-1.5 block tracking-widest">Período Fim</label>
                            <button onClick={() => setIsPickerOpen(true)} className="w-full flex items-center justify-between border-2 border-gray-100 p-3 rounded-xl text-xs bg-gray-50 hover:border-[#D4AF37] transition-all h-11 text-left group">
                                <span className="truncate group-hover:text-[#0F2820]">{formatDisplayDate(bulkEnd)}</span>
                                <CalendarIcon size={14} className="text-[#D4AF37]" />
                            </button>
                        </div>
                    </div>

                    <div className="lg:col-span-3">
                        <label className="text-[9px] font-bold text-gray-400 uppercase mb-1.5 block tracking-widest">Nova Tarifa</label>
                        <div className="flex gap-1.5">
                            <select value={bulkPriceMode} onChange={e => setBulkPriceMode(e.target.value as any)} className="border-2 border-gray-100 p-2 rounded-xl text-xs bg-gray-50 w-28 outline-none h-11 focus:border-[#D4AF37] transition-all">
                                <option value="fixed">Fixo (R$)</option>
                                <option value="inc_pct">Acresc. (%)</option>
                                <option value="dec_pct">Desc. (%)</option>
                            </select>
                            <input type="number" value={bulkPrice} onChange={e => setBulkPrice(e.target.value)} className="border-2 border-gray-100 p-3 rounded-xl text-xs bg-gray-50 flex-1 outline-none h-11 focus:border-[#D4AF37] transition-all" placeholder="Valor" />
                        </div>
                    </div>

                    <div className="lg:col-span-1">
                        <label className="text-[9px] font-bold text-gray-400 uppercase mb-1.5 block tracking-widest">Estoque</label>
                        <input type="number" value={bulkQty} onChange={e => setBulkQty(e.target.value)} className="border-2 border-gray-100 p-3 rounded-xl text-xs bg-gray-50 outline-none h-11 w-full focus:border-[#D4AF37] transition-all" placeholder="Qtd" />
                    </div>

                    <div className="lg:col-span-1">
                        <label className="text-[9px] font-bold text-gray-400 uppercase mb-1.5 block tracking-widest">Status</label>
                        <button
                            onClick={() => setBulkIsClosed(prev => prev === null ? true : prev === true ? false : null)}
                            className={`w-full flex items-center justify-center gap-2 border-2 p-3 rounded-xl text-xs h-11 transition-all ${bulkIsClosed === null
                                ? 'bg-gray-50 text-gray-400 border-gray-100'
                                : bulkIsClosed
                                    ? 'bg-red-50 text-red-600 border-red-100'
                                    : 'bg-green-50 text-green-600 border-green-100'
                                }`}
                        >
                            {bulkIsClosed === null ? <Eye size={16} /> : bulkIsClosed ? <EyeOff size={16} /> : <Eye size={16} />}
                            <span className="text-[9px] font-bold uppercase">{bulkIsClosed === null ? '-' : bulkIsClosed ? 'Inat.' : 'Ativo'}</span>
                        </button>
                    </div>

                    <div className="lg:col-span-1">
                        <label className="text-[9px] font-bold text-gray-400 uppercase mb-1.5 block tracking-widest text-center">In</label>
                        <button
                            onClick={() => setBulkNoCheckIn(prev => prev === null ? true : prev === true ? false : null)}
                            className={`w-full flex items-center justify-center border-2 p-3 rounded-xl text-xs h-11 transition-all ${bulkNoCheckIn === null
                                ? 'bg-gray-50 text-gray-400 border-gray-100'
                                : bulkNoCheckIn
                                    ? 'bg-orange-500 text-white border-orange-600'
                                    : 'bg-white text-gray-400 border-gray-200'
                                }`}
                        >
                            <LoginIcon size={16} />
                        </button>
                    </div>

                    <div className="lg:col-span-1">
                        <label className="text-[9px] font-bold text-gray-400 uppercase mb-1.5 block tracking-widest text-center">Out</label>
                        <button
                            onClick={() => setBulkNoCheckOut(prev => prev === null ? true : prev === true ? false : null)}
                            className={`w-full flex items-center justify-center border-2 p-3 rounded-xl text-xs h-11 transition-all ${bulkNoCheckOut === null
                                ? 'bg-gray-50 text-gray-400 border-gray-100'
                                : bulkNoCheckOut
                                    ? 'bg-red-500 text-white border-red-600'
                                    : 'bg-white text-gray-400 border-gray-200'
                                }`}
                        >
                            <LogoutIcon size={16} />
                        </button>
                    </div>

                    <div className="lg:col-span-12 xl:col-span-1 mt-4 xl:mt-0">
                        <button
                            onClick={handleBulkApply}
                            disabled={isSaving}
                            className={`w-full p-3 rounded-xl font-bold uppercase text-[10px] tracking-widest transition shadow-lg h-11 active:scale-95 ${isSaving
                                ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                : 'bg-[#0F2820] text-[#D4AF37] hover:bg-[#1a3c30]'
                                }`}
                        >
                            {isSaving ? 'Sinc...' : 'Aplicar'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl overflow-hidden shadow-xl border border-gray-200 flex flex-col h-[65vh] md:h-[700px]">
                <div className="p-4 flex flex-wrap gap-4 justify-between items-center bg-[#0F2820] text-white">
                    <div className="flex items-center gap-4">
                        <div className="bg-[#D4AF37]/20 p-2 rounded-lg">
                            <Grid size={20} className="text-[#D4AF37]" />
                        </div>
                        <span className="font-serif font-bold uppercase tracking-widest text-xs md:text-sm">Mapa de Disponibilidade & Tarifas</span>
                    </div>
                    <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/20 ml-auto md:ml-0">
                        <button
                            onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
                            disabled={!canGoPrev}
                            className={`p-1.5 rounded-full transition ${canGoPrev ? 'hover:bg-white/10 opacity-100' : 'opacity-30 cursor-not-allowed'}`}
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <span className="font-bold uppercase tracking-widest text-[10px] md:text-[11px] min-w-[140px] text-center">{currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
                        <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="hover:bg-white/10 p-1.5 rounded-full transition"><ChevronRight size={18} /></button>
                    </div>
                </div>

                <div className="overflow-x-auto overflow-y-auto flex-1 bg-gray-50 border-t border-gray-200 relative">
                    <div className="min-w-max">
                        <div className="flex sticky top-0 z-30 bg-gray-100 border-b border-gray-300 shadow-sm">
                            <div className="w-40 md:w-56 shrink-0 p-4 bg-gray-200 border-r border-gray-300 font-bold text-[9px] md:text-[10px] uppercase tracking-[0.2em] text-gray-500 flex items-end sticky left-0 z-40 bg-gray-200 shadow-[2px_0_5px_rgba(0,0,0,0.1)]">Acomodações</div>
                            {daysArray.map(d => (
                                <div key={d} className="w-[80px] md:w-[90px] shrink-0 p-3 text-center border-r border-gray-300 flex flex-col items-center bg-gray-100">
                                    <span className="text-[13px] md:text-[15px] font-bold text-[#0F2820]">{d}</span>
                                    <span className="text-[8px] md:text-[9px] text-gray-400 uppercase font-bold">{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][new Date(year, month, d).getDay()]}</span>
                                </div>
                            ))}
                        </div>
                        {sortRoomsByPriority(rooms.filter(r => r.active)).map(room => (
                            <React.Fragment key={room.id}>
                                {/* Linha de PREÇO */}
                                <div className="flex border-b border-gray-200 group">
                                    <div className="w-40 md:w-56 shrink-0 p-4 bg-white border-r border-gray-300 flex items-center gap-3 sticky left-0 z-20 group-hover:bg-amber-50/30 transition shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                                        <div className="w-2 h-2 rounded-full bg-solar-gold shadow-sm"></div>
                                        <div className="min-w-0">
                                            <span className="block font-bold text-[10px] md:text-[11px] text-[#0F2820] truncate uppercase tracking-tight">{room.name}</span>
                                            <span className="text-[8px] text-gray-400 uppercase font-black tracking-tighter">Tarifa Diária</span>
                                        </div>
                                    </div>
                                    {daysArray.map(d => {
                                        const iso = toLocalISO(new Date(year, month, d));
                                        const ov = room.overrides?.find(o => o.dateIso === iso);
                                        const p = ov?.price ?? room.price;
                                        const isClosed = ov?.isClosed || (ov?.availableQuantity === 0);
                                        return (
                                            <div key={d} className={`w-[80px] md:w-[90px] shrink-0 border-r border-gray-200 h-10 md:h-12 transition-colors ${isClosed ? 'bg-red-50/50' : 'hover:bg-amber-50'}`}>
                                                <MapCell type="price" value={p} isClosed={ov?.isClosed} onChange={(val) => updateOverrideField(room.id, iso, 'price', val)} />
                                            </div>
                                        );
                                    })}
                                </div>
                                {/* Linha de ESTOQUE */}
                                <div className="flex border-b border-gray-200 group bg-gray-50/20">
                                    <div className="w-40 md:w-56 shrink-0 p-4 bg-white border-r border-gray-300 flex items-center gap-3 sticky left-0 z-20 group-hover:bg-green-50/30 transition shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-sm"></div>
                                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">Vagas Disp.</span>
                                    </div>
                                    {daysArray.map(d => {
                                        const iso = toLocalISO(new Date(year, month, d));
                                        const ov = room.overrides?.find(o => o.dateIso === iso);
                                        const q = ov?.availableQuantity ?? room.totalQuantity;
                                        const isClosed = ov?.isClosed;
                                        return (
                                            <div key={d} className={`w-[80px] md:w-[90px] shrink-0 border-r border-gray-200 h-10 md:h-12 transition-colors ${isClosed ? 'bg-red-50/50' : 'hover:bg-green-50/30'}`}>
                                                <MapCell type="qty" value={q} isClosed={isClosed} onChange={(val) => updateOverrideField(room.id, iso, 'availableQuantity', val)} />
                                            </div>
                                        );
                                    })}
                                </div>
                                {/* Linha de RESTRIÇÕES */}
                                <div className="flex border-b-4 border-gray-200 group bg-gray-50/40">
                                    <div className="w-40 md:w-56 shrink-0 p-4 bg-white border-r border-gray-300 flex flex-col justify-center sticky left-0 z-20 group-hover:bg-blue-50/30 transition shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">Restrições</span>
                                    </div>
                                    {daysArray.map(d => {
                                        const iso = toLocalISO(new Date(year, month, d));
                                        const ov = room.overrides?.find(o => o.dateIso === iso);
                                        const isClosed = ov?.isClosed;
                                        return (
                                            <div key={d} className={`w-[80px] md:w-[90px] shrink-0 border-r border-gray-200 h-10 md:h-12 flex flex-col items-center justify-center transition-colors ${isClosed ? 'bg-red-100/30' : 'hover:bg-blue-50/20'}`}>
                                                <div className="flex items-center justify-center gap-1 w-full px-1">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            updateOverrideField(room.id, iso, 'isClosed', !isClosed);
                                                        }}
                                                        title={isClosed ? "Abrir Vendas" : "Fechar Vendas"}
                                                        className={`p-1.5 rounded-lg transition-all border ${isClosed ? 'text-red-600 bg-red-100 border-red-200' : 'text-green-600 bg-white border-gray-200 hover:bg-green-100'}`}
                                                    >
                                                        {isClosed ? <EyeOff size={14} /> : <Eye size={14} />}
                                                    </button>
                                                    <MapCell
                                                        type="restr"
                                                        value={null}
                                                        isClosed={isClosed}
                                                        noCheckIn={ov?.noCheckIn}
                                                        noCheckOut={ov?.noCheckOut}
                                                        onChange={(val) => {
                                                            if (val.noCheckIn !== undefined) updateOverrideField(room.id, iso, 'noCheckIn', val.noCheckIn);
                                                            if (val.noCheckOut !== undefined) updateOverrideField(room.id, iso, 'noCheckOut', val.noCheckOut);
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
