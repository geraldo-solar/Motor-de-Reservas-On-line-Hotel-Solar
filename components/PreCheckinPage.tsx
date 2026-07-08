import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, AlertCircle } from 'lucide-react';
import { Reservation } from '../types';
import { formatDisplayDate, toLocalISO } from '../utils/dateUtils';
import { sendPreCheckinAdminEmail, getShortReservationId } from '../services/emailService';
import { supabase } from '../lib/supabase';

interface PreCheckinPageProps {
    reservationId: string;
    onBack: () => void;
    reservations: Reservation[];
}

const BRAZIL_STATES = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const COUNTRIES = ["Brasil", "Argentina", "Uruguai", "Paraguai", "Chile", "Colômbia", "Peru", "Bolívia", "Portugal", "Espanha", "Estados Unidos", "Canadá", "França", "Itália", "Alemanha", "Reino Unido"];
const NATIONALITIES = ["Brasileira", "Argentina", "Uruguaia", "Paraguaia", "Chilena", "Colombiana", "Peruana", "Boliviana", "Portuguesa", "Espanhola", "Americana", "Canadense", "Francesa", "Italiana", "Alemã", "Britânica"];

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
    acompanhantes: {
        nome: string;
        email?: string;
        telefone?: string;
        cpf?: string;
        dataNascimento?: string;
        mesmoEndereco?: boolean;
        endereco?: {
            cep: string;
            logradouro: string;
            numero: string;
            complemento: string;
            bairro: string;
            cidade: string;
            estado: string;
            pais: string;
        };
    }[];
    motivoViagem: string;
    meioTransporte: string;
    placaVeiculo?: string;
    ultimaProcedencia: string;
    proximoDestino: string;
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
    },
    acompanhantes: [],
    motivoViagem: '',
    meioTransporte: '',
    placaVeiculo: '',
    ultimaProcedencia: '',
    proximoDestino: ''
};

export const PreCheckinPage: React.FC<PreCheckinPageProps> = ({ reservationId, onBack, reservations }) => {
    const [reservation, setReservation] = useState<Reservation | null>(null);
    const [groupRooms, setGroupRooms] = useState<Reservation[]>([]);
    const [roomAssignments, setRoomAssignments] = useState<{ titular: string; acompanhantes: string[] }[]>([]);
    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState<FNRHData>(INITIAL_DATA);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [citiesList, setCitiesList] = useState<string[]>([]);

    useEffect(() => {
        fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios')
            .then(res => res.json())
            .then(data => {
                const names = data
                    .filter((d: any) => d && d.nome && d.microrregiao?.mesorregiao?.UF?.sigla)
                    .map((d: any) => `${d.nome} - ${d.microrregiao.mesorregiao.UF.sigla}`);
                setCitiesList(names.sort());
            })
            .catch(err => console.error(err));
    }, []);

    useEffect(() => {
        // Find reservation (Supports Full ID or Short ID)
        const found = reservations.find(r =>
            r.id === reservationId ||
            getShortReservationId(r.id) === reservationId.toUpperCase()
        );

        if (found) {
            setReservation(found);
            setGroupRooms(found.groupId ? reservations.filter(r => r.groupId === found.groupId) : []);
            setFormData(prev => ({
                ...prev,
                nomeCompleto: found.mainGuest.name,
                email: found.mainGuest.email,
                telefone: found.mainGuest.phone,
                cpf: found.mainGuest.cpf
            }));
            setLoading(false);
            return;
        }

        // Link pode ter sido gerado com o ID do GRUPO (reservas com múltiplos quartos)
        const matchedGroup = reservations.filter(r =>
            r.groupId && (r.groupId === reservationId || getShortReservationId(r.groupId).toUpperCase() === reservationId.toUpperCase())
        );

        if (matchedGroup.length > 0) {
            const sorted = [...matchedGroup].sort((a, b) => (a.rooms[0]?.name || '').localeCompare(b.rooms[0]?.name || ''));
            const primary = sorted[0];
            setReservation(primary);
            setGroupRooms(sorted);
            setFormData(prev => ({
                ...prev,
                nomeCompleto: primary.mainGuest.name,
                email: primary.mainGuest.email,
                telefone: primary.mainGuest.phone,
                cpf: primary.mainGuest.cpf
            }));
        }
        setLoading(false);
    }, [reservationId, reservations]);

    // Inicializa a distribuição de hóspedes por quarto (apenas nomes) quando é uma reserva de grupo
    useEffect(() => {
        if (groupRooms.length > 1) {
            setRoomAssignments(groupRooms.map((room) => ({
                titular: room.mainGuest?.name && room.mainGuest.name !== 'Hóspede' ? room.mainGuest.name : '',
                acompanhantes: (room.additionalGuests || []).map(g => g.name || '')
            })));
        }
    }, [groupRooms]);

    const handleRoomTitularChange = (roomIdx: number, value: string) => {
        setRoomAssignments(prev => {
            const next = [...prev];
            next[roomIdx] = { ...next[roomIdx], titular: value };
            return next;
        });
    };

    const handleRoomAcompanhanteChange = (roomIdx: number, guestIdx: number, value: string) => {
        setRoomAssignments(prev => {
            const next = [...prev];
            const acompanhantes = [...(next[roomIdx]?.acompanhantes || [])];
            acompanhantes[guestIdx] = value;
            next[roomIdx] = { ...next[roomIdx], acompanhantes };
            return next;
        });
    };

    // Quantidade de acompanhantes baseada nos hóspedes adicionais da reserva
    const accompanyingGuestCount = reservation?.additionalGuests?.length || 0;

    // Ajustar array de acompanhantes quando a capacidade mudar (ou ao carregar)
    useEffect(() => {
        if (accompanyingGuestCount > 0 && formData.acompanhantes.length !== accompanyingGuestCount) {
            setFormData(prev => {
                // Preservar nomes já digitados, completar com vazio ou cortar excedente
                const current = [...prev.acompanhantes];
                if (current.length < accompanyingGuestCount) {
                    return {
                        ...prev,
                        acompanhantes: [
                            ...current,
                            ...Array(accompanyingGuestCount - current.length).fill(null).map((_, i) => {
                                const guestIndex = current.length + i;
                                const defaultName = reservation?.additionalGuests?.[guestIndex]?.name || '';
                                return {
                                    nome: defaultName,
                                    email: '',
                                    telefone: '',
                                    cpf: '',
                                    dataNascimento: '',
                                    mesmoEndereco: true,
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
                            })
                        ]
                    };
                } else if (current.length > accompanyingGuestCount) {
                    return { ...prev, acompanhantes: current.slice(0, accompanyingGuestCount) };
                }
                return prev;
            });
        }
    }, [accompanyingGuestCount, reservation]);

    const handleAcompanhanteChange = async (index: number, field: string, value: any, nestedField?: string) => {
        const newAcompanhantes = [...formData.acompanhantes];
        if (nestedField && field === 'endereco') {
            newAcompanhantes[index] = {
                ...newAcompanhantes[index],
                endereco: { ...newAcompanhantes[index].endereco!, [nestedField]: value }
            };
        } else {
            newAcompanhantes[index] = { ...newAcompanhantes[index], [field]: value };
        }
        setFormData(prev => ({ ...prev, acompanhantes: newAcompanhantes }));

        if (nestedField === 'cep' && field === 'endereco') {
            const cleanCep = value.replace(/\D/g, '');
            if (cleanCep.length === 8) {
                try {
                    const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
                    const data = await res.json();
                    if (!data.erro) {
                        setFormData(prev => {
                            const st = [...prev.acompanhantes];
                            if (st[index] && st[index].endereco) {
                                st[index] = {
                                    ...st[index],
                                    endereco: {
                                        ...st[index].endereco!,
                                        logradouro: data.logradouro || st[index].endereco!.logradouro,
                                        bairro: data.bairro || st[index].endereco!.bairro,
                                        cidade: data.localidade || st[index].endereco!.cidade,
                                        estado: data.uf || st[index].endereco!.estado,
                                    }
                                };
                            }
                            return { ...prev, acompanhantes: st };
                        });
                    }
                } catch (err) {
                    console.error("Erro viaCEP acompanhante:", err);
                }
            }
        }
    };

    const handleChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleAddressChange = async (field: string, value: string) => {
        setFormData(prev => ({
            ...prev,
            endereco: { ...prev.endereco, [field]: value }
        }));
        
        if (field === 'cep') {
            const cleanCep = value.replace(/\D/g, '');
            if (cleanCep.length === 8) {
                try {
                    const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
                    const data = await res.json();
                    if (!data.erro) {
                        setFormData(prev => ({
                            ...prev,
                            endereco: {
                                ...prev.endereco,
                                logradouro: data.logradouro || prev.endereco.logradouro,
                                bairro: data.bairro || prev.endereco.bairro,
                                cidade: data.localidade || prev.endereco.cidade,
                                estado: data.uf || prev.endereco.estado,
                            }
                        }));
                    }
                } catch (err) {
                    console.error("Erro viaCEP:", err);
                }
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            if (!reservation) throw new Error("Reserva não encontrada");

            // 1. Send email to admin
            const result = await sendPreCheckinAdminEmail(reservation, formData);

            if (!result.success) {
                throw new Error(result.error || "Erro ao enviar dados por e-mail");
            }

            // 2. Salvar FNRH e os hóspedes no Banco de Dados do Hotel (Tabela 'guests')
            const mainAddress = `${formData.endereco.logradouro}, ${formData.endereco.numero} ${formData.endereco.complemento ? '- ' + formData.endereco.complemento : ''} - ${formData.endereco.bairro}`.trim();

            const guestPayload = {
                name: formData.nomeCompleto,
                full_name: formData.nomeCompleto,
                email: formData.email,
                phone: formData.telefone,
                cpf_cnpj: formData.cpf,
                document: formData.cpf,
                rg: formData.rg + (formData.orgaoEmissor ? ' - ' + formData.orgaoEmissor : ''),
                birthdate: formData.dataNascimento,
                nationality: formData.nacionalidade,
                profession: formData.profissao,
                gender: formData.genero,
                zip_code: formData.endereco.cep,
                address: mainAddress,
                city_state: `${formData.endereco.cidade} - ${formData.endereco.estado}`
            };

            const cleanCpf = formData.cpf.replace(/\D/g, '');
            let guestTargetId = null;

            // Tenta buscar o guest_id atrelado à reserva (criado pelo ERP)
            try {
                const { data: resDb } = await supabase
                    .from('reservations')
                    .select('guest_id')
                    .eq('id', reservation.id)
                    .single();
                
                if (resDb && resDb.guest_id) {
                    guestTargetId = resDb.guest_id;
                }
            } catch (err) {
                console.error("Erro ao buscar guest da reserva:", err);
            }

            // Se a reserva não tiver guest_id vinculado, tenta buscar por CPF
            if (!guestTargetId && cleanCpf) {
                const { data: existingGuest } = await supabase
                    .from('guests')
                    .select('id')
                    .or(`document.ilike.%${cleanCpf}%,cpf_cnpj.ilike.%${cleanCpf}%`)
                    .limit(1)
                    .maybeSingle();

                if (existingGuest) {
                    guestTargetId = existingGuest.id;
                }
            }

            // Se ainda não achou, tenta buscar pelo nome exato (caso o ERP tenha criado a ficha fantasma sem CPF)
            if (!guestTargetId && formData.nomeCompleto) {
                const { data: existingByName } = await supabase
                    .from('guests')
                    .select('id')
                    .ilike('full_name', formData.nomeCompleto.trim())
                    .limit(1)
                    .maybeSingle();
                
                if (existingByName) {
                    guestTargetId = existingByName.id;
                }
            }

            if (guestTargetId) {
                // Atualiza o cadastro existente (criado pelo ERP ou achado por CPF)
                await supabase.from('guests').update(guestPayload).eq('id', guestTargetId);
            } else {
                // Cria novo se não achar em nenhum lugar
                const { data: newGuest } = await supabase.from('guests').insert([guestPayload]).select().single();
                if (newGuest) {
                    guestTargetId = newGuest.id;
                }
            }
            
            // Se achou ou criou um hóspede e ele não estava na reserva, vincula na reserva
            if (guestTargetId) {
                try {
                    await supabase.from('reservations').update({ guest_id: guestTargetId }).eq('id', reservation.id);
                } catch(e) {}
            }

            // 3. Salvar Acompanhantes no CRM, se houver (não se aplica ao fluxo de reserva de grupo,
            // que coleta apenas nomes por quarto, sem CPF, e é persistido no bloco de grupo abaixo)
            if (groupRooms.length <= 1 && formData.acompanhantes.length > 0) {
                for (const acomp of formData.acompanhantes) {
                    const acompCleanCpf = (acomp.cpf || '').replace(/\D/g, '');
                    if (acomp.nome && acompCleanCpf) {
                        const acompAddress = acomp.mesmoEndereco ? mainAddress : `${acomp.endereco?.logradouro || ''}, ${acomp.endereco?.numero || ''} ${acomp.endereco?.complemento ? '- ' + acomp.endereco?.complemento : ''} - ${acomp.endereco?.bairro || ''}`.trim();
                        const acompPayload = {
                            name: acomp.nome,
                            full_name: acomp.nome,
                            email: acomp.email || '',
                            phone: acomp.telefone || '',
                            cpf_cnpj: acomp.cpf,
                            document: acomp.cpf,
                            birthdate: acomp.dataNascimento || '',
                            zip_code: acomp.mesmoEndereco ? formData.endereco.cep : acomp.endereco?.cep || '',
                            address: acompAddress,
                            city_state: acomp.mesmoEndereco ? `${formData.endereco.cidade} - ${formData.endereco.estado}` : `${acomp.endereco?.cidade || ''} - ${acomp.endereco?.estado || ''}`
                        };

                        let extAcomp = null;
                        
                        const { data: extByCpf } = await supabase.from('guests').select('id').or(`document.ilike.%${acompCleanCpf}%,cpf_cnpj.ilike.%${acompCleanCpf}%`).limit(1).maybeSingle();
                        if (extByCpf) {
                            extAcomp = extByCpf;
                        } else if (acomp.nome) {
                            const { data: extByName } = await supabase.from('guests').select('id').ilike('full_name', acomp.nome.trim()).limit(1).maybeSingle();
                            if (extByName) extAcomp = extByName;
                        }

                        if (extAcomp) {
                            await supabase.from('guests').update(acompPayload).eq('id', extAcomp.id);
                        } else {
                            await supabase.from('guests').insert([acompPayload]);
                        }
                    }
                }
            }

            // 4. Update the reservation(s) globally so the system knows FNRH was filled
            if (groupRooms.length > 1) {
                // Reserva de grupo: persiste apenas nomes (titular + acompanhantes) por quarto.
                // O quarto do preenchedor do formulário (o "primary") recebe também os dados completos da FNRH.
                try {
                    for (let i = 0; i < groupRooms.length; i++) {
                        const room = groupRooms[i];
                        const assignment = roomAssignments[i] || { titular: '', acompanhantes: [] };
                        const isPrimaryRoom = room.id === reservation.id;

                        const roomAdditionalGuests = (room.additionalGuests || []).map((g, gIdx) => ({
                            ...g,
                            name: assignment.acompanhantes[gIdx] || g.name
                        }));

                        const roomMainGuest = isPrimaryRoom
                            ? {
                                ...room.mainGuest,
                                cpf: formData.cpf,
                                name: assignment.titular || formData.nomeCompleto,
                                email: formData.email,
                                phone: formData.telefone,
                                rg: formData.rg,
                                profession: formData.profissao,
                                nationality: formData.nacionalidade,
                                address: mainAddress
                            }
                            : {
                                ...room.mainGuest,
                                name: assignment.titular || room.mainGuest.name
                            };

                        await supabase.from('reservations').update({
                            pre_checkin_sent: true,
                            main_guest: roomMainGuest,
                            additional_guests: roomAdditionalGuests
                        }).eq('id', room.id);
                    }
                } catch (err) {
                    console.error("Erro secundário ao atualizar reservations do grupo: ", err);
                }
            } else {
                const updatedAdditionalGuests = formData.acompanhantes.map((acomp, index) => {
                    const existingGuest = reservation.additionalGuests?.[index] || {} as any;
                    return {
                        ...existingGuest,
                        name: acomp.nome,
                        cpf: acomp.cpf,
                        email: acomp.email,
                        phone: acomp.telefone
                    };
                });

                try {
                   await supabase.from('reservations').update({
                       pre_checkin_sent: true,
                       main_guest: {
                           ...reservation.mainGuest,
                           cpf: formData.cpf,
                           name: formData.nomeCompleto,
                           email: formData.email,
                           phone: formData.telefone,
                           rg: formData.rg,
                           profession: formData.profissao,
                           nationality: formData.nacionalidade,
                           address: mainAddress
                       },
                       additional_guests: updatedAdditionalGuests
                   }).eq('id', reservation.id);
                } catch (err) {
                   console.error("Erro secundário ao atualizar reservation: ", err);
                }
            }

            setSuccess(true);
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
                                        list="nationalities-list"
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
                                        list="brazil-states-list"
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
                                        list="countries-list"
                                        onChange={e => handleAddressChange('pais', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors"
                                    />
                                </div>

                            </div>
                        </div>



                        {/* Acompanhantes (Se houver capacidade extra) */}
                        {groupRooms.length <= 1 && accompanyingGuestCount > 0 && (
                            <div>
                                <h3 className="flex items-center gap-2 font-bold text-solar-green border-b border-slate-100 pb-2 mb-6">
                                    <span className="w-1.5 h-6 bg-solar-gold rounded-full"></span>
                                    Acompanhantes ({accompanyingGuestCount})
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {Array.from({ length: accompanyingGuestCount }).map((_, idx) => (
                                        <div key={idx} className="col-span-1 md:col-span-2 bg-slate-50 p-6 rounded-xl border border-slate-100 mb-4">
                                            <h4 className="font-bold text-solar-green text-sm mb-4 border-b border-slate-200 pb-2">
                                                Hóspede Acompanhante {idx + 1}
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="md:col-span-2">
                                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                                                        Nome Completo
                                                    </label>
                                                    <input
                                                        value={formData.acompanhantes[idx]?.nome || ''}
                                                        onChange={e => handleAcompanhanteChange(idx, 'nome', e.target.value)}
                                                        className="w-full p-3 bg-white border border-slate-200 rounded-lg focus:border-solar-gold focus:outline-none transition-colors"
                                                        placeholder="Nome completo do acompanhante"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                                                        CPF
                                                    </label>
                                                    <input
                                                        value={formData.acompanhantes[idx]?.cpf || ''}
                                                        onChange={e => handleAcompanhanteChange(idx, 'cpf', e.target.value)}
                                                        className="w-full p-3 bg-white border border-slate-200 rounded-lg focus:border-solar-gold focus:outline-none transition-colors"
                                                        placeholder="000.000.000-00"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                                                        Data de Nascimento
                                                    </label>
                                                    <input
                                                        type="date"
                                                        value={formData.acompanhantes[idx]?.dataNascimento || ''}
                                                        onChange={e => handleAcompanhanteChange(idx, 'dataNascimento', e.target.value)}
                                                        className="w-full p-3 bg-white border border-slate-200 rounded-lg focus:border-solar-gold focus:outline-none transition-colors"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                                                        Email
                                                    </label>
                                                    <input
                                                        type="email"
                                                        value={formData.acompanhantes[idx]?.email || ''}
                                                        onChange={e => handleAcompanhanteChange(idx, 'email', e.target.value)}
                                                        className="w-full p-3 bg-white border border-slate-200 rounded-lg focus:border-solar-gold focus:outline-none transition-colors"
                                                        placeholder="email@exemplo.com"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                                                        Telefone
                                                    </label>
                                                    <input
                                                        value={formData.acompanhantes[idx]?.telefone || ''}
                                                        onChange={e => handleAcompanhanteChange(idx, 'telefone', e.target.value)}
                                                        className="w-full p-3 bg-white border border-slate-200 rounded-lg focus:border-solar-gold focus:outline-none transition-colors"
                                                        placeholder="(00) 00000-0000"
                                                    />
                                                </div>

                                                <div className="md:col-span-2 mt-2">
                                                    <label className="flex items-center gap-3 p-3 border border-slate-100 rounded-lg bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${formData.acompanhantes[idx]?.mesmoEndereco ? 'bg-solar-gold border-solar-gold' : 'border-slate-300 bg-white'}`}>
                                                            {formData.acompanhantes[idx]?.mesmoEndereco && <Check size={14} className="text-white" />}
                                                        </div>
                                                        <input
                                                            type="checkbox"
                                                            className="hidden"
                                                            checked={formData.acompanhantes[idx]?.mesmoEndereco}
                                                            onChange={e => handleAcompanhanteChange(idx, 'mesmoEndereco', e.target.checked)}
                                                        />
                                                        <span className="text-sm text-slate-600 font-medium">Reside no mesmo endereço do titular</span>
                                                    </label>
                                                </div>

                                                {!formData.acompanhantes[idx]?.mesmoEndereco && (
                                                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 pt-2 border-t border-slate-100 mt-2">
                                                        <div>
                                                            <input
                                                                placeholder="CEP"
                                                                value={formData.acompanhantes[idx]?.endereco?.cep || ''}
                                                                onChange={e => handleAcompanhanteChange(idx, 'endereco', e.target.value, 'cep')}
                                                                className="w-full p-3 bg-white border border-slate-200 rounded-lg text-sm"
                                                            />
                                                        </div>
                                                        <div>
                                                            <input
                                                                placeholder="Cidade"
                                                                value={formData.acompanhantes[idx]?.endereco?.cidade || ''}
                                                                onChange={e => handleAcompanhanteChange(idx, 'endereco', e.target.value, 'cidade')}
                                                                className="w-full p-3 bg-white border border-slate-200 rounded-lg text-sm"
                                                            />
                                                        </div>
                                                        <div className="md:col-span-2">
                                                            <input
                                                                placeholder="Logradouro, Número, Bairro..."
                                                                value={formData.acompanhantes[idx]?.endereco?.logradouro || ''}
                                                                onChange={e => handleAcompanhanteChange(idx, 'endereco', e.target.value, 'logradouro')}
                                                                className="w-full p-3 bg-white border border-slate-200 rounded-lg text-sm"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Distribuição de Hóspedes por Quarto (Reserva de Grupo) */}
                        {groupRooms.length > 1 && (
                            <div>
                                <h3 className="flex items-center gap-2 font-bold text-solar-green border-b border-slate-100 pb-2 mb-6">
                                    <span className="w-1.5 h-6 bg-solar-gold rounded-full"></span>
                                    Distribuição de Hóspedes por Quarto
                                </h3>
                                <p className="text-sm text-slate-500 mb-6 -mt-4">
                                    Sua reserva possui {groupRooms.length} quartos. Informe abaixo o nome do titular e dos acompanhantes de cada quarto.
                                </p>
                                <div className="grid grid-cols-1 gap-6">
                                    {groupRooms.map((room, roomIdx) => (
                                        <div key={room.id} className="bg-slate-50 p-6 rounded-xl border border-slate-100">
                                            <h4 className="font-bold text-solar-green text-sm mb-4 border-b border-slate-200 pb-2">
                                                Quarto {roomIdx + 1}
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="md:col-span-2">
                                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                                                        Titular do Quarto {roomIdx + 1}
                                                    </label>
                                                    <input
                                                        required
                                                        value={roomIdx === 0 ? formData.nomeCompleto : (roomAssignments[roomIdx]?.titular || '')}
                                                        onChange={e => {
                                                            if (roomIdx === 0) {
                                                                handleChange('nomeCompleto', e.target.value);
                                                            } else {
                                                                handleRoomTitularChange(roomIdx, e.target.value);
                                                            }
                                                        }}
                                                        className="w-full p-3 bg-white border border-slate-200 rounded-lg focus:border-solar-gold focus:outline-none transition-colors"
                                                        placeholder="Nome completo do titular"
                                                    />
                                                </div>
                                                {(room.additionalGuests || []).map((_, guestIdx) => (
                                                    <div key={guestIdx} className="md:col-span-2">
                                                        <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                                                            Acompanhante {guestIdx + 1}
                                                        </label>
                                                        <input
                                                            value={roomAssignments[roomIdx]?.acompanhantes[guestIdx] || ''}
                                                            onChange={e => handleRoomAcompanhanteChange(roomIdx, guestIdx, e.target.value)}
                                                            className="w-full p-3 bg-white border border-slate-200 rounded-lg focus:border-solar-gold focus:outline-none transition-colors"
                                                            placeholder="Nome completo do acompanhante"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}



                        {/* Dados da Viagem (FNRH) */}
                        <div>
                            <h3 className="flex items-center gap-2 font-bold text-solar-green border-b border-slate-100 pb-2 mb-6">
                                <span className="w-1.5 h-6 bg-solar-gold rounded-full"></span>
                                Dados da Viagem (FNRH)
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Motivo da Viagem</label>
                                    <select
                                        required
                                        value={formData.motivoViagem}
                                        onChange={e => handleChange('motivoViagem', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors appearance-none"
                                    >
                                        <option value="">Selecione...</option>
                                        <option value="Lazer / Férias">Lazer / Férias</option>
                                        <option value="Negócios">Negócios</option>
                                        <option value="Congresso / Feira">Congresso / Feira</option>
                                        <option value="Parentes / Amigos">Parentes / Amigos</option>
                                        <option value="Estudos">Estudos</option>
                                        <option value="Religião">Religião</option>
                                        <option value="Saúde">Saúde</option>
                                        <option value="Outros">Outros</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Meio de Transporte</label>
                                    <select
                                        required
                                        value={formData.meioTransporte}
                                        onChange={e => handleChange('meioTransporte', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors appearance-none"
                                    >
                                        <option value="">Selecione...</option>
                                        <option value="Carro Próprio">Carro Próprio</option>
                                        <option value="Avião">Avião</option>
                                        <option value="Ônibus">Ônibus</option>
                                        <option value="Moto">Moto</option>
                                        <option value="Navio / Barco">Navio / Barco</option>
                                        <option value="Trem">Trem</option>
                                        <option value="Outros">Outros</option>
                                    </select>
                                </div>

                                {(formData.meioTransporte === 'Carro Próprio' || formData.meioTransporte === 'Moto') && (
                                    <div className="col-span-1 md:col-span-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Placa do Veículo</label>
                                        <input
                                            required
                                            value={formData.placaVeiculo || ''}
                                            onChange={e => handleChange('placaVeiculo', e.target.value.toUpperCase())}
                                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors uppercase placeholder:normal-case"
                                            placeholder="XXX-0000"
                                            maxLength={8}
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Última Procedência (Cidade/UF)</label>
                                    <input
                                        required
                                        list="brazil-cities"
                                        value={formData.ultimaProcedencia}
                                        onChange={e => handleChange('ultimaProcedencia', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors"
                                        placeholder="De onde você veio?"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Próximo Destino (Cidade/UF)</label>
                                    <input
                                        required
                                        list="brazil-cities"
                                        value={formData.proximoDestino}
                                        onChange={e => handleChange('proximoDestino', e.target.value)}
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-solar-gold focus:outline-none transition-colors"
                                        placeholder="Para onde você vai?"
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
                        <datalist id="brazil-cities">
                            {citiesList.map(city => <option key={city} value={city} />)}
                        </datalist>
                        <datalist id="nationalities-list">
                            {NATIONALITIES.map(n => <option key={n} value={n} />)}
                        </datalist>
                        <datalist id="brazil-states-list">
                            {BRAZIL_STATES.map(n => <option key={n} value={n} />)}
                        </datalist>
                        <datalist id="countries-list">
                            {COUNTRIES.map(n => <option key={n} value={n} />)}
                        </datalist>
                    </form>
                </div>
            </div >
        </div >
    );
};
