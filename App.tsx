import React, { useState, useRef, useEffect, useMemo } from 'react';
import Navbar from './components/Navbar';
import WhatsAppButton from './components/WhatsAppButton';
import BookingForm from './components/BookingForm';
import AdminPanel, { AdminLogin } from './components/AdminPanel';
import { ViewState, Room, HolidayPackage, DiscountCode, HotelConfig, ExtraService, Reservation, ReservationStatus } from './types';
import { toLocalISO, parseISODate, formatDisplayDate, calculateNights } from './utils/dateUtils';
import { INITIAL_CONFIG } from './constants';
import { useSupabaseData } from './hooks/useSupabaseData';
import { sendReservationEmails } from './services/emailService';
import { ChevronLeft, ChevronRight, Check, CalendarDays, Share2, ShoppingCart, Plus, Minus, Users, Gift, Home, Ticket, Zap, AlertCircle } from 'lucide-react';
import { RoomGallery } from './components/RoomGallery';
import { Lightbox } from './components/Lightbox';
import { CancellationPage } from './components/CancellationPage';
import { RegulationPage } from './components/RegulationPage';
import { SuccessPage } from './components/SuccessPage';
import { DateSelectorBar } from './components/DateSelectorBar';

// Ordem de prioridade das acomodações
const ROOM_ORDER = ['casal', 'triplo', 'sacada', 'quadruplo', 'quádruplo', 'varanda', 'loft'];

const sortRoomsByPriority = (rooms: Room[]): Room[] => {
  return [...rooms].sort((a, b) => {
    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();

    const getOrderIndex = (name: string) => {
      for (let i = 0; i < ROOM_ORDER.length; i++) {
        if (name.includes(ROOM_ORDER[i])) return i;
      }
      return ROOM_ORDER.length;
    };

    return getOrderIndex(nameA) - getOrderIndex(nameB);
  });
};

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.HOME);
  const [selectedRooms, setSelectedRooms] = useState<Room[]>([]);
  const [activePackage, setActivePackage] = useState<HolidayPackage | null>(null);
  const [lastReservation, setLastReservation] = useState<Reservation | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const {
    rooms,
    packages,
    discounts,
    extras,
    reservations,
    setRooms,
    setPackages,
    setDiscounts,
    setExtras,
    setReservations,
    saveReservationToSupabase,
    refreshData,
    isSaving,
    upsertRoom,
    deleteRoom,
    upsertPackage,
    deletePackage,
    upsertExtra,
    deleteExtra,
    upsertDiscount,
    deleteDiscount,
    updateReservationStatus,
  } = useSupabaseData();

  const [config, setConfig] = useState<HotelConfig>(INITIAL_CONFIG);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  const [zoomData, setZoomData] = useState<{ images: string[], index: number } | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [cancellationReservationId, setCancellationReservationId] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentView]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash;

    const checkInParam = params.get('checkIn');
    const checkOutParam = params.get('checkOut');
    if (checkInParam && checkOutParam) {
      const checkInDate = parseISODate(checkInParam);
      const checkOutDate = parseISODate(checkOutParam);
      if (!isNaN(checkInDate.getTime()) && !isNaN(checkOutDate.getTime())) {
        setCheckIn(checkInDate);
        setCheckOut(checkOutDate);
        setCurrentCalendarDate(checkInDate);
      }
    }

    const viewParam = params.get('view');
    if (viewParam === 'regulamento') {
      setCurrentView(ViewState.REGULAMENTO);
    } else if (viewParam === 'cancelamento') {
      setCurrentView(ViewState.CANCELAMENTO);
      const reservaParam = params.get('reserva');
      if (reservaParam) {
        setCancellationReservationId(reservaParam);
      }
    }

    const pacoteParam = params.get('pacote');
    if (pacoteParam || hash.startsWith('#pacote-')) {
      const pacoteId = pacoteParam || hash.replace('#pacote-', '');
      setTimeout(() => {
        const element = document.getElementById(`pacote-${pacoteId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          document.getElementById('pacotes-section')?.scrollIntoView({ behavior: 'smooth' });
        }
      }, 500);
    }
  }, []);

  const showCopyToast = (msg: string) => {
    setCopyToast(msg);
    setTimeout(() => setCopyToast(null), 2000);
  };

  const safeCopyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      return true;
    } catch (err) {
      console.error('Erro ao copiar:', err);
      return false;
    }
  };

  const handleNavigate = (view: ViewState) => {
    if (view === ViewState.ROOMS || view === ViewState.PACKAGES) {
      const targetId = view === ViewState.ROOMS ? 'quartos-section' : 'pacotes-section';
      if (currentView !== ViewState.HOME) {
        setCurrentView(ViewState.HOME);
        setTimeout(() => document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth' }), 100);
      } else {
        document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }
    setCurrentView(view);
  };

  const handleShareDates = () => {
    if (!checkIn || !checkOut) return;
    const text = `Confira minha estadia planejada no Hotel Solar: de ${formatDisplayDate(toLocalISO(checkIn))} até ${formatDisplayDate(toLocalISO(checkOut))}. ☀️🏖️`;
    const baseUrl = window.location.origin + window.location.pathname;
    const checkInStr = toLocalISO(checkIn);
    const checkOutStr = toLocalISO(checkOut);
    const url = `${baseUrl}?checkIn=${checkInStr}&checkOut=${checkOutStr}`;

    if (navigator.share) {
      navigator.share({ title: 'Estadia no Solar', text, url }).catch(async () => {
        await safeCopyToClipboard(`${text} ${url}`);
        showCopyToast("Link copiado!");
      });
    } else {
      safeCopyToClipboard(`${text} ${url}`).then(() => showCopyToast("Link copiado!"));
    }
  };

  const handleSharePackage = (e: React.MouseEvent, pkg: HolidayPackage) => {
    e.stopPropagation();
    const text = `Olha esse pacote incrível no Hotel Solar: ${pkg.name}! ☀️🌊`;
    const baseUrl = window.location.origin + window.location.pathname;
    const url = `${baseUrl}?pacote=${encodeURIComponent(pkg.id)}#pacote-${pkg.id}`;

    if (navigator.share) {
      navigator.share({ title: pkg.name, text, url }).catch(async () => {
        await safeCopyToClipboard(`${text} ${url}`);
        showCopyToast("Link copiado!");
      });
    } else {
      safeCopyToClipboard(`${text} ${url}`).then(() => showCopyToast("Link copiado!"));
    }
  };

  const handleDateClick = (day: number) => {
    const clickedDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), day);
    const dateIso = toLocalISO(clickedDate);
    const activeRooms = rooms.filter(r => r.active);

    const isCheckInBlockedForAll = activeRooms.length > 0 && activeRooms.every(r =>
      r.overrides?.some(o => o.dateIso === dateIso && (o.noCheckIn === true || o.noCheckIn === 'true'))
    );
    const isCheckOutBlockedForAll = activeRooms.length > 0 && activeRooms.every(r =>
      r.overrides?.some(o => o.dateIso === dateIso && (o.noCheckOut === true || o.noCheckOut === 'true'))
    );

    if (!checkIn || (checkIn && checkOut)) {
      if (isCheckInBlockedForAll && isCheckOutBlockedForAll) {
        alert("Esta data está restrita para novos Check-ins e Check-outs. Por favor, escolha outro dia.");
        return;
      }
      if (isCheckInBlockedForAll) {
        alert("Desculpe, não realizamos Check-in nesta data. Por favor, selecione outro dia para sua chegada.");
        return;
      }

      setCheckIn(clickedDate);
      setCheckOut(null);
      setActivePackage(null);
    } else if (checkIn && !checkOut) {
      if (clickedDate > checkIn) {
        if (isCheckInBlockedForAll && isCheckOutBlockedForAll) {
          alert("Esta data está restrita para novos Check-ins e Check-outs. Por favor, escolha outro dia.");
          return;
        }
        if (isCheckOutBlockedForAll) {
          alert("Desculpe, não realizamos Check-out nesta data. Por favor, selecione outro dia para sua partida.");
          return;
        }

        setCheckOut(clickedDate);
        setTimeout(() => {
          document.getElementById('quartos-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      } else {
        // Novo check-in (data anterior)
        if (isCheckInBlockedForAll && isCheckOutBlockedForAll) {
          alert("Esta data está restrita para novos Check-ins e Check-outs. Por favor, escolha outro dia.");
          return;
        }
        if (isCheckInBlockedForAll) {
          alert("Desculpe, não realizamos Check-in nesta data. Por favor, selecione outro dia para sua chegada.");
          return;
        }
        setCheckIn(clickedDate);
      }
    }
  };

  const handleSelectPackage = (pkg: HolidayPackage) => {
    const startDate = parseISODate(pkg.startIsoDate);
    const endDate = parseISODate(pkg.endIsoDate);
    setCheckIn(startDate);
    setCheckOut(endDate);
    setCurrentCalendarDate(startDate);
    setActivePackage(pkg);
    // Rolar para as acomodações para o cliente escolher
    setTimeout(() => {
      document.getElementById('quartos-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleAddReservation = async (reservation: Reservation) => {
    setSubmissionError(null);
    const result = await saveReservationToSupabase(reservation);
    if (result.success) {
      setLastReservation(reservation);
      setCurrentView(ViewState.SUCCESS);
      sendReservationEmails(reservation);
      return true;
    } else {
      const errorMsg = result.error || 'Erro inesperado';
      setSubmissionError(errorMsg);
      console.error('[App] Falha na reserva:', errorMsg);
      return false;
    }
  };

  const calculateRoomDisplayPrice = (room: Room) => {
    if (!checkIn || !checkOut) return room.price;
    let total = 0;
    let current = new Date(checkIn);
    while (current < checkOut) {
      const iso = toLocalISO(current);
      const override = room.overrides?.find(o => o.dateIso === iso);
      total += override?.price ?? room.price;
      current.setDate(current.getDate() + 1);
    }
    return total;
  };

  const isRoomAvailable = (room: Room) => {
    if (!checkIn || !checkOut) return true;

    const checkInIso = toLocalISO(checkIn);
    const checkOutIso = toLocalISO(checkOut);

    // Check check-in restriction
    const checkInOv = room.overrides?.find(o => o.dateIso === checkInIso);
    if (checkInOv?.noCheckIn) return false;

    // Check check-out restriction
    const checkOutOv = room.overrides?.find(o => o.dateIso === checkOutIso);
    if (checkOutOv?.noCheckOut) return false;

    let current = new Date(checkIn);
    while (current < checkOut) {
      const iso = toLocalISO(current);
      const override = room.overrides?.find(o => o.dateIso === iso);

      if (override?.isClosed) return false;

      const available = override?.availableQuantity ?? room.totalQuantity;
      if (available <= 0) return false;
      current.setDate(current.getDate() + 1);
    }
    return true;
  };



  const sortedActiveRooms = useMemo(() => {
    return sortRoomsByPriority(rooms.filter(r => r.active));
  }, [rooms]);

  const sortedActivePackages = useMemo(() => {
    return [...packages]
      .filter(p => p.active)
      .sort((a, b) => a.startIsoDate.localeCompare(b.startIsoDate));
  }, [packages]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F8F6]">
      {currentView !== ViewState.ADMIN && <Navbar currentView={currentView} onNavigate={handleNavigate} />}

      <main className="flex-1">
        {(currentView === ViewState.HOME || currentView === ViewState.ROOMS || currentView === ViewState.PACKAGES) && (
          <div className="animate-in fade-in duration-1000">
            <section
              className="relative w-full h-[300px] md:h-[400px] bg-cover bg-no-repeat"
              style={{
                backgroundImage: 'url(/hero-family-pool.jpg)',
                backgroundPosition: 'center 70%'
              }}
              role="img"
              aria-label="Hotel Solar - Família na piscina"
            >
            </section>

            <DateSelectorBar
              currentCalendarDate={currentCalendarDate}
              setCurrentCalendarDate={setCurrentCalendarDate}
              checkIn={checkIn}
              checkOut={checkOut}
              packages={packages}
              rooms={rooms}
              onDateClick={handleDateClick}
              onShareDates={handleShareDates}
            />

            <div id="pacotes-section" className="max-w-7xl mx-auto px-4 py-24 scroll-mt-24">
              <div className="text-center mb-16">
                <h2 className="text-4xl md:text-6xl font-serif text-solar-green mb-4">Pacotes Especiais</h2>
                <div className="w-24 h-1 bg-solar-gold mx-auto rounded-full"></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-6xl mx-auto">
                {sortedActivePackages.map(pkg => (
                  <div key={pkg.id} id={`pacote-${pkg.id}`} className="bg-white rounded-[2rem] overflow-hidden shadow-xl border border-slate-50 flex flex-col group hover:shadow-2xl transition-all duration-500 relative scroll-mt-24">
                    <div className="aspect-[16/10] relative overflow-hidden">
                      {pkg.imageUrl ? (
                        <img src={pkg.imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" alt={pkg.name} loading="lazy" decoding="async" />
                      ) : (
                        <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-300"><Ticket size={48} /></div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>

                      <button
                        onClick={(e) => handleSharePackage(e, pkg)}
                        className="absolute top-6 right-6 p-3 bg-white/20 hover:bg-solar-gold rounded-full text-white backdrop-blur-md transition-all shadow-xl z-20 group/share"
                        title="Compartilhar Pacote"
                      >
                        <Share2 size={20} className="group-hover/share:scale-110 transition-transform" />
                      </button>

                      {/* Selo de Desconto de Alto Impacto */}
                      {(pkg.fullPeriodDiscountPct ?? 0) > 0 && (
                        <div className="absolute top-6 left-6 z-30 bg-red-600 text-white px-5 py-2 rounded-full font-bold text-sm shadow-2xl animate-bounce flex items-center gap-2 border-2 border-white/50">
                          <Zap size={16} fill="white" />
                          <span>{pkg.fullPeriodDiscountPct}% OFF</span>
                        </div>
                      )}

                      <div className="absolute bottom-6 left-6 text-white text-left z-20">
                        <span className="text-[10px] font-bold uppercase tracking-widest bg-solar-gold/90 text-solar-green px-3 py-1 rounded mb-2 inline-block">
                          Pacote Especial
                        </span>
                        <h3 className="text-3xl font-serif">{pkg.name}</h3>
                      </div>
                    </div>
                    <div className="p-10 flex-1 flex flex-col justify-between">
                      <div className="bg-solar-gold/10 border border-solar-gold/30 rounded-xl p-4 mb-6 flex items-center justify-center gap-3 relative overflow-hidden group/dates">
                        <div className="absolute inset-0 bg-solar-gold/5 translate-x-[-100%] group-hover/dates:translate-x-[100%] transition-transform duration-1000"></div>
                        <CalendarDays size={20} className="text-solar-gold relative z-10" />
                        <span className="text-solar-green font-bold text-sm tracking-wide relative z-10">
                          {formatDisplayDate(pkg.startIsoDate).toUpperCase()}
                          {' — '}
                          {formatDisplayDate(pkg.endIsoDate).toUpperCase()}
                        </span>
                      </div>
                      <p className="text-slate-500 text-sm leading-relaxed mb-6 italic text-left">{pkg.description}</p>

                      <button onClick={() => handleSelectPackage(pkg)} className="w-full bg-solar-green text-white py-5 rounded-2xl font-bold uppercase text-[11px] tracking-[0.2em] hover:bg-solar-gold transition-all shadow-lg active:scale-95">Ver Disponibilidade</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div id="quartos-section" className="max-w-7xl mx-auto px-4 py-24 scroll-mt-24">
              <div className="text-center mb-16 space-y-4">
                <h2 className="text-4xl md:text-6xl font-serif text-solar-green">Acomodações</h2>
                <p className="text-slate-400 text-sm italic">{checkIn && checkOut ? `${formatDisplayDate(toLocalISO(checkIn))} — ${formatDisplayDate(toLocalISO(checkOut))}` : 'Selecione suas datas para visualizar os valores'}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                {sortedActiveRooms.map(room => {
                  const displayPrice = calculateRoomDisplayPrice(room);
                  const available = isRoomAvailable(room);
                  const roomCount = selectedRooms.filter(r => r.id === room.id).length;
                  const isInCart = roomCount > 0;
                  const inventory = room.totalQuantity; // Simplified for display
                  const canAddMore = available && roomCount < inventory;
                  return (
                    <div key={room.id} className={`relative bg-white rounded-3xl overflow-hidden shadow-lg transition-all duration-500 hover:shadow-2xl border ${!available && (checkIn && checkOut) ? 'grayscale opacity-60' : isInCart ? 'border-solar-gold border-2 ring-4 ring-solar-gold/20' : 'border-slate-100'}`}>
                      {isInCart && (
                        <div className="bg-solar-gold text-white text-center py-2 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                          <Check size={14} /> {roomCount}x Adicionado
                        </div>
                      )}

                      {/* Gatilhos Mentais / Badges de Marketing */}
                      {!isInCart && (
                        <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
                          {room.name.toLowerCase().includes('casal') && (
                            <div className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-wider shadow-lg flex items-center gap-1.5 animate-pulse border border-emerald-400/30">
                              <Zap size={12} fill="white" />
                              <span>Melhor Oferta</span>
                            </div>
                          )}
                          {room.name.toLowerCase().includes('loft') && (
                            <div className="bg-orange-600 text-white px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-wider shadow-lg flex items-center gap-1.5 border border-orange-400/30">
                              <AlertCircle size={12} />
                              <span>Últimas {room.totalQuantity} unidades</span>
                            </div>
                          )}
                        </div>
                      )}

                      <RoomGallery room={room} onZoom={(idx) => setZoomData({ images: room.imageUrls.filter(u => u), index: idx })} />
                      <div className="p-10 space-y-6 text-left">
                        <h3 className="font-serif font-bold text-2xl text-solar-green">{room.name}</h3>
                        <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
                          <Users size={16} className="text-solar-gold" />
                          <span>Até <strong>{room.capacity}</strong> {room.capacity === 1 ? 'pessoa' : 'pessoas'}</span>
                        </div>
                        <div className="flex items-center gap-4 flex-wrap">
                          {room.features.map(f => (
                            <span key={f} className="text-[9px] uppercase font-bold tracking-widest text-slate-400 border border-slate-100 px-2 py-1 rounded-full">{f}</span>
                          ))}
                        </div>
                        <div className="flex items-end justify-between border-t border-slate-50 pt-8">
                          <div>
                            {checkIn && checkOut ? (
                              <>
                                <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Total Estadia</span>
                                {available ? (
                                  <div className="flex flex-col">
                                    {activePackage && activePackage.fullPeriodDiscountPct! > 0 &&
                                      toLocalISO(checkIn) === activePackage.startIsoDate &&
                                      toLocalISO(checkOut) === activePackage.endIsoDate ? (
                                      <>
                                        <span className="text-xs text-slate-400 line-through">R$ {displayPrice.toLocaleString()}</span>
                                        <div className="flex items-center gap-2">
                                          <span className="text-3xl font-serif font-bold text-solar-green">
                                            R$ {Math.round(displayPrice * (1 - activePackage.fullPeriodDiscountPct! / 100)).toLocaleString()}
                                          </span>
                                          <span className="bg-solar-gold/20 text-solar-gold text-[10px] font-black px-2 py-0.5 rounded-full">-{activePackage.fullPeriodDiscountPct}%</span>
                                        </div>
                                      </>
                                    ) : (
                                      <span className="text-3xl font-serif font-bold text-solar-green">R$ {displayPrice.toLocaleString()}</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-3xl font-serif font-bold text-slate-300">Esgotado</span>
                                )}
                              </>
                            ) : (
                              <span className="text-sm text-slate-400 italic">Selecione as datas</span>
                            )}
                          </div>
                          {isInCart ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  const idx = selectedRooms.findIndex(r => r.id === room.id);
                                  if (idx !== -1) {
                                    const newRooms = [...selectedRooms];
                                    newRooms.splice(idx, 1);
                                    setSelectedRooms(newRooms);
                                  }
                                }}
                                className="w-10 h-10 rounded-full font-bold transition-all bg-red-500 text-white hover:bg-red-600 shadow-lg active:scale-95 flex items-center justify-center"
                              >
                                <Minus size={18} />
                              </button>
                              <span className="text-xl font-bold text-solar-green min-w-[2rem] text-center">{roomCount}</span>
                              <button
                                onClick={() => setSelectedRooms([...selectedRooms, room])}
                                disabled={!canAddMore}
                                className={`w-10 h-10 rounded-full font-bold transition-all shadow-lg active:scale-95 flex items-center justify-center ${canAddMore ? 'bg-solar-green text-white hover:bg-solar-gold' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                              >
                                <Plus size={18} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { if (!checkIn || !checkOut) { document.getElementById('reserva-section')?.scrollIntoView({ behavior: 'smooth' }); return; } setSelectedRooms([...selectedRooms, room]); }}
                              disabled={!available}
                              className={`px-6 py-4 rounded-xl font-bold uppercase text-[10px] tracking-widest transition-all ${available ? 'bg-solar-green text-white hover:bg-solar-gold shadow-lg active:scale-95 flex items-center gap-2' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                            >
                              <Plus size={14} /> Adicionar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedRooms.length > 0 && checkIn && checkOut && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
                <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 flex items-center gap-4 max-w-lg">
                  <div className="bg-solar-green/10 p-3 rounded-xl">
                    <ShoppingCart className="text-solar-green" size={24} />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-solar-green">{selectedRooms.length} {selectedRooms.length === 1 ? 'quarto' : 'quartos'}</p>
                    <p className="text-sm text-slate-500">Total: R$ {selectedRooms.reduce((acc, room) => acc + calculateRoomDisplayPrice(room), 0).toLocaleString()}</p>
                  </div>
                  <button
                    onClick={() => setCurrentView(ViewState.BOOKING)}
                    className="bg-solar-green text-white px-6 py-3 rounded-xl font-bold uppercase text-[10px] tracking-widest hover:bg-solar-gold transition-all shadow-lg active:scale-95"
                  >
                    Reservar Agora
                  </button>
                </div>
              </div>
            )}

            <div className="max-w-7xl mx-auto px-4 py-16 text-slate-600 space-y-8">
              <div className="border-t border-slate-200 pt-12 text-center mb-12">
                <h2 className="text-2xl font-serif text-solar-green mb-4">Informações Importantes</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="space-y-3 text-center md:text-left">
                  <h3 className="font-bold text-solar-green flex items-center justify-center md:justify-start gap-2">🕑 Horários</h3>
                  <p className="text-sm">Check-in: 14h | Check-out: 12h</p>
                </div>
                <div className="space-y-3 text-center md:text-left">
                  <h3 className="font-bold text-solar-green flex items-center justify-center md:justify-start gap-2">🍽️ Café da Manhã</h3>
                  <p className="text-sm">Cortesia servida das 07h às 10h.</p>
                </div>
                <div className="space-y-3 text-center md:text-left">
                  <h3 className="font-bold text-solar-green flex items-center justify-center md:justify-start gap-2">📶 Internet</h3>
                  <p className="text-sm">Wi-Fi gratuito em todas as áreas.</p>
                </div>
              </div>
              <div className="text-center pt-8">
                <button onClick={() => setCurrentView(ViewState.REGULAMENTO)} className="text-solar-gold font-bold uppercase text-[10px] tracking-widest hover:underline">Ver Regulamento</button>
              </div>
            </div>
          </div>
        )}

        {currentView === ViewState.BOOKING && (
          <div className="max-w-4xl mx-auto px-4 py-16">
            <BookingForm
              selectedRooms={selectedRooms}
              discountCodes={discounts}
              extras={extras}
              activePackage={activePackage}
              initialCheckIn={checkIn}
              initialCheckOut={checkOut}
              onRemoveRoom={(idx) => setSelectedRooms(selectedRooms.filter((_, i) => i !== idx))}
              onAddReservation={handleAddReservation}
              isSaving={isSaving}
              submissionError={submissionError}
              onBack={() => handleNavigate(ViewState.HOME)}
            />
          </div>
        )}

        {currentView === ViewState.SUCCESS && lastReservation && (
          <SuccessPage
            reservation={lastReservation}
            onGoHome={() => { setCheckIn(null); setCheckOut(null); setSelectedRooms([]); setCurrentView(ViewState.HOME); }}
            onCopyPix={(code) => {
              safeCopyToClipboard(code);
              showCopyToast('Chave PIX copiada!');
            }}
          />
        )}

        {currentView === ViewState.REGULAMENTO && (
          <RegulationPage onBack={() => setCurrentView(ViewState.HOME)} />
        )}

        {currentView === ViewState.CANCELAMENTO && (
          <CancellationPage
            reservationId={cancellationReservationId}
            reservations={reservations}
            setReservations={setReservations}
            onSaveReservation={saveReservationToSupabase}
            onUpdateStatus={updateReservationStatus}
            onBack={() => setCurrentView(ViewState.HOME)}
          />
        )}

        {currentView === ViewState.ADMIN && (
          isAdminLoggedIn ? (
            <AdminPanel
              rooms={rooms}
              packages={packages}
              discounts={discounts}
              extras={extras}
              config={config}
              reservations={reservations}
              onUpdateRooms={setRooms}
              onUpdatePackages={setPackages}
              onUpdateDiscounts={setDiscounts}
              onUpdateExtras={setExtras}
              onUpdateConfig={setConfig}
              onUpdateReservationStatus={updateReservationStatus}
              onUpsertRoom={upsertRoom}
              onDeleteRoom={deleteRoom}
              onUpsertPackage={upsertPackage}
              onDeletePackage={deletePackage}
              onUpsertExtra={upsertExtra}
              onDeleteExtra={deleteExtra}
              onUpsertDiscount={upsertDiscount}
              onDeleteDiscount={deleteDiscount}
              isSaving={isSaving}
              onLogout={() => { setIsAdminLoggedIn(false); setCurrentView(ViewState.HOME); }}
            />
          ) : (
            <AdminLogin onLogin={(pass) => {
              if (pass === 'metron82') setIsAdminLoggedIn(true);
              else alert('Senha incorreta');
            }} />
          )
        )}
      </main>

      {zoomData && <Lightbox images={zoomData.images} initialIndex={zoomData.index} onClose={() => setZoomData(null)} />}

      <WhatsAppButton />

      {copyToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1001] animate-in fade-in slide-in-from-bottom-2 duration-300 pointer-events-none">
          <div className="bg-solar-green/90 backdrop-blur-md text-white px-5 py-2 rounded-full shadow-2xl flex items-center gap-2 border border-solar-gold/20">
            <Check size={14} className="text-solar-gold" />
            <span className="text-[10px] font-bold uppercase tracking-widest">{copyToast}</span>
          </div>
        </div>
      )}

      <footer className="bg-solar-green text-solar-sand py-24 px-4 text-center border-t border-solar-gold/10">
        <img src="/logo.png" alt="Hotel Solar" className="h-24 md:h-32 w-auto mx-auto mb-8 drop-shadow-lg" />
        <p className="text-sm opacity-50 tracking-widest mb-12">Av. Atlântica • Salinópolis - PA<br />Tel: (91) 98100-0800</p>
        <button onClick={() => setCurrentView(ViewState.ADMIN)} className="text-[10px] font-bold uppercase tracking-[0.4em] opacity-30 hover:opacity-100 transition-all hover:text-solar-gold">Painel Gestão</button>
      </footer>
    </div>
  );
};