import React, { useState } from 'react';
import { Lock, ArrowRight, ShieldCheck, User } from 'lucide-react';

interface AdminLoginProps {
    onLogin: (password: string) => void;
    error?: boolean;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLogin, error }) => {
    const [password, setPassword] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onLogin(password);
    };

    return (
        <div className="min-h-screen bg-[#0F2820] flex items-center justify-center p-6 relative overflow-hidden">
            {/* Background Decorative Elements */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-solar-gold/5 rounded-full -mr-64 -mt-64 blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-solar-gold/5 rounded-full -ml-64 -mb-64 blur-3xl"></div>

            <div className="w-full max-w-md relative z-10">
                <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-white/20 backdrop-blur-sm">
                    <div className="bg-slate-50/50 p-10 text-center border-b border-gray-100">
                        <div className="w-20 h-20 bg-[#0F2820] rounded-3xl mx-auto flex items-center justify-center shadow-2xl mb-6 transform rotate-3 hover:rotate-0 transition-transform duration-500">
                            <span className="text-solar-gold font-serif font-black text-4xl">S</span>
                        </div>
                        <h2 className="text-2xl font-serif font-bold text-solar-green tracking-tight">Painel de Controle</h2>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em] mt-2">Área Administrativa Restrita</p>
                    </div>

                    <div className="p-10">
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="space-y-4">
                                <div className="relative group">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-solar-gold transition-colors">
                                        <Lock size={20} />
                                    </div>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Senha de Acesso"
                                        className={`w-full bg-slate-50 border-2 py-4 pl-12 pr-4 rounded-2xl outline-none transition-all text-sm font-bold tracking-widest ${error ? 'border-red-200 focus:border-red-500' : 'border-slate-100 focus:border-solar-gold'}`}
                                        autoFocus
                                    />
                                </div>
                                {error && (
                                    <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest text-center animate-bounce">Senha incorreta. Tente novamente.</p>
                                )}
                            </div>

                            <button
                                type="submit"
                                className="w-full bg-[#0F2820] text-solar-gold py-5 rounded-2xl font-bold uppercase tracking-[0.3em] hover:bg-black transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3"
                            >
                                Acessar Sistema <ArrowRight size={18} />
                            </button>
                        </form>

                        <div className="mt-10 pt-8 border-t border-gray-100 flex flex-col items-center gap-4">
                            <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-full border border-slate-100">
                                <ShieldCheck size={14} className="text-green-500" />
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Conexão Segura SSL</span>
                            </div>
                            <p className="text-[9px] text-slate-300 text-center uppercase tracking-widest leading-loose">
                                Em caso de perda de acesso, entre em contato com o suporte técnico da plataforma.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
