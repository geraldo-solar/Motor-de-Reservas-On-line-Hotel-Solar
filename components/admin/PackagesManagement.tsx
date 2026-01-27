import React from 'react';
import { Plus, Ticket, CalendarDays, Check, XCircle } from 'lucide-react';
import { HolidayPackage } from '../../types';
import { getPublicImageUrl } from '../../utils/imageUtils';

interface PackagesManagementProps {
    packages: HolidayPackage[];
    onEditPackage: (pkg: HolidayPackage) => void;
    onNewPackage: () => void;
}

export const PackagesManagement: React.FC<PackagesManagementProps> = ({ packages, onEditPackage, onNewPackage }) => {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div>
                    <h2 className="text-xl font-serif font-bold text-solar-green uppercase tracking-widest">Pacotes & Feriados</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Gerencie ofertas especiais de datas fixas</p>
                </div>
                <button
                    onClick={onNewPackage}
                    className="bg-[#0F2820] text-[#D4AF37] px-8 py-4 rounded-xl font-bold uppercase text-[10px] tracking-[0.2em] flex items-center gap-3 hover:bg-[#1a3c30] transition shadow-xl active:scale-95"
                >
                    <Plus size={18} /> Novo Pacote
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {[...packages].sort((a, b) => a.startIsoDate.localeCompare(b.startIsoDate)).map(pkg => (
                    <div
                        key={pkg.id}
                        className={`group bg-white rounded-3xl overflow-hidden shadow-sm border transition-all duration-500 hover:shadow-2xl relative ${pkg.active ? 'border-slate-100' : 'border-red-100 opacity-80'}`}
                    >
                        {!pkg.active && (
                            <div className="absolute top-4 left-4 z-10 bg-red-500 text-white px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-lg">
                                <XCircle size={10} /> Inativo
                            </div>
                        )}
                        <div className="aspect-[16/9] relative overflow-hidden bg-slate-100">
                            {pkg.imageUrl ? (
                                <img src={getPublicImageUrl(pkg.imageUrl, 400)} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" alt={pkg.name} loading="lazy" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-300"><Ticket size={48} /></div>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="text-white text-[10px] font-black uppercase tracking-[0.3em] border-2 border-white px-4 py-2 rounded-full">Configurar</span>
                            </div>
                        </div>

                        <div className="p-8">
                            <div className="flex items-center gap-2 mb-3">
                                <CalendarDays size={14} className="text-solar-gold" />
                                <span className="text-[10px] font-bold text-solar-gold uppercase tracking-widest">
                                    {new Date(pkg.startIsoDate + 'T12:00:00').toLocaleDateString()} — {new Date(pkg.endIsoDate + 'T12:00:00').toLocaleDateString()}
                                </span>
                            </div>
                            <h3 className="font-serif font-bold text-xl text-solar-green mb-3">{pkg.name}</h3>
                            <p className="text-xs text-slate-400 line-clamp-2 italic mb-6">{pkg.description}</p>

                            <button
                                onClick={() => onEditPackage(pkg)}
                                className="w-full bg-slate-50 text-slate-600 py-4 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-[#0F2820] hover:text-[#D4AF37] transition-all shadow-sm active:scale-95"
                            >
                                Configurar Pacote
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
