import React, { useState, useEffect } from 'react';
import { ChevronLeft, Home, Search, AlertTriangle, XCircle, Trash2, CheckCircle, ArrowLeft } from 'lucide-react';
import { Reservation, ReservationStatus } from '../types';
import { getShortReservationId, sendClientCancellationEmails } from '../services/emailService';

interface CancellationPageProps {
    reservationId: string | null;
    reservations: Reservation[];
    setReservations: React.Dispatch<React.SetStateAction<Reservation[]>>;
    onSaveReservation: (reservation: Reservation) => Promise<boolean>;
    onUpdateStatus: (id: string, status: string, reason?: string) => Promise<boolean>;
    onBack: () => void;
}

export const CancellationPage: React.FC<CancellationPageProps> = ({ reservationId, reservations, setReservations, onSaveReservation, onUpdateStatus, onBack }) => {
    const [searchId, setSearchId] = useState(reservationId || '');
    const [reservation, setReservation] = useState<Reservation | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedRooms, setSelectedRooms] = useState<Set<number>>(new Set());
    const [selectedExtras, setSelectedExtras] = useState<Set<number>>(new Set());
    const [cancelling, setCancelling] = useState(false);
    const [success, setSuccess] = useState(false);
    const [cancelType, setCancelType] = useState<'full' | 'partial' | null>(null);
    const [autoSearchDone, setAutoSearchDone] = useState(false);

    // ... (searchReservation logic remains the same)
    const searchReservation = (idToSearch: string) => {
        if (!idToSearch.trim()) {
            setError('Por favor, insira o número da reserva.');
            return;
        }

        if (reservations.length === 0) {
            return;
        }

        setLoading(true);
        setError(null);
        setReservation(null);

        const searchTerm = idToSearch.trim().toUpperCase().replace(/-/g, '');

        const found = reservations.find(r => {
            // Normalizar o ID da reserva - remover hífens e converter para maiúsculas
            const fullIdNormalized = r.id.toUpperCase().replace(/-/g, '');
            const shortId = getShortReservationId(r.id);

            // Verificar se o termo de busca está contido no ID completo
            // ou se corresponde ao ID curto (8 caracteres)
            return fullIdNormalized === searchTerm ||
                fullIdNormalized.includes(searchTerm) ||
                searchTerm.includes(fullIdNormalized) ||
                shortId === searchTerm ||
                searchTerm.startsWith(shortId) ||
                r.id.toUpperCase() === idToSearch.trim().toUpperCase();
        });

        setTimeout(() => {
            setLoading(false);
            if (found) {
                if (found.status === 'CANCELED') {
                    setError('Esta reserva já foi cancelada anteriormente.');
                } else {
                    setReservation(found);
                    setSelectedRooms(new Set());
                    setSelectedExtras(new Set());
                }
            } else {
                setError('Reserva não encontrada. Verifique o número e tente novamente.');
            }
        }, 500);
    };

    // ... (useEffect remains the same)
    useEffect(() => {
        if (reservationId && reservations.length > 0 && !autoSearchDone) {
            setSearchId(reservationId);
            searchReservation(reservationId);
            setAutoSearchDone(true);
        }
    }, [reservationId, reservations, autoSearchDone]);

    const handleSearch = () => {
        searchReservation(searchId);
    };

    const toggleRoom = (index: number) => {
        const newSet = new Set(selectedRooms);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
        setSelectedRooms(newSet);
    };

    const toggleExtra = (index: number) => {
        const newSet = new Set(selectedExtras);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
        setSelectedExtras(newSet);
    };

    const handleCancelReservation = async (type: 'full' | 'partial') => {
        if (!reservation) return;

        setCancelling(true);
        setCancelType(type);

        try {
            let updatedReservation: Reservation;
            let cancelledItems: { rooms?: string[], extras?: string[] } | undefined;
            let persistSuccess = false;

            if (type === 'full') {
                // Cancelamento total
                updatedReservation = { ...reservation, status: 'CANCELED' as ReservationStatus };
                persistSuccess = await onUpdateStatus(reservation.id, 'CANCELED', 'Cancelamento realizado pelo cliente');
            } else {
                // Cancelamento parcial
                const cancelledRoomNames = Array.from(selectedRooms).map(i => reservation.rooms[i].name);
                const cancelledExtraNames = Array.from(selectedExtras).map(i => reservation.extras[i].name);

                cancelledItems = {
                    rooms: cancelledRoomNames.length > 0 ? cancelledRoomNames : undefined,
                    extras: cancelledExtraNames.length > 0 ? cancelledExtraNames : undefined,
                };

                const remainingRooms = reservation.rooms.filter((_, i) => !selectedRooms.has(i));
                const remainingExtras = reservation.extras.filter((_, i) => !selectedExtras.has(i));

                const roomsTotal = remainingRooms.reduce((sum, r) => sum + r.priceSnapshot, 0);
                const extrasTotal = remainingExtras.reduce((sum, e) => sum + (e.priceSnapshot * e.quantity), 0);
                const newTotal = roomsTotal + extrasTotal;

                if (remainingRooms.length === 0) {
                    updatedReservation = { ...reservation, status: 'CANCELED' as ReservationStatus };
                    persistSuccess = await onUpdateStatus(reservation.id, 'CANCELED', 'Cancelamento parcial resultou em cancelamento total');
                } else {
                    updatedReservation = {
                        ...reservation,
                        rooms: remainingRooms,
                        extras: remainingExtras,
                        totalPrice: newTotal,
                        observations: `${reservation.observations}\n[CANCELAMENTO PARCIAL em ${new Date().toLocaleDateString('pt-BR')}]: Itens cancelados: ${[...cancelledRoomNames, ...cancelledExtraNames].join(', ')}`.trim(),
                    };
                    persistSuccess = await onSaveReservation(updatedReservation);
                }
            }

            if (persistSuccess) {
                // Atualizar no estado local
                setReservations(prev => prev.map(r => r.id === reservation.id ? updatedReservation : r));

                // Enviar e-mails de cancelamento (cliente e hotel)
                await sendClientCancellationEmails(reservation, cancelledItems);

                setSuccess(true);
                setReservation(updatedReservation);
            } else {
                setError('Não foi possível salvar as alterações no servidor. Verifique sua conexão.');
            }
        } catch (err) {
            console.error('Erro ao cancelar reserva:', err);
            setError('Ocorreu um erro ao processar o cancelamento. Por favor, tente novamente.');
        } finally {
            setCancelling(false);
        }
    };

    const formatDate = (dateStr: string): string => {
        try {
            const date = new Date(dateStr + 'T12:00:00');
            return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
        } catch {
            return dateStr;
        }
    };

    const formatCurrency = (value: number): string => {
        return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const hasSelection = selectedRooms.size > 0 || selectedExtras.size > 0;
    const isFullCancellation = reservation && selectedRooms.size === reservation.rooms.length && selectedExtras.size === reservation.extras.length;

    if (success) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-12 animate-in fade-in duration-500">
                <div className="bg-white rounded-3xl shadow-2xl border border-solar-gold/10 overflow-hidden">
                    <div className="bg-gradient-to-r from-solar-green to-emerald-700 p-8 text-center">
                        <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle size={40} className="text-white" />
                        </div>
                        <h1 className="text-2xl font-serif text-white mb-2">
                            {cancelType === 'full' ? 'Reserva Cancelada' : 'Cancelamento Parcial Realizado'}
                        </h1>
                        <p className="text-solar-sand/80">Seu cancelamento foi processado com sucesso</p>
                    </div>

                    <div className="p-8 text-center">
                        <p className="text-slate-600 mb-6">
                            Enviamos um e-mail de confirmação para <strong>{reservation?.mainGuest.email}</strong> com os detalhes do cancelamento.
                        </p>

                        <div className="bg-slate-50 rounded-xl p-4 mb-6">
                            <p className="text-sm text-slate-500 mb-1">Número da Reserva</p>
                            <p className="text-2xl font-bold text-solar-green tracking-widest">
                                {reservation ? getShortReservationId(reservation.id) : ''}
                            </p>
                        </div>

                        <button
                            onClick={onBack}
                            className="bg-solar-green text-white px-8 py-4 rounded-2xl font-bold uppercase tracking-widest hover:bg-solar-gold transition-all shadow-xl"
                        >
                            <Home size={18} className="inline mr-2" /> Voltar ao Início
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto px-4 py-12 animate-in fade-in duration-500">
            <button onClick={onBack} className="mb-8 flex items-center gap-2 text-solar-green hover:text-solar-gold transition-colors">
                <ChevronLeft size={20} />
                <span className="text-sm font-bold uppercase tracking-widest">Voltar</span>
            </button>

            <div className="bg-white rounded-3xl shadow-2xl border border-solar-gold/10 overflow-hidden">
                <div className="bg-solar-green p-8 text-center">
                    <img src="/logo.png" alt="Hotel Solar" className="h-20 mx-auto mb-4" />
                    <h1 className="text-2xl md:text-3xl font-serif text-solar-gold">Cancelamento de Reserva</h1>
                    <p className="text-solar-sand/80 mt-2">Gerencie sua reserva de forma simples e rápida</p>
                </div>

                <div className="p-6 md:p-10">
                    {/* Formulário de busca */}
                    {!reservation && (
                        <div className="max-w-md mx-auto">
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                Número da Reserva
                            </label>
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={searchId}
                                    onChange={(e) => setSearchId(e.target.value.toUpperCase())}
                                    placeholder="Ex: A1B2C3D4"
                                    className="flex-1 px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-solar-green focus:ring-2 focus:ring-solar-green/20 outline-none transition-all text-lg tracking-widest font-mono uppercase"
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                />
                                <button
                                    onClick={handleSearch}
                                    disabled={loading}
                                    className="px-6 py-3 bg-solar-green text-white rounded-xl font-bold hover:bg-solar-gold transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                    {loading ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <Search size={20} />
                                    )}
                                </button>
                            </div>

                            {error && (
                                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                                    <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
                                    <p className="text-red-700 text-sm">{error}</p>
                                </div>
                            )}

                            <p className="mt-6 text-sm text-slate-500 text-center">
                                O número da reserva foi enviado para seu e-mail no momento da confirmação.
                            </p>
                        </div>
                    )}

                    {/* Detalhes da reserva */}
                    {reservation && (
                        <div className="space-y-6">
                            {/* Header da reserva */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
                                <div>
                                    <p className="text-sm text-slate-500 mb-1">Número da Reserva</p>
                                    <p className="text-3xl font-bold text-solar-green tracking-widest">
                                        {getShortReservationId(reservation.id)}
                                    </p>
                                </div>
                                <div className={`px-4 py-2 rounded-full text-sm font-bold ${reservation.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' :
                                    reservation.status === 'CANCELED' ? 'bg-red-100 text-red-700' :
                                        'bg-yellow-100 text-yellow-700'
                                    }`}>
                                    {reservation.status === 'CONFIRMED' ? '✓ Confirmada' :
                                        reservation.status === 'CANCELED' ? '✗ Cancelada' :
                                            '⏳ Pendente'}
                                </div>
                            </div>

                            {/* Dados do hóspede */}
                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <h3 className="text-lg font-bold text-solar-green mb-3">Hóspede Principal</h3>
                                    <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                                        <p><strong>Nome:</strong> {reservation.mainGuest.name}</p>
                                        <p><strong>Email:</strong> {reservation.mainGuest.email}</p>
                                        <p><strong>Telefone:</strong> {reservation.mainGuest.phone}</p>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-lg font-bold text-solar-green mb-3">Período da Estadia</h3>
                                    <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                                        <p><strong>Check-in:</strong> {formatDate(reservation.checkIn)}</p>
                                        <p><strong>Check-out:</strong> {formatDate(reservation.checkOut)}</p>
                                        <p><strong>Noites:</strong> {reservation.nights}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Acomodações */}
                            <div>
                                <h3 className="text-lg font-bold text-solar-green mb-3">Acomodações</h3>
                                <div className="space-y-2">
                                    {reservation.rooms.map((room, index) => (
                                        <div
                                            key={index}
                                            onClick={() => reservation.status !== 'CANCELED' && toggleRoom(index)}
                                            className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${reservation.status === 'CANCELED' ? 'bg-slate-100 border-slate-200 opacity-60' :
                                                selectedRooms.has(index)
                                                    ? 'bg-red-50 border-red-300 cursor-pointer'
                                                    : 'bg-white border-slate-200 hover:border-solar-green cursor-pointer'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                {reservation.status !== 'CANCELED' && (
                                                    <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${selectedRooms.has(index)
                                                        ? 'bg-red-500 border-red-500'
                                                        : 'border-slate-300'
                                                        }`}>
                                                        {selectedRooms.has(index) && <XCircle size={16} className="text-white" />}
                                                    </div>
                                                )}
                                                <span className="font-medium">{room.name}</span>
                                            </div>
                                            <span className="font-bold text-solar-green">{formatCurrency(room.priceSnapshot)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Extras */}
                            {reservation.extras.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-bold text-solar-green mb-3">Serviços Extras</h3>
                                    <div className="space-y-2">
                                        {reservation.extras.map((extra, index) => (
                                            <div
                                                key={index}
                                                onClick={() => reservation.status !== 'CANCELED' && toggleExtra(index)}
                                                className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${reservation.status === 'CANCELED' ? 'bg-slate-100 border-slate-200 opacity-60' :
                                                    selectedExtras.has(index)
                                                        ? 'bg-red-50 border-red-300 cursor-pointer'
                                                        : 'bg-white border-slate-200 hover:border-solar-green cursor-pointer'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    {reservation.status !== 'CANCELED' && (
                                                        <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${selectedExtras.has(index)
                                                            ? 'bg-red-500 border-red-500'
                                                            : 'border-slate-300'
                                                            }`}>
                                                            {selectedExtras.has(index) && <XCircle size={16} className="text-white" />}
                                                        </div>
                                                    )}
                                                    <span className="font-medium">{extra.name} ({extra.quantity}x)</span>
                                                </div>
                                                <span className="font-bold text-solar-green">{formatCurrency(extra.priceSnapshot * extra.quantity)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Total */}
                            <div className="flex justify-between items-center p-4 bg-solar-green/10 rounded-xl">
                                <span className="text-lg font-bold text-solar-green">Valor Total</span>
                                <span className="text-2xl font-bold text-solar-green">{formatCurrency(reservation.totalPrice)}</span>
                            </div>

                            {/* Botões de ação */}
                            {reservation.status !== 'CANCELED' && (
                                <div className="pt-6 border-t border-slate-200">
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
                                        <div className="flex items-start gap-3">
                                            <AlertTriangle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-bold text-yellow-800 mb-1">Atenção</p>
                                                <p className="text-sm text-yellow-700">
                                                    {hasSelection
                                                        ? 'Clique em "Cancelar Itens Selecionados" para remover apenas os itens marcados, ou "Cancelar Reserva Completa" para cancelar tudo.'
                                                        : 'Selecione os itens que deseja cancelar clicando sobre eles, ou clique em "Cancelar Reserva Completa" para cancelar toda a reserva.'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col sm:flex-row gap-4">
                                        {hasSelection && !isFullCancellation && (
                                            <button
                                                onClick={() => handleCancelReservation('partial')}
                                                disabled={cancelling}
                                                className="flex-1 px-6 py-4 bg-orange-500 text-white rounded-xl font-bold uppercase tracking-widest hover:bg-orange-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                            >
                                                {cancelling && cancelType === 'partial' ? (
                                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <XCircle size={20} />
                                                )}
                                                Cancelar Itens Selecionados
                                            </button>
                                        )}

                                        <button
                                            onClick={() => handleCancelReservation('full')}
                                            disabled={cancelling}
                                            className="flex-1 px-6 py-4 bg-red-600 text-white rounded-xl font-bold uppercase tracking-widest hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {cancelling && cancelType === 'full' ? (
                                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                <Trash2 size={20} />
                                            )}
                                            Cancelar Reserva Completa
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Botão para nova busca */}
                            <div className="text-center pt-4">
                                <button
                                    onClick={() => {
                                        setReservation(null);
                                        setSearchId('');
                                        setError(null);
                                    }}
                                    className="text-solar-green hover:text-solar-gold transition-colors text-sm font-bold uppercase tracking-widest"
                                >
                                    Buscar outra reserva
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="text-center mt-8">
                <button onClick={onBack} className="bg-solar-green text-white px-8 py-4 rounded-2xl font-bold uppercase tracking-widest hover:bg-solar-gold transition-all shadow-xl">
                    <Home size={18} className="inline mr-2" /> Voltar ao Início
                </button>
            </div>
        </div>
    );
};
