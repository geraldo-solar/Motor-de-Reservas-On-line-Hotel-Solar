import React from 'react';
import { Plus, Trash2, BedDouble, Users, Check, XCircle } from 'lucide-react';
import { Room } from '../../types';

interface RoomsManagementProps {
    rooms: Room[];
    onEditRoom: (room: Room) => void;
    onNewRoom: () => void;
    onDeleteRoom: (roomId: string) => Promise<boolean>;
    onUpdateRooms: React.Dispatch<React.SetStateAction<Room[]>>;
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

export const RoomsManagement: React.FC<RoomsManagementProps> = ({ rooms, onEditRoom, onNewRoom, onDeleteRoom, onUpdateRooms }) => {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div>
                    <h2 className="text-xl font-serif font-bold text-solar-green uppercase tracking-widest">Gestão de Inventário</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Configure as acomodações disponíveis no hotel</p>
                </div>
                <button
                    onClick={onNewRoom}
                    className="bg-[#0F2820] text-[#D4AF37] px-8 py-4 rounded-xl font-bold uppercase text-[10px] tracking-[0.2em] flex items-center gap-3 hover:bg-[#1a3c30] transition shadow-xl active:scale-95"
                >
                    <Plus size={18} /> Adicionar Acomodação
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {sortRoomsByPriority(rooms).map(room => (
                    <div
                        key={room.id}
                        className={`group bg-white rounded-3xl overflow-hidden shadow-sm border transition-all duration-500 hover:shadow-2xl relative ${room.active ? 'border-slate-100' : 'border-red-100 opacity-80'}`}
                    >
                        {!room.active && (
                            <div className="absolute top-4 left-4 z-10 bg-red-500 text-white px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-lg">
                                <XCircle size={10} /> Inativo no Site
                            </div>
                        )}
                        <div className="aspect-[16/10] relative overflow-hidden bg-slate-100">
                            {room.imageUrls?.[0] ? (
                                <img src={room.imageUrls[0]} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={room.name} />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-300"><BedDouble size={48} /></div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>

                            <button
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    if (window.confirm(`ATENÇÃO: Deseja excluir permanentemente a acomodação "${room.name}"? Esta ação não pode ser desfeita.`)) {
                                        const success = await onDeleteRoom(room.id);
                                        if (success) {
                                            onUpdateRooms(prev => prev.filter(r => r.id !== room.id));
                                        } else {
                                            alert("Erro ao excluir. Verifique se há reservas vinculadas.");
                                        }
                                    }
                                }}
                                className="absolute top-4 right-4 bg-white/20 hover:bg-red-500 text-white p-3 rounded-2xl backdrop-blur-md transition-all shadow-xl z-20 group/trash" title="Excluir Acomodação"
                            >
                                <Trash2 size={20} className="group-hover/trash:scale-110 transition-transform" />
                            </button>
                        </div>

                        <div className="p-8">
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="font-serif font-bold text-xl text-solar-green">{room.name}</h3>
                                <span className="font-serif font-bold text-solar-gold text-lg">R$ {room.price.toLocaleString()}</span>
                            </div>

                            <div className="flex items-center gap-4 text-xs text-slate-400 mb-6 font-bold uppercase tracking-widest">
                                <div className="flex items-center gap-1.5"><Users size={14} className="text-solar-gold" /> {room.capacity} Pessoas</div>
                                <div className="flex items-center gap-1.5"><Check size={14} className="text-solar-gold" /> {room.totalQuantity} Unidades</div>
                            </div>

                            <button
                                onClick={() => onEditRoom(room)}
                                className="w-full bg-slate-50 text-slate-600 py-4 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-solar-gold hover:text-solar-green transition-all shadow-sm active:scale-95"
                            >
                                Editar Detalhes
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
