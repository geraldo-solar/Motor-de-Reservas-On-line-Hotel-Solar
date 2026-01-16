import React, { useState } from 'react';
import { Settings, Save, Shield, Database, Layout, Smartphone } from 'lucide-react';
import { HotelConfig } from '../../types';

interface SettingsManagementProps {
    config: HotelConfig;
    onUpdateConfig: (config: HotelConfig) => void;
    isSaving?: boolean;
}

export const SettingsManagement: React.FC<SettingsManagementProps> = ({ config, onUpdateConfig, isSaving }) => {
    const [formData, setFormData] = useState<HotelConfig>(config);

    const handleSave = () => {
        onUpdateConfig(formData);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center gap-4 border-b border-gray-100 pb-6">
                <div className="p-4 bg-solar-gold/10 rounded-2xl">
                    <Settings size={32} className="text-solar-gold" />
                </div>
                <div>
                    <h2 className="text-2xl font-serif font-bold text-solar-green">Configurações do Motor</h2>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Personalize parâmetros globais do sistema de reservas</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                    <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
                        <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                            <Smartphone size={20} className="text-solar-gold" />
                            <h3 className="font-bold text-sm text-solar-green uppercase tracking-widest">Canais de Contato</h3>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">WhatsApp de Vendas</label>
                                <input
                                    type="text"
                                    value={formData.whatsappNumber}
                                    onChange={e => setFormData({ ...formData, whatsappNumber: e.target.value })}
                                    className="w-full border-2 border-slate-50 p-4 rounded-xl text-sm bg-slate-50 focus:border-solar-gold outline-none transition-all font-bold"
                                    placeholder="Ex: 554399999999"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">E-mail para Notificações</label>
                                <input
                                    type="email"
                                    value={formData.notificationEmail || ''}
                                    onChange={e => setFormData({ ...formData, notificationEmail: e.target.value })}
                                    className="w-full border-2 border-slate-50 p-4 rounded-xl text-sm bg-slate-50 focus:border-solar-gold outline-none transition-all font-bold"
                                    placeholder="reservas@hotelsolar.com.br"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
                        <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                            <Shield size={20} className="text-solar-gold" />
                            <h3 className="font-bold text-sm text-solar-green uppercase tracking-widest">Políticas & Regras</h3>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-50">
                                <div>
                                    <span className="block text-[10px] font-bold text-solar-green uppercase tracking-tight">Reservas Online Ativas</span>
                                    <span className="text-[9px] text-slate-400">Permite que clientes finalizem reservas pelo site</span>
                                </div>
                                <button
                                    onClick={() => setFormData({ ...formData, allowOnlineBooking: !formData.allowOnlineBooking })}
                                    className={`w-14 h-8 rounded-full relative transition-all ${formData.allowOnlineBooking ? 'bg-green-500' : 'bg-slate-200'}`}
                                >
                                    <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all ${formData.allowOnlineBooking ? 'right-1' : 'left-1'}`}></div>
                                </button>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Antecedência Mínima (Horas)</label>
                                <input
                                    type="number"
                                    value={formData.minBookingLeadTimeHours || 24}
                                    onChange={e => setFormData({ ...formData, minBookingLeadTimeHours: Number(e.target.value) })}
                                    className="w-full border-2 border-slate-50 p-4 rounded-xl text-sm bg-slate-50 focus:border-solar-gold outline-none transition-all font-bold"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
                        <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                            <Database size={20} className="text-solar-gold" />
                            <h3 className="font-bold text-sm text-solar-green uppercase tracking-widest">Integração & Backup</h3>
                        </div>
                        <div className="p-6 rounded-2xl border-2 border-dashed border-slate-100 text-center space-y-3">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Sincronização com Supabase</p>
                            <div className="flex items-center justify-center gap-2 text-green-500">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                <span className="text-[10px] font-black uppercase tracking-widest">Conectado em tempo real</span>
                            </div>
                        </div>
                    </div>

                    <div className="p-8 bg-[#0F2820] rounded-3xl shadow-2xl space-y-6 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-solar-gold/10 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-150 duration-700"></div>
                        <h3 className="font-serif font-bold text-xl text-[#D4AF37] relative z-10">Salvar Mudanças</h3>
                        <p className="text-xs text-white/60 leading-relaxed relative z-10">As alterações nas configurações globais impactam imediatamente a experiência do usuário no motor de reservas.</p>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="w-full bg-solar-gold text-solar-green py-5 rounded-2xl font-bold uppercase tracking-[0.3em] shadow-xl hover:bg-white transition-all active:scale-95 flex items-center justify-center gap-3 relative z-10"
                        >
                            {isSaving ? 'Salvando...' : <><Save size={20} /> Aplicar Configurações</>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
