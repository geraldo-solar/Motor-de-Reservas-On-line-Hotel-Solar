import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, AlertCircle } from 'lucide-react';
import { Reservation } from '../types';
import { formatDisplayDate, toLocalISO } from '../utils/dateUtils';
import { sendPreCheckinAdminEmail } from '../services/emailService';

interface PreCheckinPageProps {
    reservationId: string;
    onBack: () => void;
    reservations: Reservation[];
}

interface FNRHData {
    nomeCompleto: string;
    email: string;
    telefone: string;
    cpf: string;
    genero: string;
    rg: string;
    orgaoEmissor: string;
    profissao: string;
    nacionalidade: string;
    dataNascimento: string;
    endereco: {
        cep: string;
        logradouro: string;
        numero: string;
        complemento: string;
        bairro: string;
        cidade: string;
        estado: string;
        pais: string;
    };
}

const INITIAL_DATA: FNRHData = {
    nomeCompleto: '',
    email: '',
    telefone: '',
    cpf: '',
    genero: '',
    rg: '',
    orgaoEmissor: '',
    profissao: '',
    nacionalidade: 'Brasileira',
    dataNascimento: '',
    endereco: {
        cep: '',
        logradouro: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: '',
        estado: '',
        pais: 'Brasil'
    }
};

export const PreCheckinPage: React.FC<PreCheckinPageProps> = ({ reservationId, onBack, reservations }) => {
    const [reservation, setReservation] = useState<Reservation | null>(null);
    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState<FNRHData>(INITIAL_DATA);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Find reservation
        const found = reservations.find(r => r.id === reservationId);
        if (found) {
            setReservation(found);
            setFormData(prev => ({
                ...prev,
                nomeCompleto: found.mainGuest.name,
                email: found.mainGuest.email,
                telefone: found.mainGuest.phone
            }));
        }
        setLoading(false);
    }, [reservationId, reservations]);

    const handleChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleAddressChange = (field: string, value: string) => {
        setFormData(prev => ({
            ...prev,
            endereco: { ...prev.endereco, [field]: value }
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            if (!reservation) throw new Error("Reserva não encontrada");

            // Send email
            const result = await sendPreCheckinAdminEmail(reservation, formData);

            if (result.success) {
                setSuccess(true);
            } else {
                throw new Error(result.error || "Erro ao enviar dados");
            }
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Ocorreu um erro ao enviar o pré-check-in.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center"><p className="text-solar-green animate-pulse">Carregando reserva...</p></div>;
    }

    if (!reservation && !loading) {
        // Fallback: If not found in loaded reservations (might be cold start without supa fetch yet), 
        // we might need to rely on the parent or fetch specifically. 
        // For now, consistent with Admin, we assume reservations are loaded.
        return (
            <div className="min-h-screen bg-[#F9F8F6] flex flex-col items-center justify-center p-4">
                <AlertCircle size={48} className="text-red-500 mb-4" />
                <h1 className="text-2xl font-serif text-solar-green mb-2">Reserva não encontrada</h1>
                <p className="text-slate-500 mb-6 text-center">Não encontramos a reserva #{reservationId.slice(0, 8)}. Verifique o link ou entre em contato.</p>
                <button onClick={onBack} className="text-solar-gold font-bold uppercase tracking-widest text-xs hover:underline">Voltar ao Início</button>
            </div>
        )
    }

    if (success) {
        return (
            <div className="min-h-screen bg-[#F9F8F6] flex flex-col items-center justify-center p-4 animate-in fade-in zoom-in duration-500">
                <div className="bg-white p-8 md:p-12 rounded-[2rem] shadow-2xl text-center max-w-lg w-full relative overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-solar-green via-solar-gold to-solar-green"></div>
                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-600">
                        <Check size={40} />
                    </div>
                    <h1 className="text-3xl font-serif text-solar-green mb-4">Pré-Check-in Confirmado!</h1>
                    <p className="text-slate-500 mb-8 leading-relaxed">
                        Obrigado, <strong>{formData.nomeCompleto.split(' ')[0]}</strong>! <br />
                        Recebemos seus dados com sucesso. Sua chegada será muito mais rápida.
                    </p>
                    <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 mb-8 text-sm text-slate-600">
                        <p className="mb-2 uppercase text-[10px] font-bold tracking-widest text-slate-400">Sua Reserva</p>
                        <p className="font-bold text-lg text-solar-green">#{reservationId.slice(0, 8).toUpperCase()}</p>
                        <p>{formatDisplayDate(toLocalISO(new Date(reservation!.checkIn)))}</p>
                    </div>
                    <button
                        onClick={onBack}
                        className="w-full bg-solar-green text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-solar-gold transition-colors"
                    >
                        Voltar ao Site
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F9F8F6] py-12 px-4">
            <div className="max-w-3xl mx-auto">
                <header className="text-center mb-12">
                    <img src="/logo-gold.png" alt="Hotel Solar" className="h-20 mx-auto mb-6 opacity-80" />
                    <h1 className="text-3xl md:text-4xl font-serif text-solar-green mb-2">Pré-Check-in Digital</h1>
                    <p className="text-slate-500">Agilize sua chegada preenchendo os dados da FNRH</p>
                </header>

                <div className="bg-white rounded-[2rem] shadow-xl overflow-hidden border border-slate-100 relative">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-solar-gold/50 via-solar-green to-solar-gold/50"></div>

                    {/* Header com dados da reserva */}
                    <div className="bg-slate-50 border-b border-slate-100 p-6 md:p-8 flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Reserva</span>
                            <span className="text-2xl font-black text-solar-green">#{reservationId.slice(0, 8).toUpperCase()}</span>
                        </div>
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Chegada</span>
                            <span className="text-xl font-bold text-slate-700">{formatDisplayDate(toLocalISO(new Date(reservation!.checkIn)))}</span>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 md:p-10 space-y-8">
                        {/* Seção Principal */}
                        <div>
                            <h3 className="flex items-center gap-2 font-bold text-solar-green border-b border-slate-100 pb-2 mb-6">
                                <span className="w-1.5 h-6 bg-solar-gold rounded-full"></span>
                                Seus Dados (Principal)
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="col-span-1 md:col-span-2">
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Nome Completo</label>
                                    <input
                                        required
                                        value={formData.nomeCompleto}
                                        onChange={e => handleChange('nomeCompleto', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors"
                                        placeholder="Como no documento"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">E-mail</label>
                                    <input
                                        required
                                        type="email"
                                        value={formData.email}
                                        onChange={e => handleChange('email', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Telefone / WhatsApp</label>
                                    <input
                                        required
                                        value={formData.telefone}
                                        onChange={e => handleChange('telefone', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">CPF</label>
                                    <input
                                        required
                                        value={formData.cpf}
                                        onChange={e => handleChange('cpf', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors"
                                        placeholder="000.000.000-00"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Gênero</label>
                                    <select
                                        required
                                        value={formData.genero}
                                        onChange={e => handleChange('genero', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors appearance-none"
                                    >
                                        <option value="">Selecione...</option>
                                        <option value="Masculino">Masculino</option>
                                        <option value="Feminino">Feminino</option>
                                        <option value="Outro">Outro</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">RG (Identidade)</label>
                                    <input
                                        value={formData.rg}
                                        onChange={e => handleChange('rg', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Órgão Emissor</label>
                                    <input
                                        value={formData.orgaoEmissor}
                                        onChange={e => handleChange('orgaoEmissor', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors"
                                        placeholder="Ex: SSP/PA"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Profissão</label>
                                    <input
                                        value={formData.profissao}
                                        onChange={e => handleChange('profissao', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Nacionalidade</label>
                                    <input
                                        value={formData.nacionalidade}
                                        onChange={e => handleChange('nacionalidade', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Data de Nascimento</label>
                                    <input
                                        type="date"
                                        required
                                        value={formData.dataNascimento}
                                        onChange={e => handleChange('dataNascimento', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Endereço */}
                        <div>
                            <h3 className="flex items-center gap-2 font-bold text-solar-green border-b border-slate-100 pb-2 mb-6">
                                <span className="w-1.5 h-6 bg-solar-gold rounded-full"></span>
                                Endereço
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">CEP</label>
                                    <input
                                        required
                                        value={formData.endereco.cep}
                                        onChange={e => handleAddressChange('cep', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Logradouro (Rua, Av...)</label>
                                    <input
                                        required
                                        value={formData.endereco.logradouro}
                                        onChange={e => handleAddressChange('logradouro', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Número</label>
                                    <input
                                        required
                                        value={formData.endereco.numero}
                                        onChange={e => handleAddressChange('numero', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Complemento</label>
                                    <input
                                        value={formData.endereco.complemento}
                                        onChange={e => handleAddressChange('complemento', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Bairro</label>
                                    <input
                                        required
                                        value={formData.endereco.bairro}
                                        onChange={e => handleAddressChange('bairro', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Cidade</label>
                                    <input
                                        required
                                        value={formData.endereco.cidade}
                                        onChange={e => handleAddressChange('cidade', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Estado (UF)</label>
                                    <input
                                        required
                                        value={formData.endereco.estado}
                                        onChange={e => handleAddressChange('estado', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors"
                                        maxLength={2}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">País</label>
                                    <input
                                        required
                                        value={formData.endereco.pais}
                                        onChange={e => handleAddressChange('pais', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors"
                                    />
                                </div>

                            </div>
                        </div>

                        {error && (
                            <div className="p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-2 text-sm font-bold animate-shake">
                                <AlertCircle size={18} />
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full bg-solar-green text-white py-5 rounded-2xl font-bold uppercase text-sm tracking-widest hover:bg-solar-gold transition-all shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {submitting ? 'Enviando...' : 'Concluir Pré-Check-in'}
                        </button>

                        <p className="text-center text-xs text-slate-400">
                            Ao enviar, declaramos que os dados são verdadeiros e concordamos com a política de privacidade.
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
};
