import React, { useState, useRef, useEffect, useMemo } from 'react';
import Navbar from './components/Navbar';
import WhatsAppButton from './components/WhatsAppButton';
import BookingForm from './components/BookingForm';
import AdminPanel, { AdminLogin } from './components/AdminPanel';
import { ViewState, Room, HolidayPackage, DiscountCode, HotelConfig, ExtraService, Reservation, ReservationStatus } from './types';
import { toLocalISO, parseISODate, formatDisplayDate, calculateNights } from './utils/dateUtils';
import { getPublicImageUrl } from './utils/imageUtils';
import { INITIAL_CONFIG, INITIAL_ROOMS } from './constants';
import { sortRoomsByPriority } from './utils/roomUtils';
import { useSupabaseData } from './hooks/useSupabaseData';
import { offlineQueue } from './lib/offlineQueue';
import { sendReservationEmails } from './services/emailService';

import { JulySection } from './components/JulySection';
import { Lightbox } from './components/Lightbox';
import { Share2, Zap, ArrowRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Info, Luggage, MapPin, Search, Star, User, X, Ticket, Plus, Minus, Users, AlertCircle, ShoppingCart } from 'lucide-react';
import { SuccessPage } from './components/SuccessPage';
import { RegulationPage } from './components/RegulationPage';
import { CancellationPage } from './components/CancellationPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DateSelectorBar } from './components/DateSelectorBar';
import { RoomGallery } from './components/RoomGallery';
import { PreCheckinPage } from './components/PreCheckinPage';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.HOME);
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  const [currentCalendarDate, setCurrentCalendarDate] = useState<Date>(new Date());

  const {
    rooms, packages, discounts, extras, reservations,
    loading, isSaving, isConnected, error,
    user, authLoading, login, logout, // Auth from hook
    setRooms, setPackages, setDiscounts, setExtras, setReservations,
    saveReservationToSupabase, updateReservationStatus, updateReservation,
    upsertRoom, upsertRooms, deleteRoom,
    upsertPackage, deletePackage,
    upsertExtra, deleteExtra,
    upsertDiscount, deleteDiscount,
    refreshData
  } = useSupabaseData();

  const [selectedRooms, setSelectedRooms] = useState<Room[]>([]);
  const [activePackage, setActivePackage] = useState<HolidayPackage | null>(null);
  // isAdminLoggedIn and loginError removed in favor of hook auth
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const [lastReservation, setLastReservation] = useState<Reservation | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [zoomData, setZoomData] = useState<{ images: string[], index: number } | null>(null);
  const [cancellationReservationId, setCancellationReservationId] = useState<string>('');
  const [preCheckinReservationId, setPreCheckinReservationId] = useState<string>('');

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineCount, setOfflineCount] = useState(offlineQueue.getPendingCount());
  const [config, setConfig] = useState<HotelConfig>(INITIAL_CONFIG);

  useEffect(() => {
    const handleStatusChange = () => setIsOnline(navigator.onLine);
    const handleQueueUpdate = (e: any) => setOfflineCount(e.detail?.count || 0);

    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);
    window.addEventListener('offline-queue-updated', handleQueueUpdate);

    return () => {
      window.removeEventListener('online', handleStatusChange);
      window.removeEventListener('offline', handleStatusChange);
      window.removeEventListener('offline-queue-updated', handleQueueUpdate);
    };
  }, []);

  useEffect(() => {
    // Apenas rola para o topo se NÃO for navegação para seções (Pacotes/Quartos)
    if (currentView !== ViewState.ROOMS && currentView !== ViewState.PACKAGES) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentView]);

  // Auto-restore Varanda Térreo if missing or broken (Maintenance)
  /*
  useEffect(() => {
    if (rooms.length > 0 && !isSaving) {
      const varandaDef = INITIAL_ROOMS.find(r => r.id === 'varanda-terreo');
      const existingRoom = rooms.find(r => r.id === 'varanda-terreo');

      // Se não existe, ou se existe mas está sem imagens (estado quebrado antigo)
      if (varandaDef && (!existingRoom || (existingRoom.imageUrls && existingRoom.imageUrls.length === 0))) {
        console.log("Restaurando/Corrigindo quarto 'varanda-terreo'...", varandaDef);
        upsertRoom(varandaDef);
      }
    }
  }, [rooms, isSaving, upsertRoom]);
  */

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    // ... (rest of the existing useEffect)

    const checkInParam = params.get('checkIn');
    const checkOutParam = params.get('checkOut');
    if (checkInParam && checkOutParam) {
      const checkInDate = parseISODate(checkInParam);
      const checkOutDate = parseISODate(checkOutParam);
      if (!isNaN(checkInDate.getTime()) && !isNaN(checkOutDate.getTime())) {
        setCheckIn(checkInDate);
        setCheckOut(checkOutDate);
        setCurrentCalendarDate(checkInDate);
        // Scroll to rooms section after render
        setTimeout(() => {
          document.getElementById('quartos-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 500);
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

    // New Routing for Pre-Checkin
    if (window.location.pathname.startsWith('/pre-checkin/')) {
      const id = window.location.pathname.split('/pre-checkin/')[1];
      if (id) {
        setPreCheckinReservationId(id);
        setCurrentView(ViewState.PRE_CHECKIN);
      }
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
      // Definimos o ID da seção alvo
      const targetId = view === ViewState.ROOMS ? 'quartos-section' : 'pacotes-section';

      // Função auxiliar para rolar
      const performScroll = () => {
        const element = document.getElementById(targetId);
        if (element) {
          // Ajustamos o offset com scrollBy para compensar o navbar fixo se necessário
          // Mas como temos navbar padrão, scrollIntoView geralmente funciona bem.
          // Usamos 'start' para alinhar o topo da seção com o topo da tela
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };

      // Se não estivermos em uma view que renderiza a Home (onde estão as seções), mudamos para Home
      // Nota: PACKAGES e ROOMS renderizam o mesmo layout da HOME, então não precisamos mudar se já estivermos nelas
      // Mas para garantir consistência visual (navbar highlight), podemos permitir a mudança de estado

      setCurrentView(view);

      // Agendamos o scroll para logo após a renderização
      setTimeout(() => performScroll(), 100);

      return;
    }

    // Para outras views (Admin, Booking, etc)
    setCurrentView(view);
    // Scroll para o topo padrão via useEffect
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
      {currentView !== ViewState.ADMIN && <Navbar
        currentView={currentView}
        onNavigate={handleNavigate}
        offlineCount={offlineCount}
        isOnline={isOnline}
      />}

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
                        <img src={getPublicImageUrl(pkg.imageUrl, 800)} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" alt={pkg.name} loading="lazy" decoding="async" />
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

                      {/* Destaques da Experiência */}
                      {(pkg.includes && pkg.includes.length > 0) && (
                        <div className="mb-8 space-y-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-left">Destaques da experiência:</p>
                          <div className="flex flex-wrap gap-2">
                            {pkg.includes.map((item, idx) => (
                              <span key={idx} className="px-3 py-1.5 bg-slate-50 border border-slate-100 text-slate-600 rounded-lg text-[10px] font-bold flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-solar-gold"></div>
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <button onClick={() => handleSelectPackage(pkg)} className="w-full bg-solar-green text-white py-5 rounded-2xl font-bold uppercase text-[11px] tracking-[0.2em] hover:bg-solar-gold transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 group">
                        Garantir Minha Vaga
                        <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* SEÇÃO ESPECIAL: FÉRIAS DE JULHO */}
            <JulySection
              onSelectPackage={(ci, co) => {
                setCheckIn(ci);
                setCheckOut(co);
                setCurrentCalendarDate(ci);
                setTimeout(() => {
                  document.getElementById('quartos-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 150);
              }}
              checkIn={checkIn}
              checkOut={checkOut}
            />

            {/* SEÇÃO DE ACOMODAÇÕES - REVELADA APENAS APÓS SELEÇÃO DE DATAS */}


            {checkIn && checkOut ? (
              <div id="quartos-section" className="max-w-7xl mx-auto px-4 py-24 scroll-mt-24 animate-in fade-in slide-in-from-bottom-10 duration-1000">
                <div className="bg-solar-gold/10 border-2 border-solar-gold/30 rounded-[3rem] p-12 md:p-16 mb-20 flex flex-col md:flex-row items-center justify-between gap-10 shadow-2xl relative overflow-hidden group/summary">
                  <div className="absolute inset-0 bg-white/40 backdrop-blur-sm -z-10"></div>
                  <div className="absolute top-0 right-0 w-64 h-64 bg-solar-gold/10 rounded-full blur-3xl -mr-32 -mt-32"></div>

                  <div className="text-center md:text-left space-y-4 relative z-10">
                    <div className="inline-flex items-center gap-2 bg-solar-green text-white px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg mb-2">
                      <CalendarDays size={14} /> Seleção Ativa
                    </div>
                    <h2 className="text-4xl md:text-6xl font-serif text-solar-green leading-tight">Suas Opções Solar</h2>
                    <p className="text-lg md:text-xl text-solar-green/70 font-medium">
                      Período: <span className="text-solar-gold bg-solar-green px-3 py-1 rounded-lg ml-2">{formatDisplayDate(toLocalISO(checkIn))} — {formatDisplayDate(toLocalISO(checkOut))}</span>
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setCheckIn(null);
                      setCheckOut(null);
                      setSelectedRooms([]);
                      window.scrollTo({ top: 300, behavior: 'smooth' });
                    }}
                    className="group flex flex-col items-center gap-3 p-6 bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 border border-slate-100"
                  >
                    <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-red-50 group-hover:text-red-500 transition-colors">
                      <Plus className="rotate-45" size={24} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 group-hover:text-red-500">Alterar Datas</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                  {sortedActiveRooms.map(room => {
                    const displayPrice = calculateRoomDisplayPrice(room);
                    const available = isRoomAvailable(room);
                    const roomCount = selectedRooms.filter(r => r.id === room.id).length;
                    const isInCart = roomCount > 0;
                    const inventory = room.totalQuantity;
                    const canAddMore = available && roomCount < inventory;
                    return (
                      <div key={room.id} className={`relative bg-white rounded-3xl overflow-hidden shadow-lg transition-all duration-500 hover:shadow-2xl border ${!available ? 'grayscale opacity-60' : isInCart ? 'border-solar-gold border-2 ring-4 ring-solar-gold/20 shadow-solar-gold/10' : 'border-slate-100'}`}>
                        {isInCart && (
                          <div className="bg-solar-gold text-white text-center py-2 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                            <Check size={14} /> {roomCount}x Adicionado
                          </div>
                        )}

                        <RoomGallery room={room} onZoom={(idx) => setZoomData({ images: room.imageUrls.filter(u => u), index: idx })} />

                        <div className="p-10 space-y-6 text-left">
                          <div className="space-y-3">
                            {!isInCart && (
                              <div className="flex flex-wrap gap-2 mb-2">
                                {room.name.toLowerCase().includes('casal') && (
                                  <div className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full font-bold text-[9px] uppercase tracking-widest flex items-center gap-1.5 border border-emerald-100 animate-pulse">
                                    <Zap size={10} fill="currentColor" />
                                    <span>Melhor Oferta</span>
                                  </div>
                                )}
                                {room.name.toLowerCase().includes('loft') && (
                                  <div className="bg-orange-50 text-orange-600 px-3 py-1 rounded-full font-bold text-[9px] uppercase tracking-widest flex items-center gap-1.5 border border-orange-100">
                                    <AlertCircle size={10} />
                                    <span>Últimas {room.totalQuantity} unidades</span>
                                  </div>
                                )}
                              </div>
                            )}
                            <h3 className="font-serif font-bold text-3xl text-solar-green leading-tight">{room.name}</h3>
                          </div>

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
                                onClick={() => setSelectedRooms([...selectedRooms, room])}
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
            ) : (
              <div id="reserva-section" className="max-w-7xl mx-auto px-4 py-32 text-center space-y-8 scroll-mt-24">
                <div className="bg-solar-gold/10 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                  <CalendarDays size={40} className="text-solar-gold" />
                </div>
                <div className="space-y-4">
                  <h3 className="text-3xl md:text-5xl font-serif text-solar-green">Seu Verão Começa Aqui</h3>
                  <p className="text-slate-500 max-w-lg mx-auto text-lg leading-relaxed italic">
                    "Escolha a melhor data para sua família e deixe que cuidamos do resto. Salinas te espera com o sol mais bonito do Pará."
                  </p>
                </div>
                <div className="flex flex-col items-center gap-4">
                  <button
                    onClick={() => window.scrollTo({ top: 300, behavior: 'smooth' })}
                    className="bg-solar-green text-white px-10 py-5 rounded-2xl font-bold uppercase text-xs tracking-[0.2em] hover:bg-solar-gold transition-all shadow-xl active:scale-95"
                  >
                    Ver Calendário
                  </button>
                  <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Selecione datas para ver valores</p>
                </div>
              </div>
            )}

            {
              selectedRooms.length > 0 && checkIn && checkOut && (
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
              )
            }

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

        {
          currentView === ViewState.BOOKING && (
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
          )
        }

        {
          currentView === ViewState.SUCCESS && lastReservation && (
            <SuccessPage
              reservation={lastReservation}
              onGoHome={() => { setCheckIn(null); setCheckOut(null); setSelectedRooms([]); setCurrentView(ViewState.HOME); }}
              onCopyPix={(code) => {
                safeCopyToClipboard(code);
                showCopyToast('Chave PIX copiada!');
              }}
            />
          )
        }

        {
          currentView === ViewState.REGULAMENTO && (
            <RegulationPage onBack={() => setCurrentView(ViewState.HOME)} />
          )
        }

        {
          currentView === ViewState.CANCELAMENTO && (
            <CancellationPage
              reservationId={cancellationReservationId}
              reservations={reservations}
              setReservations={setReservations}
              onSaveReservation={saveReservationToSupabase}
              onUpdateStatus={updateReservationStatus}
              onBack={() => setCurrentView(ViewState.HOME)}
            />
          )
        }

        {
          currentView === ViewState.ADMIN && (
            authLoading ? (
              <div className="flex h-screen items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-solar-gold"></div>
              </div>
            ) : user ? (
              <ErrorBoundary>
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
                  onUpdateReservation={updateReservation}
                  onUpsertRoom={upsertRoom}
                  onUpsertRooms={upsertRooms}
                  onDeleteRoom={deleteRoom}
                  onUpsertPackage={upsertPackage}
                  onDeletePackage={deletePackage}
                  onUpsertExtra={upsertExtra}
                  onDeleteExtra={deleteExtra}
                  onUpsertDiscount={upsertDiscount}
                  onDeleteDiscount={deleteDiscount}
                  isSaving={isSaving}
                  onRefreshData={refreshData}
                  onLogout={async () => {
                    await logout();
                    setCurrentView(ViewState.HOME);
                  }}
                />
              </ErrorBoundary>
            ) : (
              <AdminLogin
                onLogin={login}
              />
            )
          )
        }

        {
          currentView === ViewState.PRE_CHECKIN && (
            <PreCheckinPage
              reservationId={preCheckinReservationId}
              reservations={reservations}
              onBack={() => {
                window.history.pushState({}, '', '/');
                setCurrentView(ViewState.HOME);
              }}
            />
          )
        }
      </main >

      {zoomData && <Lightbox images={zoomData.images} initialIndex={zoomData.index} onClose={() => setZoomData(null)} />}

      <WhatsAppButton />

      {
        copyToast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1001] animate-in fade-in slide-in-from-bottom-2 duration-300 pointer-events-none">
            <div className="bg-solar-green/90 backdrop-blur-md text-white px-5 py-2 rounded-full shadow-2xl flex items-center gap-2 border border-solar-gold/20">
              <Check size={14} className="text-solar-gold" />
              <span className="text-[10px] font-bold uppercase tracking-widest">{copyToast}</span>
            </div>
          </div>
        )
      }

      <footer className="bg-solar-green text-solar-sand py-24 px-4 text-center border-t border-solar-gold/10">
        <img src="/logo-gold.png" alt="Hotel Solar" className="h-24 md:h-32 w-auto mx-auto mb-8 drop-shadow-lg" />
        <p className="text-sm opacity-50 tracking-widest mb-12">Av. Atlântica • Salinópolis - PA<br />Tel: (91) 98100-0800</p>
        <button onClick={() => setCurrentView(ViewState.ADMIN)} className="text-[10px] font-bold uppercase tracking-[0.4em] opacity-30 hover:opacity-100 transition-all hover:text-solar-gold">Painel Gestão</button>
      </footer>
    </div >
  );
};