import React from 'react';
import { Eye, Clock, CheckCircle2, XCircle, Search, Calendar, User, CreditCard, ArrowRight } from 'lucide-react';
import { Reservation } from '../../types';
import { formatDisplayDate } from '../../utils/dateUtils';

interface ReservationsListProps {
    reservations: Reservation[];
    onViewDetails: (reservation: Reservation) => void;
}

const getShortReservationId = (id: string): string => {
    if (!id) return '---';
    return id.replace('RES-', '').replace(/-/g, '').substring(0, 8).toUpperCase();
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    switch (status) {
        case 'CONFIRMED':
            return <span className="flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-700 rounded-full text-[9px] font-bold uppercase tracking-widest border border-green-200"><CheckCircle2 size={12} /> Confirmada</span>;
        case 'CANCELED':
            return <span className="flex items-center gap-1.5 px-3 py-1 bg-red-100 text-red-700 rounded-full text-[9px] font-bold uppercase tracking-widest border border-red-200"><XCircle size={12} /> Cancelada</span>;
        default:
            return <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[9px] font-bold uppercase tracking-widest border border-amber-200"><Clock size={12} /> Pendente</span>;
    }
};

export const ReservationsList: React.FC<ReservationsListProps> = ({ reservations, onViewDetails }) => {
    const [searchTerm, setSearchTerm] = React.useState('');

    const filteredReservations = reservations.filter(res => {
        const name = (res.mainGuest?.name || '').toLowerCase();
        const email = (res.mainGuest?.email || '').toLowerCase();
        const id = (res.id || '').toLowerCase();
        const cleanId = id.replace(/-/g, '').replace(/^res/, '');
        const company = (res.companyName || '').toLowerCase();
        const term = searchTerm.toLowerCase().trim();
        const cleanTerm = term.replace(/-/g, '').replace(/^res/, '');
        
        return name.includes(term) || 
               email.includes(term) || 
               id.includes(term) || 
               (cleanTerm.length > 0 && cleanId.includes(cleanTerm)) || 
               company.includes(term);
    });

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar por nome, e-mail ou ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-50 border-2 border-slate-100 p-3 pl-12 rounded-xl text-sm outline-none focus:border-solar-gold transition-all"
                    />
                </div>
                <div className="flex items-center gap-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                    <span>Total: <span className="text-solar-green">{reservations.length}</span></span>
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-200"></div>
                    <span>Filtrados: <span className="text-solar-gold">{filteredReservations.length}</span></span>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {filteredReservations.length > 0 ? (
                    filteredReservations.map((res) => (
                        <div
                            key={res.id}
                            className="group bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-xl hover:border-solar-gold/30 transition-all duration-300 flex flex-col md:flex-row md:items-center gap-6 cursor-pointer relative overflow-hidden"
                            onClick={() => onViewDetails(res)}
                        >
                            <div className="absolute top-0 left-0 w-1 h-full bg-solar-gold opacity-0 group-hover:opacity-100 transition-opacity"></div>

                            <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-3 mb-3">
                                    <span className="text-[10px] font-black text-solar-gold bg-solar-gold/5 px-2 py-1 rounded uppercase tracking-[0.2em]">{getShortReservationId(res.id)}</span>
                                    <StatusBadge status={res.status} />
                                    <span className="text-[10px] text-slate-300 ml-auto md:ml-0">{formatDisplayDate(res.createdAt)}</span>
                                </div>

                                <h3 className="text-lg font-serif font-bold text-solar-green mb-1 flex items-center gap-2 flex-wrap">
                                    <span className="truncate max-w-full">{res.mainGuest.name || "Hóspede Não Informado"}</span>
                                    {res.companyName && (
                                        <span className="text-[10px] font-sans font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 uppercase tracking-widest flex items-center gap-1 truncate max-w-[200px]">
                                            🏢 {res.companyName}
                                        </span>
                                    )}
                                </h3>

                                <div className="flex flex-wrap items-center gap-y-2 gap-x-6 text-[11px] text-slate-500 font-medium">
                                    <div className="flex items-center gap-1.5"><Calendar size={14} className="text-solar-gold/60" /> {formatDisplayDate(res.checkIn)} — {formatDisplayDate(res.checkOut)}</div>
                                    <div className="flex items-center gap-1.5"><User size={14} className="text-solar-gold/60" /> {res.rooms.length} {res.rooms.length === 1 ? 'acomodação' : 'acomodações'}</div>
                                    <div className="flex items-center gap-1.5 font-bold text-solar-green"><CreditCard size={14} className="text-solar-gold/60" /> R$ {res.totalPrice.toLocaleString()}</div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6 shrink-0">
                                <button
                                    className="bg-slate-50 text-slate-600 p-3 rounded-xl group-hover:bg-solar-gold group-hover:text-solar-green transition-all"
                                    title="Ver Detalhes"
                                >
                                    <ArrowRight size={20} />
                                </button>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="bg-white rounded-2xl p-20 border border-dashed border-slate-200 text-center space-y-4">
                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                            <Search size={32} className="text-slate-200" />
                        </div>
                        <div className="space-y-1">
                            <p className="font-serif text-xl text-slate-400">Nenhuma reserva encontrada</p>
                            <p className="text-xs text-slate-300 uppercase tracking-widest">Tente ajustar seus termos de busca</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
