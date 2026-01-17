import React, { useState, useRef, useEffect, useMemo } from 'react';
import Navbar from './components/Navbar';
import WhatsAppButton from './components/WhatsAppButton';
import BookingForm from './components/BookingForm';
import AdminPanel, { AdminLogin } from './components/AdminPanel';
import { ViewState, Room, HolidayPackage, DiscountCode, HotelConfig, ExtraService, Reservation, ReservationStatus } from './types';
import { toLocalISO, parseISODate, formatDisplayDate, calculateNights } from './utils/dateUtils';
import { getPublicImageUrl } from './utils/imageUtils';
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
    upsertRooms,
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
                        <img src={getPublicImageUrl(pkg.imageUrl)} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" alt={pkg.name} loading="lazy" decoding="async" />
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
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-left">O que está incluso:</p>
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

                      <button onClick={() => handleSelectPackage(pkg)} className="w-full bg-solar-green text-white py-5 rounded-2xl font-bold uppercase text-[11px] tracking-[0.2em] hover:bg-solar-gold transition-all shadow-lg active:scale-95">Ver Disponibilidade</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* SEÇÃO ESPECIAL: FÉRIAS DE JULHO */}
            <section id="julho-section" className="max-w-7xl mx-auto px-4 pb-24 scroll-mt-24">
              <div className="relative rounded-[3rem] overflow-hidden bg-solar-green p-12 md:p-20 shadow-2xl border border-solar-gold/20">
                <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-solar-gold/20 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-solar-gold/10 rounded-full blur-3xl"></div>

                <div className="relative z-10 flex flex-col md:flex-row items-center gap-12 text-center md:text-left">
                  <div className="flex-1 space-y-6">
                    <div className="inline-flex items-center gap-2 bg-solar-gold/20 text-solar-gold px-4 py-1.5 rounded-full border border-solar-gold/30">
                      <Zap size={16} fill="currentColor" />
                      <span className="text-[10px] font-black uppercase tracking-[0.3em]">Temporada Premium</span>
                    </div>
                    <h2 className="text-5xl md:text-7xl font-serif text-white leading-tight">Férias de Julho em Salinas</h2>
                    <p className="text-solar-sand/80 text-lg md:text-xl max-w-2xl leading-relaxed font-light italic">
                      "O Sol de Julho em Salinas é diferente. É energia, é família, é Hotel Solar. Preparamos 5 experiências exclusivas para você viver o melhor do verão paraense."
                    </p>
                    <div className="flex flex-wrap justify-center md:justify-start gap-4">
                      <div className="flex items-center gap-2 text-solar-gold">
                        <Check size={18} />
                        <span className="text-xs font-bold uppercase tracking-widest">Pé na Areia</span>
                      </div>
                      <div className="flex items-center gap-2 text-solar-gold">
                        <Check size={18} />
                        <span className="text-xs font-bold uppercase tracking-widest">Programação Infantil</span>
                      </div>
                      <div className="flex items-center gap-2 text-solar-gold">
                        <Check size={18} />
                        <span className="text-xs font-bold uppercase tracking-widest">Gastronomia Regional</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-20 space-y-12">
                  {[
                    {
                      id: 'jul-1',
                      name: 'Celebração Solar: Abertura & Aniversário',
                      dates: '02 a 05 de Julho',
                      checkIn: [2026, 6, 2],
                      checkOut: [2026, 6, 5],
                      img: '/celebracao-july-final.jpg',
                      discount: '15',
                      description: 'Damos as boas-vindas ao verão com a grande festa de aniversário do Hotel Solar. Uma celebração única com música ao vivo, coquetel especial e a energia contagiante de Salinas.',
                      programming: ['Festa de Aniversário', 'Música ao Vivo', 'Coquetel de Boas-vindas']
                    },
                    {
                      id: 'jul-family',
                      name: 'Semana da Família: Domingo a Quinta',
                      dates: 'Escolha sua Semana',
                      img: '/semana-da-familia.jpg',
                      discount: '30',
                      isPromotional: true,
                      description: 'O melhor custo-benefício de Julho. Aproveite diárias reduzidas durante a semana e ganhe o Jantar Cortesia (Buffet de Sopas e Massas) todas as noites para toda a sua família.',
                      programming: ['Jantar Cortesia Incluso', 'Buffet de Sopas & Massas', 'Menor Tarifa do Mês', 'Recreação para Crianças'],
                      weeks: [
                        { label: '05 a 09/07', checkIn: [2026, 6, 5], checkOut: [2026, 6, 9] },
                        { label: '12 a 16/07', checkIn: [2026, 6, 12], checkOut: [2026, 6, 16] },
                        { label: '19 a 23/07', checkIn: [2026, 6, 19], checkOut: [2026, 6, 23] },
                        { label: '26 a 30/07', checkIn: [2026, 6, 26], checkOut: [2026, 6, 30] },
                      ]
                    },
                    {
                      id: 'jul-2',
                      name: 'Solarize-se: O Verão de Salinas',
                      dates: '09 a 12 de Julho',
                      checkIn: [2026, 6, 9],
                      checkOut: [2026, 6, 12],
                      img: '/salinas_july_2_1768572303926.png',
                      discount: '10',
                      description: 'Sinta a verdadeira energia do Sol de Salinas. Uma semana dedicada ao bem-estar e à conexão total com a natureza e quem você ama.',
                      programming: ['Oficinas Criativas', 'Check-in Animado', 'Recreação Infantil']
                    },
                    {
                      id: 'jul-3',
                      name: 'O Auge do Verão: Parte 1',
                      dates: '16 a 19 de Julho',
                      checkIn: [2026, 6, 16],
                      checkOut: [2026, 6, 19],
                      img: '/salinas_july_3_1768572318354.png',
                      discount: '20',
                      description: 'O pico da temporada chegou! Viva o hotel em sua capacidade máxima de alegria, com eventos exclusivos e o melhor da nossa gastronomia regional.',
                      programming: ['Noite Paraense', 'Gincana na Piscina', 'Sunset com DJ']
                    },
                    {
                      id: 'jul-4',
                      name: 'O Auge do Verão: Parte 2',
                      dates: '23 a 26 de Julho',
                      checkIn: [2026, 6, 23],
                      checkOut: [2026, 6, 26],
                      img: '/salinas_july_4_1768572334776.png',
                      discount: '15',
                      description: 'A vibração máxima de Salinas continua. Atividades intensas para todas as idades criam memórias inesquecíveis à beira-mar.',
                      programming: ['Luau de Verão', 'Show de Talentos', 'Beach Tennis']
                    },
                    {
                      id: 'jul-5',
                      name: 'Bye Bye July: A Saideira',
                      dates: '30/07 a 02 de Agosto',
                      checkIn: [2026, 6, 30],
                      checkOut: [2026, 7, 2],
                      img: '/bye-bye-july.jpg',
                      discount: '25',
                      description: 'A despedida em grande estilo que Salinas merece. Aproveite os últimos momentos do mês com condições especiais e muita diversão.',
                      programming: ['Baile de Despedida', 'Fotos em Família', 'Personagens Infantis']
                    },
                  ].map((item: any) => (
                    <div key={item.id} className={`group flex flex-col md:flex-row rounded-[2.5rem] overflow-hidden shadow-2xl border transition-all hover:-translate-y-1 ${item.isPromotional ? 'bg-orange-50/50 border-orange-200 shadow-orange-900/10' : 'bg-white border-white/10 shadow-solar-gold/20'}`}>
                      {/* Lado da Imagem */}
                      <div className="md:w-2/5 h-[300px] md:h-auto relative overflow-hidden">
                        <img src={getPublicImageUrl(item.imageUrl || item.img)} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" alt={item.name} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent md:hidden"></div>
                        <div className={`absolute top-6 left-6 text-white text-[10px] font-black px-3 py-1.5 rounded-full shadow-2xl animate-pulse ${item.isPromotional ? 'bg-orange-600' : 'bg-red-600'}`}>
                          {item.fullPeriodDiscountPct || item.discount || 0}% OFF
                        </div>
                        {item.isPromotional && (
                          <div className="absolute bottom-6 left-6 bg-white/90 backdrop-blur-md px-4 py-2 rounded-xl border border-orange-200 shadow-xl hidden md:block">
                            <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest">Oferta Exclusiva Mid-Week</p>
                            <p className="text-xs font-bold text-slate-700">Jantar Cortesia Incluso</p>
                          </div>
                        )}
                      </div>

                      {/* Lado do Conteúdo */}
                      <div className="md:w-3/5 p-8 md:p-12 flex flex-col justify-center space-y-8">
                        <div className="space-y-4">
                          {/* DESTAQUE PARA A DATA */}
                          <div className={`inline-flex items-center gap-3 px-6 py-2.5 rounded-full shadow-lg transform -rotate-1 group-hover:rotate-0 transition-transform duration-500 ${item.isPromotional ? 'bg-orange-600 text-white' : 'bg-solar-gold text-solar-green'}`}>
                            <CalendarDays size={20} className="animate-pulse" />
                            <span className="text-xs md:text-sm font-black uppercase tracking-[0.15em]">
                              {item.id === 'jul-family' ? 'Escolha sua Semana' : (item.dates || `${formatDisplayDate(item.startIsoDate)} a ${formatDisplayDate(item.endIsoDate)}`)}
                            </span>
                          </div>

                          <div className="space-y-2">
                            {item.isPromotional && <span className="text-[10px] font-black text-orange-600 uppercase tracking-[0.3em]">Melhor Valor de Julho</span>}
                            <h3 className="text-3xl md:text-5xl font-serif text-solar-green leading-tight">{item.name}</h3>
                          </div>
                        </div>

                        <p className="text-slate-500 leading-relaxed text-lg italic">
                          "{item.description}"
                        </p>

                        {/* BOTÕES DE SELEÇÃO DE SEMANA (PARA O PACOTE FAMÍLIA) */}
                        {(item.id === 'jul-family' || item.weeks) && (
                          <div className="space-y-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-orange-600">Selecione o período desejado:</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 relative z-20">
                              {(item.weeks || [
                                { label: '05 a 09/07', checkIn: [2026, 6, 5], checkOut: [2026, 6, 9] },
                                { label: '12 a 16/07', checkIn: [2026, 6, 12], checkOut: [2026, 6, 16] },
                                { label: '19 a 23/07', checkIn: [2026, 6, 19], checkOut: [2026, 6, 23] },
                                { label: '26 a 30/07', checkIn: [2026, 6, 26], checkOut: [2026, 6, 30] },
                              ]).map((week: any) => {
                                const weekCheckIn = week.checkIn instanceof Date ? week.checkIn : new Date(week.checkIn[0], week.checkIn[1], week.checkIn[2]);
                                const weekCheckOut = week.checkOut instanceof Date ? week.checkOut : new Date(week.checkOut[0], week.checkOut[1], week.checkOut[2]);

                                const isCurrentWeek = checkIn && checkOut &&
                                  toLocalISO(checkIn) === toLocalISO(weekCheckIn) &&
                                  toLocalISO(checkOut) === toLocalISO(weekCheckOut);

                                return (
                                  <button
                                    key={week.label}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setCheckIn(weekCheckIn);
                                      setCheckOut(weekCheckOut);
                                      setCurrentCalendarDate(weekCheckIn);
                                      // Pequeno atraso para o React renderizar o componente
                                      setTimeout(() => {
                                        const element = document.getElementById('quartos-section');
                                        if (element) {
                                          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        }
                                      }, 150);
                                    }}
                                    className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 cursor-pointer active:scale-95 z-30 ${isCurrentWeek
                                      ? 'bg-orange-600 border-orange-600 text-white shadow-lg'
                                      : 'bg-white border-orange-100 text-orange-600 hover:border-orange-600 hover:bg-orange-50 shadow-sm'
                                      }`}
                                  >
                                    <span className="text-[9px] font-black uppercase tracking-tighter">Semana</span>
                                    <span className="text-xs font-bold whitespace-nowrap font-sans">{week.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="space-y-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Destaques da Experiência:</p>
                          <div className="flex flex-wrap gap-2">
                            {(item.programming || item.includes || []).map((prog: string) => (
                              <span key={prog} className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border ${item.isPromotional ? 'bg-orange-100/50 border-orange-200 text-orange-700' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${item.isPromotional ? 'bg-orange-500' : 'bg-solar-gold'}`}></div>
                                {prog}
                              </span>
                            ))}
                          </div>
                        </div>

                        {!item.weeks && item.id !== 'jul-family' && (
                          <div className="pt-6 flex flex-col md:flex-row items-center gap-6">
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const ci = item.startIsoDate ? parseISODate(item.startIsoDate) : new Date(item.checkIn[0], item.checkIn[1], item.checkIn[2]);
                                const co = item.endIsoDate ? parseISODate(item.endIsoDate) : new Date(item.checkOut[0], item.checkOut[1], item.checkOut[2]);
                                setCheckIn(ci);
                                setCheckOut(co);
                                setCurrentCalendarDate(ci);
                                // Pequeno atraso para o React renderizar o componente
                                setTimeout(() => {
                                  const element = document.getElementById('quartos-section');
                                  if (element) {
                                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                  }
                                }, 150);
                              }}
                              className={`w-full md:w-auto px-10 py-5 text-white rounded-2xl font-bold uppercase text-xs tracking-[0.2em] transition-all shadow-xl active:scale-95 cursor-pointer z-30 ${item.isPromotional ? 'bg-orange-600 hover:bg-orange-700 shadow-orange-900/20' : 'bg-solar-green hover:bg-solar-gold shadow-solar-green/20'}`}
                            >
                              Ver Disponibilidade
                            </button>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              {item.isPromotional ? '*Válido apenas dom a qui' : '*Vagas limitadas'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

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
                onUpsertRooms={upsertRooms}
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
        <img src="/logo.png" alt="Hotel Solar" className="h-24 md:h-32 w-auto mx-auto mb-8 drop-shadow-lg" />
        <p className="text-sm opacity-50 tracking-widest mb-12">Av. Atlântica • Salinópolis - PA<br />Tel: (91) 98100-0800</p>
        <button onClick={() => setCurrentView(ViewState.ADMIN)} className="text-[10px] font-bold uppercase tracking-[0.4em] opacity-30 hover:opacity-100 transition-all hover:text-solar-gold">Painel Gestão</button>
      </footer>
    </div >
  );
};