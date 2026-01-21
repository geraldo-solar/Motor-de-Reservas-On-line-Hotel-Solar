import React, { useState, useEffect, useRef } from 'react';
import { X, Ticket, Plus, Trash2, Calendar, Gift, Image as ImageIcon, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Room, HolidayPackage } from '../../types';
import { DateRangePickerModal } from './DateRangePickerModal';
import { formatDisplayDate } from '../../utils/dateUtils';
import { getPublicImageUrl } from '../../utils/imageUtils';
import { generateUUID } from '../../utils/uuid';

interface PackageEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    pkg: HolidayPackage | null;
    rooms: Room[];
    onSave: (pkg: HolidayPackage) => void;
    onDelete: (pkg: HolidayPackage) => void;
}

const fileToBase64 = (file: File, maxWidth = 800, quality = 0.7): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const img = new Image();
            img.src = reader.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                    resolve(compressedBase64);
                } else {
                    resolve(reader.result as string);
                }
            };
            img.onerror = () => resolve(reader.result as string);
        };
        reader.onerror = error => reject(error);
    });
};

export const PackageEditorModal: React.FC<PackageEditorModalProps> = ({ isOpen, onClose, pkg, rooms, onSave, onDelete }) => {
    const emptyPackage: HolidayPackage = {
        id: generateUUID(),
        name: '',
        description: '',
        imageUrl: '',
        location: '',
        includes: [],
        benefits: [],
        active: true,
        startIsoDate: '',
        endIsoDate: '',
        roomPrices: rooms.map(r => ({ roomId: r.id, price: 0 })),
        noCheckoutDates: [],
        noCheckInDates: [],
        fullPeriodDiscountPct: 0
    };

    const [formData, setFormData] = useState<HolidayPackage>(pkg || emptyPackage);
    const [includesList, setIncludesList] = useState<string[]>(pkg?.includes || pkg?.benefits || ['']);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setShowDeleteConfirm(false);
            const initialPkg = pkg || { ...emptyPackage, id: generateUUID() };
            const currentRoomPrices = [...(initialPkg.roomPrices || [])];
            rooms.forEach(r => {
                if (!currentRoomPrices.find(rp => rp.roomId === r.id)) {
                    currentRoomPrices.push({ roomId: r.id, price: 0 });
                }
            });
            setFormData({ ...initialPkg, roomPrices: currentRoomPrices });
            setIncludesList((initialPkg.includes || initialPkg.benefits || ['']).length > 0 ? (initialPkg.includes || initialPkg.benefits || ['']) : ['']);
        }
    }, [isOpen, pkg, rooms]);

    if (!isOpen) return null;

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const base64 = await fileToBase64(file);
                setFormData({ ...formData, imageUrl: base64 });
            } catch (err) {
                alert("Erro ao carregar imagem.");
            }
        }
    };

    const handleAddInclude = () => setIncludesList([...includesList, '']);
    const handleRemoveInclude = (index: number) => setIncludesList(includesList.filter((_, i) => i !== index));
    const handleUpdateInclude = (index: number, val: string) => {
        const newList = [...includesList];
        newList[index] = val;
        setIncludesList(newList);
    };

    const updateRoomPrice = (roomId: string, price: number) => {
        setFormData(prev => ({
            ...prev,
            roomPrices: prev.roomPrices.map(rp => rp.roomId === roomId ? { ...rp, price } : rp)
        }));
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[400] flex items-center justify-center p-4 backdrop-blur-sm">
            <DateRangePickerModal
                isOpen={isPickerOpen}
                onClose={() => setIsPickerOpen(false)}
                onSelect={(s, e) => { setFormData({ ...formData, startIsoDate: s, endIsoDate: e }); setIsPickerOpen(false); }}
                initialStart={formData.startIsoDate}
                initialEnd={formData.endIsoDate}
            />
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden border border-[#D4AF37]/30 animate-in zoom-in flex flex-col max-h-[90vh]">
                <div className="bg-[#0F2820] p-6 text-[#D4AF37] flex justify-between items-center shrink-0 border-b border-[#D4AF37]/20 sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-solar-gold/10 rounded-2xl">
                            <Ticket size={24} className="text-solar-gold" />
                        </div>
                        <div>
                            <h3 className="font-serif font-bold tracking-widest uppercase text-xl">{pkg ? 'Editar Pacote Especial' : 'Novo Pacote Solar'}</h3>
                            <p className="text-[10px] text-white/50 uppercase font-black tracking-widest mt-0.5">Gestão de Ofertas e Períodos Festivos</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {pkg && (
                            <div className="flex items-center gap-2">
                                {!showDeleteConfirm ? (
                                    <button
                                        type="button"
                                        onClick={() => setShowDeleteConfirm(true)}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-red-600/10 text-red-400 border border-red-400/20 rounded-xl text-[10px] font-bold uppercase transition-all hover:bg-red-600 hover:text-white"
                                    >
                                        <Trash2 size={16} /> Excluir
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2 bg-red-600 p-1.5 rounded-xl border border-red-400/30 animate-in zoom-in-95">
                                        <span className="text-[9px] font-black text-white uppercase px-2">Excluir?</span>
                                        <button
                                            type="button"
                                            onClick={() => onDelete(pkg)}
                                            className="px-3 py-1.5 bg-white text-red-600 rounded-lg text-[9px] font-black uppercase hover:bg-slate-100"
                                        >
                                            Sim
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowDeleteConfirm(false)}
                                            className="px-3 py-1.5 bg-black/20 text-white rounded-lg text-[9px] font-black uppercase hover:bg-black/30"
                                        >
                                            Não
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        <button onClick={onClose} className="hover:rotate-90 transition-transform p-2 bg-white/5 rounded-full"><X size={24} /></button>
                    </div>
                </div>

                <div className="p-8 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                        <div className="space-y-8">
                            <div className="space-y-6">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Título do Pacote</label>
                                    <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full border-2 border-gray-100 p-4 rounded-xl text-sm bg-slate-50 focus:border-solar-gold transition-all outline-none font-bold" placeholder="Ex: Carnaval 2024" />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Descrição Breve</label>
                                    <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full border-2 border-gray-100 p-4 rounded-xl text-sm bg-slate-50 focus:border-solar-gold transition-all outline-none h-24 resize-none" placeholder="Detalhes do que o pacote oferece..." />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Período Selecionado</label>
                                        <button onClick={() => setIsPickerOpen(true)} className="w-full flex items-center justify-between border-2 border-gray-100 p-4 rounded-xl text-sm bg-slate-50 hover:border-solar-gold transition-all h-14 text-left group">
                                            <div className="flex items-center gap-3">
                                                <Calendar size={18} className="text-solar-gold" />
                                                <span className="font-bold text-solar-green">
                                                    {formatDisplayDate(formData.startIsoDate) + ' — ' + formatDisplayDate(formData.endIsoDate)}
                                                </span>
                                            </div>
                                        </button>
                                    </div>
                                    <div className="space-y-1.5 flex flex-col justify-end">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1.5">Visibilidade</label>
                                        <button onClick={() => setFormData({ ...formData, active: !formData.active })} className={`w-full h-14 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border-2 flex items-center justify-center gap-2 ${formData.active ? 'bg-green-50 border-green-200 text-green-600' : 'bg-red-50 border-red-200 text-red-600'}`}>
                                            <Check size={16} className={formData.active ? 'opacity-100' : 'opacity-0'} />
                                            {formData.active ? 'Pacote Ativo' : 'Pacote Pausado'}
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Categoria</label>
                                        <div className="flex bg-slate-100 p-1 rounded-xl">
                                            <button
                                                onClick={() => setFormData({ ...formData, category: 'SPECIAL' })}
                                                className={`flex-1 py-3 rounded-lg text-[10px] font-bold uppercase transition-all ${formData.category !== 'JULY' ? 'bg-white text-solar-green shadow-sm' : 'text-slate-400'}`}
                                            >
                                                Especial
                                            </button>
                                            <button
                                                onClick={() => setFormData({ ...formData, category: 'JULY' })}
                                                className={`flex-1 py-3 rounded-lg text-[10px] font-bold uppercase transition-all ${formData.category === 'JULY' ? 'bg-solar-gold text-solar-green shadow-sm' : 'text-slate-400'}`}
                                            >
                                                Férias Julho
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5 flex flex-col justify-end">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1.5">Estilo Promocional</label>
                                        <button
                                            onClick={() => setFormData({ ...formData, isPromotional: !formData.isPromotional })}
                                            className={`w-full h-12 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all border-2 flex items-center justify-center gap-2 ${formData.isPromotional ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-white border-slate-100 text-slate-400'}`}
                                        >
                                            <Gift size={14} />
                                            {formData.isPromotional ? 'Estilo Diferenciado ON' : 'Padrão'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Gift size={18} className="text-solar-gold" />
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Incluso no Pacote / Programação</label>
                                </div>
                                <button onClick={handleAddInclude} className="bg-solar-gold/10 text-solar-gold p-1.5 rounded-lg hover:bg-solar-gold hover:text-white transition-all"><Plus size={16} /></button>
                            </div>
                            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 min-h-[200px]">
                                {includesList.map((item, idx) => (
                                    <div key={idx} className="flex gap-2">
                                        <div className="flex-1 relative">
                                            <Check className="absolute left-3 top-1/2 -translate-y-1/2 text-solar-gold" size={14} />
                                            <input
                                                type="text"
                                                value={item}
                                                onChange={e => handleUpdateInclude(idx, e.target.value)}
                                                className="w-full border-2 border-white pl-10 p-3 rounded-xl text-xs bg-white outline-none focus:border-solar-gold transition-all shadow-sm"
                                                placeholder="Ex: Show ao vivo no sábado à noite..."
                                            />
                                        </div>
                                        <button onClick={() => handleRemoveInclude(idx)} className="p-3 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={18} /></button>
                                    </div>
                                ))}
                                {includesList.length === 0 && <p className="text-center text-xs text-slate-400 italic py-10">Adicione itens à programação do pacote.</p>}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-8">
                        <div className="space-y-4">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block ml-1">Imagem de Capa do Pacote</label>
                            <div className="space-y-3">
                                <div
                                    className={`relative cursor-pointer h-56 rounded-3xl border-2 border-dashed transition-all flex items-center justify-center overflow-hidden group shadow-sm ${formData.imageUrl ? 'border-solid border-solar-gold' : 'border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300'}`}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    {formData.imageUrl ? (
                                        <>
                                            <img src={getPublicImageUrl(formData.imageUrl)} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                <ImageIcon className="text-white" size={40} />
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-center">
                                            <ImageIcon className="mx-auto text-slate-300 mb-3" size={48} />
                                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Subir Imagem do Pacote</span>
                                            <p className="text-[8px] text-slate-300 uppercase mt-1">Gere ou escolha uma foto marcante</p>
                                        </div>
                                    )}
                                </div>
                                <input
                                    type="text"
                                    value={formData.imageUrl}
                                    onChange={e => setFormData({ ...formData, imageUrl: e.target.value })}
                                    className="w-full border border-slate-200 p-3 rounded-xl text-[10px] outline-none focus:border-solar-gold bg-slate-50/50"
                                    placeholder="Ou cole o link da imagem (Google Drive / URL)"
                                />
                                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block ml-1">Tarifário do Pacote (Preço Fechado por Acomodação)</label>
                            <div className="bg-slate-50 rounded-2xl border border-slate-100 p-6 space-y-4 shadow-inner">
                                {rooms.map(room => (
                                    <div key={room.id} className="flex items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                        <div className="flex-1 min-w-0">
                                            <span className="block text-xs font-bold text-solar-green uppercase tracking-tight truncate">{room.name}</span>
                                            <span className="text-[9px] text-slate-400 uppercase tracking-widest">Valor do Pacote</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-bold text-slate-300">R$</span>
                                            <input
                                                type="number"
                                                value={formData.roomPrices.find(rp => rp.roomId === room.id)?.price || 0}
                                                onChange={e => updateRoomPrice(room.id, Number(e.target.value))}
                                                className="w-28 border-2 border-slate-50 p-2 rounded-lg text-sm bg-slate-50 focus:bg-white focus:border-solar-gold outline-none font-black text-right transition-all"
                                            />
                                        </div>
                                    </div>
                                ))}

                                <div className="mt-6 pt-6 border-t border-slate-200">
                                    <div className="flex items-center justify-between bg-solar-gold/5 p-4 rounded-xl border border-solar-gold/20">
                                        <div className="flex-1">
                                            <span className="block text-xs font-bold text-solar-green uppercase tracking-tight">Desconto Período Completo (%)</span>
                                            <span className="text-[9px] text-slate-500 uppercase tracking-widest">Aplicado se as datas baterem exatamente</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="number"
                                                value={formData.fullPeriodDiscountPct || 0}
                                                onChange={e => setFormData({ ...formData, fullPeriodDiscountPct: Number(e.target.value) })}
                                                className="w-20 border-2 border-solar-gold/10 p-2 rounded-lg text-sm bg-white focus:border-solar-gold outline-none font-black text-center transition-all"
                                                placeholder="0"
                                                min="0"
                                                max="100"
                                            />
                                            <span className="text-xs font-bold text-solar-gold">%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 sticky bottom-0 bg-white py-4 border-t border-slate-50">
                            <button
                                onClick={() => onSave({ ...formData, includes: includesList.map(i => i.trim()).filter(i => i !== '') })}
                                className="w-full bg-[#0F2820] text-[#D4AF37] py-5 rounded-2xl font-bold uppercase tracking-[0.4em] hover:bg-[#1a3c30] transition-all shadow-2xl active:scale-95 flex items-center justify-center gap-3"
                            >
                                Confirmar e Salvar Pacote
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
