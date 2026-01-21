import React, { useState, useEffect, useRef } from 'react';
import { X, ListChecks, Check, Plus, Trash2, Camera } from 'lucide-react';
import { Room } from '../../types';
import { getPublicImageUrl } from '../../utils/imageUtils';
import { generateUUID } from '../../utils/uuid';

interface RoomEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    room: Room | null;
    onSave: (room: Room) => void;
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

export const RoomEditorModal: React.FC<RoomEditorModalProps> = ({ isOpen, onClose, room, onSave }) => {
    const emptyRoom: Room = {
        id: generateUUID(),
        name: '',
        description: '',
        price: 0,
        capacity: 2,
        imageUrls: ['', '', '', ''],
        address: '',
        features: [],
        totalQuantity: 1,
        active: true,
        overrides: []
    };

    const [formData, setFormData] = useState<Room>(room || emptyRoom);
    const [featuresList, setFeaturesList] = useState<string[]>(room?.features || ['']);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);

    useEffect(() => {
        if (isOpen) {
            const initialRoom = room || { ...emptyRoom, id: generateUUID() };
            const existingUrls = initialRoom.imageUrls || [];
            const normalizedUrls = [
                existingUrls[0] || '',
                existingUrls[1] || '',
                existingUrls[2] || '',
                existingUrls[3] || ''
            ];
            setFormData({ ...initialRoom, imageUrls: normalizedUrls });
            setFeaturesList(initialRoom.features.length > 0 ? initialRoom.features : ['']);
        }
    }, [isOpen, room]);

    const handleAddFeature = () => setFeaturesList([...featuresList, '']);
    const handleRemoveFeature = (index: number) => setFeaturesList(featuresList.filter((_, i) => i !== index));
    const handleUpdateFeature = (index: number, val: string) => {
        const newList = [...featuresList];
        newList[index] = val;
        setFeaturesList(newList);
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && activeImageIndex !== null) {
            try {
                const base64 = await fileToBase64(file);
                const newUrls = [...formData.imageUrls];
                newUrls[activeImageIndex] = base64;
                setFormData({ ...formData, imageUrls: newUrls });
            } catch (err) {
                alert("Erro ao carregar imagem.");
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[500] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-[#D4AF37] animate-in zoom-in">
                <div className="bg-[#0F2820] p-6 text-[#D4AF37] flex justify-between items-center border-b border-[#D4AF37]/20">
                    <div className="flex items-center gap-4">
                        <h3 className="font-serif font-bold tracking-widest uppercase text-xl">{room ? 'Editar Acomodação' : 'Cadastrar Acomodação'}</h3>
                    </div>
                    <button onClick={onClose} className="hover:rotate-90 transition-transform"><X size={24} /></button>
                </div>
                <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-10 overflow-y-auto max-h-[85vh]">
                    <div className="space-y-6">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Descritivo Comercial</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full border-2 border-gray-100 p-4 rounded-xl text-sm bg-gray-50 focus:border-[#D4AF37] transition-all outline-none font-bold"
                                placeholder="Ex: Suíte Master Frente Mar"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Tarifa Base (R$)</label>
                                <input
                                    type="number"
                                    value={formData.price}
                                    onChange={e => setFormData({ ...formData, price: Number(e.target.value) })}
                                    className="w-full border-2 border-gray-100 p-4 rounded-xl text-sm bg-gray-50 focus:border-[#D4AF37] transition-all outline-none"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Capacidade Máxima</label>
                                <input
                                    type="number"
                                    value={formData.capacity}
                                    onChange={e => setFormData({ ...formData, capacity: Number(e.target.value) })}
                                    className="w-full border-2 border-gray-100 p-4 rounded-xl text-sm bg-gray-50 focus:border-[#D4AF37] transition-all outline-none"
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <ListChecks size={16} className="text-solar-gold" />
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Diferenciais & Comodidades</label>
                                </div>
                                <button onClick={handleAddFeature} className="bg-solar-gold/10 text-solar-gold p-1.5 rounded-lg hover:bg-solar-gold hover:text-white transition-all"><Plus size={16} /></button>
                            </div>
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                {featuresList.map((item, idx) => (
                                    <div key={idx} className="flex gap-2 animate-in slide-in-from-left-2 transition-all">
                                        <div className="flex-1 relative">
                                            <Check className="absolute left-3 top-1/2 -translate-y-1/2 text-solar-gold" size={14} />
                                            <input
                                                type="text"
                                                value={item}
                                                onChange={e => handleUpdateFeature(idx, e.target.value)}
                                                className="w-full border-2 border-slate-100 pl-10 p-3 rounded-xl text-xs bg-white outline-none focus:border-solar-gold transition-all"
                                                placeholder="Ar Condicionado, TV 4K..."
                                            />
                                        </div>
                                        <button onClick={() => handleRemoveFeature(idx)} className="p-3 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={18} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="pt-4 flex items-center gap-6">
                            <div className="flex-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 block mb-2">Quant. Total no Hotel</label>
                                <input type="number" value={formData.totalQuantity} onChange={e => setFormData({ ...formData, totalQuantity: Number(e.target.value) })} className="w-full border-2 border-gray-100 p-4 rounded-xl text-sm bg-gray-50 focus:border-[#D4AF37] outline-none" />
                            </div>
                            <div className="flex-1 flex flex-col justify-end">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-2">Disponibilidade</label>
                                <button
                                    onClick={() => setFormData({ ...formData, active: !formData.active })}
                                    className={`w-full py-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border-2 shadow-sm ${formData.active ? 'bg-green-50 border-green-200 text-green-600' : 'bg-red-50 border-red-200 text-red-500'}`}
                                >
                                    {formData.active ? 'Ativo no Site' : 'Inativo (Pausado)'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-4">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block ml-1">Galeria de Fotos (4 obrigatórias)</label>
                            <div className="grid grid-cols-2 gap-4">
                                {[0, 1, 2, 3].map(index => (
                                    <div key={index} className="space-y-2">
                                        <div
                                            className={`relative group cursor-pointer h-32 rounded-2xl border-2 border-dashed transition-all flex items-center justify-center overflow-hidden shadow-sm ${formData.imageUrls[index] ? 'border-solid border-solar-gold' : 'border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300'}`}
                                            onClick={() => { setActiveImageIndex(index); fileInputRef.current?.click(); }}
                                        >
                                            {formData.imageUrls[index] ? (
                                                <>
                                                    <img
                                                        src={getPublicImageUrl(formData.imageUrls[index])}
                                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                                        referrerPolicy="no-referrer"
                                                        onError={(e) => {
                                                            const target = e.target as HTMLImageElement;
                                                            // Se falhar o lh3, tentamos o formato uc como fallback
                                                            if (target.src.includes('lh3.googleusercontent.com')) {
                                                                const id = target.src.split('/').pop();
                                                                if (id) target.src = `https://docs.google.com/uc?export=view&id=${id}`;
                                                            }
                                                        }}
                                                    />
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                        <Camera className="text-white" size={24} />
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="text-center p-2">
                                                    <Plus className="mx-auto text-slate-300 mb-1" size={20} />
                                                    <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Upload {index + 1}</span>
                                                </div>
                                            )}
                                        </div>
                                        <input
                                            type="text"
                                            value={formData.imageUrls[index]}
                                            onChange={e => {
                                                const newUrls = [...formData.imageUrls];
                                                newUrls[index] = e.target.value;
                                                setFormData({ ...formData, imageUrls: newUrls });
                                            }}
                                            className="w-full border border-slate-200 p-2 rounded-lg text-[9px] outline-none focus:border-solar-gold bg-slate-50/50"
                                            placeholder="Ou cole o link (Drive/URL)"
                                        />
                                    </div>
                                ))}
                            </div>
                            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                            <p className="text-[9px] text-slate-400 italic text-center">As imagens são redimensionadas automaticamente para otimizar o carregamento.</p>
                        </div>

                        <div className="pt-8">
                            <button
                                onClick={() => onSave({ ...formData, features: featuresList.map(item => item.trim()).filter(item => item !== '') })}
                                className="w-full bg-[#0F2820] text-[#D4AF37] py-5 rounded-2xl font-bold uppercase tracking-[0.3em] hover:bg-[#1a3c30] transition-all shadow-2xl active:scale-95"
                            >
                                Confirmar e Salvar
                            </button>
                            <button onClick={onClose} className="w-full text-slate-400 py-3 text-[10px] font-bold uppercase tracking-widest hover:text-slate-600 mt-2">Descartar Alterações</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
