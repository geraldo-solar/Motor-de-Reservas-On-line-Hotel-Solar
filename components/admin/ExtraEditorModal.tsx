import React, { useState, useEffect, useRef } from 'react';
import { X, ShoppingBag, Plus, Trash2, Camera, Check } from 'lucide-react';
import { ExtraService } from '../../types';
import { getPublicImageUrl } from '../../utils/imageUtils';

interface ExtraEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    extra: ExtraService | null;
    onSave: (extra: ExtraService) => void;
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

export const ExtraEditorModal: React.FC<ExtraEditorModalProps> = ({ isOpen, onClose, extra, onSave }) => {
    const emptyExtra: ExtraService = {
        id: crypto.randomUUID(),
        name: '',
        description: '',
        price: 0,
        imageUrl: '',
        active: true
    };

    const [formData, setFormData] = useState<ExtraService>(extra || emptyExtra);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setFormData(extra || { ...emptyExtra, id: crypto.randomUUID() });
        }
    }, [isOpen, extra]);

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

    return (
        <div className="fixed inset-0 bg-black/60 z-[500] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-[#D4AF37] animate-in zoom-in">
                <div className="bg-[#0F2820] p-6 text-[#D4AF37] flex justify-between items-center border-b border-[#D4AF37]/20">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-solar-gold/10 rounded-xl"><ShoppingBag size={20} /></div>
                        <h3 className="font-serif font-bold tracking-widest uppercase text-lg">{extra ? 'Editar Serviço' : 'Novo Serviço Extra'}</h3>
                    </div>
                    <button onClick={onClose} className="hover:rotate-90 transition-transform"><X size={24} /></button>
                </div>
                <div className="p-8 space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Nome do Item</label>
                            <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full border-2 border-gray-100 p-4 rounded-xl text-sm bg-slate-50 focus:border-solar-gold outline-none font-bold transition-all" placeholder="Ex: Cesta de Frutas" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Descrição Comercial</label>
                            <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full border-2 border-gray-100 p-4 rounded-xl text-sm bg-slate-50 focus:border-solar-gold outline-none h-24 resize-none transition-all" placeholder="O que está incluso neste serviço?" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Preço (R$)</label>
                                <input type="number" value={formData.price} onChange={e => setFormData({ ...formData, price: Number(e.target.value) })} className="w-full border-2 border-gray-100 p-4 rounded-xl text-sm bg-slate-50 focus:border-solar-gold transition-all outline-none font-bold" />
                            </div>
                            <div className="flex flex-col justify-end">
                                <button
                                    onClick={() => setFormData({ ...formData, active: !formData.active })}
                                    className={`w-full py-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border-2 flex items-center justify-center gap-2 ${formData.active ? 'bg-green-50 border-green-200 text-green-600' : 'bg-red-50 border-red-200 text-red-600'}`}
                                >
                                    <Check size={16} className={formData.active ? 'opacity-100' : 'opacity-0'} />
                                    {formData.active ? 'Ativo' : 'Pausado'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 block">Foto do Serviço</label>
                        <div
                            className={`relative cursor-pointer h-40 rounded-2xl border-2 border-dashed transition-all flex items-center justify-center overflow-hidden group ${formData.imageUrl ? 'border-solid border-solar-gold' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {formData.imageUrl ? (
                                <img src={getPublicImageUrl(formData.imageUrl)} className="w-full h-full object-cover group-hover:scale-110 transition-all duration-700" />
                            ) : (
                                <div className="text-center">
                                    <Camera className="mx-auto text-slate-300 mb-2" size={32} />
                                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Adicionar Foto</span>
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Plus className="text-white" size={32} />
                            </div>
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

                    <div className="pt-4 flex flex-col gap-2">
                        <button onClick={() => onSave(formData)} className="w-full bg-[#0F2820] text-[#D4AF37] py-5 rounded-2xl font-bold uppercase tracking-[0.3em] hover:bg-[#1a3c30] transition-all shadow-2xl active:scale-95">Salvar Serviço</button>
                        <button onClick={onClose} className="w-full text-slate-400 py-2 text-[10px] font-bold uppercase tracking-widest hover:text-slate-600">Cancelar</button>
                    </div>
                </div>
            </div>
        </div>
    );
};
