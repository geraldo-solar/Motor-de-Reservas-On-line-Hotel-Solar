import React from 'react';
import { Plus, Trash2, ShoppingBag, Check, XCircle } from 'lucide-react';
import { ExtraService } from '../../types';
import { getPublicImageUrl } from '../../utils/imageUtils';

interface ExtrasManagementProps {
    extras: ExtraService[];
    onEditExtra: (extra: ExtraService) => void;
    onNewExtra: () => void;
    onDeleteExtra: (id: string) => Promise<boolean>;
    onUpdateExtras: React.Dispatch<React.SetStateAction<ExtraService[]>>;
}

export const ExtrasManagement: React.FC<ExtrasManagementProps> = ({ extras, onEditExtra, onNewExtra, onDeleteExtra, onUpdateExtras }) => {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div>
                    <h2 className="text-xl font-serif font-bold text-solar-green uppercase tracking-widest">Serviços Adicionais</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Produtos e serviços para o carrinho de reserva</p>
                </div>
                <button
                    onClick={onNewExtra}
                    className="bg-[#0F2820] text-[#D4AF37] px-8 py-4 rounded-xl font-bold uppercase text-[10px] tracking-[0.2em] flex items-center gap-3 hover:bg-[#1a3c30] transition shadow-xl active:scale-95"
                >
                    <Plus size={18} /> Novo Item
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {extras.map(extra => (
                    <div
                        key={extra.id}
                        className={`group bg-white rounded-3xl overflow-hidden shadow-sm border transition-all duration-500 hover:shadow-2xl relative ${extra.active ? 'border-slate-100' : 'border-red-100 opacity-80'}`}
                    >
                        <div className="aspect-square relative overflow-hidden bg-slate-50 border-b border-slate-100">
                            {extra.imageUrl ? (
                                <img src={getPublicImageUrl(extra.imageUrl)} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={extra.name} />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-200"><ShoppingBag size={48} /></div>
                            )}

                            <button
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    if (window.confirm(`Excluir permanentemente o serviço "${extra.name}"?`)) {
                                        const success = await onDeleteExtra(extra.id);
                                        if (success) {
                                            onUpdateExtras(prev => prev.filter(e => e.id !== extra.id));
                                        }
                                    }
                                }}
                                className="absolute top-3 right-3 bg-white/80 hover:bg-red-500 text-red-500 hover:text-white p-2.5 rounded-xl backdrop-blur-md transition-all shadow-sm z-20"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>

                        <div className="p-6">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-sm text-solar-green uppercase tracking-tight truncate flex-1">{extra.name}</h3>
                                {!extra.active && <XCircle size={14} className="text-red-400 shrink-0" />}
                            </div>
                            <p className="text-lg font-serif font-bold text-solar-gold mb-6">R$ {extra.price.toLocaleString()}</p>

                            <button
                                onClick={() => onEditExtra(extra)}
                                className="w-full bg-slate-50 text-slate-500 py-3 rounded-xl text-[9px] font-bold uppercase tracking-widest hover:bg-solar-gold hover:text-solar-green transition-all shadow-sm active:scale-95"
                            >
                                Editar Serviço
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
