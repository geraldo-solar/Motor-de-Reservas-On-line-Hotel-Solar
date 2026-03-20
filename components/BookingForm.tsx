import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Users, ArrowRight, CheckCircle, Tag, Lock, ShoppingBag, CreditCard, MessageSquare, QrCode, Copy, User, Mail, Phone, FileText, ChevronLeft, ShieldCheck, BedDouble, Trash2, Plus, Minus, AlertCircle, ChevronDown, ChevronUp, Layers, Loader2 } from 'lucide-react';
import { Room, DiscountCode, ExtraService, Reservation, HolidayPackage } from '../types';
import { toLocalISO } from '../utils/dateUtils';
import { getPublicImageUrl } from '../utils/imageUtils';
import { validateDiscount } from '../utils/pricingRules';

interface BookingFormProps {
  selectedRooms: Room[];
  discountCodes: DiscountCode[];
  extras: ExtraService[];
  activePackage?: HolidayPackage | null;
  initialCheckIn?: Date | null;
  initialCheckOut?: Date | null;
  onRemoveRoom: (index: number) => void;
  onAddReservation: (reservation: Reservation) => Promise<boolean>;
  onBack: () => void;
  isSaving?: boolean;
  submissionError?: string | null;
  draftPayload?: any;
}

const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validateCPF = (cpf: string) => cpf.replace(/\D/g, '').length === 11;

const isValidLuhn = (number: string) => {
  const digits = number.replace(/\s/g, '').split('').map(Number);
  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = digits[i];
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  return sum % 10 === 0;
};

const isValidExpiry = (expiry: string) => {
  if (!/^\d{2}\/\d{2}$/.test(expiry)) return false;
  const [month, year] = expiry.split('/').map(Number);
  if (month < 1 || month > 12) return false;

  const now = new Date();
  const currentYear = now.getFullYear() % 100;
  const currentMonth = now.getMonth() + 1;

  if (year < currentYear) return false;
  if (year === currentYear && month < currentMonth) return false;
  return true;
};

const maskCardNumber = (value: string) => {
  return value.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ').substring(0, 19);
};

const maskExpiry = (value: string) => {
  return value.replace(/\D/g, '').replace(/(\d{2})(?=\d)/g, '$1/').substring(0, 5);
};

const BookingForm: React.FC<BookingFormProps> = ({
  selectedRooms,
  discountCodes,
  extras,
  activePackage,
  initialCheckIn,
  initialCheckOut,
  onRemoveRoom,
  onAddReservation,
  onBack,
  isSaving = false,
  submissionError = null,
  draftPayload = null
}) => {
  const [step, setStep] = useState(1);
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; amount: number } | null>(null);
  const [selectedExtras, setSelectedExtras] = useState<{ [key: string]: number }>({});
  const [observations, setObservations] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CREDIT_CARD'>('PIX');

  // Controle de Hóspedes Adicionais (Por Quarto)
  const [additionalGuests, setAdditionalGuests] = useState<{name: string, age: string, roomId: string, roomName: string}[]>([]);

  const [cardHolder, setCardHolder] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [installments, setInstallments] = useState(1);

  const [showPolicies, setShowPolicies] = useState(false);
  const [agreedToPolicies, setAgreedToPolicies] = useState(false);

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // ID persistente para evitar duplicidade em caso de retentativa/instabilidade de rede
  const [persistentId] = useState(() => {
    return draftPayload?.id || ((typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : 'RES-' + Math.random().toString(36).substring(2, 9).toUpperCase());
  });

  const formTopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (draftPayload) {
      setName(draftPayload.mainGuest?.name || '');
      setEmail(draftPayload.mainGuest?.email || '');
      setPhone(draftPayload.mainGuest?.phone || '');
      setCpf(draftPayload.mainGuest?.cpf || '');
      if (draftPayload.additionalGuests) {
        setAdditionalGuests(draftPayload.additionalGuests);
      }
      setPaymentMethod('CREDIT_CARD');
      if (draftPayload.observations) {
        setObservations(draftPayload.observations);
      }
      setStep(2);

      setTimeout(() => {
        formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 500);
    }
  }, [draftPayload]);

  const nights = initialCheckIn && initialCheckOut
    ? Math.max(1, Math.ceil((initialCheckOut.getTime() - initialCheckIn.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  const calculateRoomTotal = (room: Room) => {
    if (activePackage) {
      const pkgPrice = activePackage.roomPrices.find(rp => rp.roomId === room.id);
      if (pkgPrice && pkgPrice.price > 0) return pkgPrice.price;
    }

    if (!initialCheckIn || !initialCheckOut) return room.price;

    let total = 0;
    let tempDate = new Date(initialCheckIn);
    const endDate = new Date(initialCheckOut);
    while (tempDate < endDate) {
      const iso = tempDate.toISOString().split('T')[0];
      const override = room.overrides?.find(o => o.dateIso === iso);
      let dailyPrice = override?.price !== undefined ? override.price : room.price;
      if (override?.price === undefined) {
        const day = tempDate.getDay();
        if (day === 5 || day === 6) dailyPrice *= 1.15;
      }
      total += dailyPrice;
      tempDate.setDate(tempDate.getDate() + 1);
    }
    return Math.round(total);
  };

  const accommodationTotal = selectedRooms.reduce((acc, room) => acc + calculateRoomTotal(room), 0);
  const extrasTotal = Object.entries(selectedExtras).reduce((acc, [id, qty]) => {
    const extra = extras.find(e => e.id === id);
    return acc + (extra ? extra.price * (qty as number) : 0);
  }, 0);

  const isFullPackagePeriod = activePackage && initialCheckIn && initialCheckOut &&
    toLocalISO(initialCheckIn) === activePackage.startIsoDate &&
    toLocalISO(initialCheckOut) === activePackage.endIsoDate;

  const packageDiscountAmount = isFullPackagePeriod && activePackage.fullPeriodDiscountPct
    ? Math.round((accommodationTotal * activePackage.fullPeriodDiscountPct) / 100)
    : 0;

  const subtotal = accommodationTotal + extrasTotal;
  const total = subtotal - (appliedDiscount?.amount || 0) - packageDiscountAmount;

  const handleApplyDiscount = () => {
    const code = discountCode.toUpperCase().trim();
    if (!code) return;
    const discount = discountCodes.find(d => d.code === code && d.active);

    if (!discount) {
      alert('Cupom inválido ou expirado.');
      setAppliedDiscount(null);
      return;
    }

    const validation = validateDiscount(
      discount,
      accommodationTotal, // Subtotal checks against room total usually
      initialCheckIn || null,
      initialCheckOut || null,
      selectedRooms
    );

    if (!validation.isValid) {
      alert(validation.error || 'Cupom inválido para esta reserva.');
      setAppliedDiscount(null);
      return;
    }

    setAppliedDiscount({ code: discount.code, amount: validation.discountAmount });
  };

  const isSubmittingRef = useRef(false);

  const handleFinalSubmit = async () => {
    if (isSubmittingRef.current) return;
    try {
      if (!agreedToPolicies) return;
      isSubmittingRef.current = true;

      const newErrors: { [key: string]: string } = {};
      if (!name.trim()) newErrors.name = 'O nome completo é obrigatório';
      if (!validateEmail(email)) newErrors.email = 'Insira um e-mail válido';
      if (!validateCPF(cpf)) newErrors.cpf = 'CPF inválido (11 dígitos)';
      if (!phone.trim()) newErrors.phone = 'O WhatsApp é obrigatório';

      if (paymentMethod === 'CREDIT_CARD') {
        const cleanCard = cardNumber.replace(/\s/g, '');
        if (!cardHolder.trim()) newErrors.cardHolder = 'Nome impresso é obrigatório';

        if (cleanCard.length < 13 || !isValidLuhn(cleanCard)) {
          newErrors.cardNumber = 'Número de cartão inválido';
        }

        if (!isValidExpiry(cardExpiry)) {
          newErrors.cardExpiry = 'Data de expiração inválida ou vencida';
        }

        if (cardCvv.length < 3) {
          newErrors.cardCvv = 'CVV inválido';
        }
      }

      // Validação dos Hóspedes Extras
      additionalGuests.forEach((guest, index) => {
        if (!guest.name.trim()) {
           newErrors[`guest_${index}`] = 'Nome do acompanhante é obrigatório';
        }
      });

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        isSubmittingRef.current = false;
        if (formTopRef.current) {
          formTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }

      const reservation: Reservation = {
        id: persistentId,
        createdAt: new Date(),
        checkIn: initialCheckIn ? toLocalISO(initialCheckIn) : '',
        checkOut: initialCheckOut ? toLocalISO(initialCheckOut) : '',
        nights,
        mainGuest: { name, email, phone, cpf },
        additionalGuests: additionalGuests.map(g => ({ name: g.name, cpf: '', age: g.age, roomId: g.roomId, roomName: g.roomName })),
        observations,
        rooms: selectedRooms.map(r => ({ id: r.id, name: r.name, priceSnapshot: calculateRoomTotal(r) })),
        extras: Object.entries(selectedExtras).map(([id, qty]) => {
          const extra = extras.find(e => e.id === id);
          return { name: extra?.name || id, quantity: qty as number, priceSnapshot: extra?.price || 0 };
        }),
        totalPrice: total,
        discountApplied: appliedDiscount || undefined,
        packageDiscountApplied: packageDiscountAmount > 0 ? { percentage: activePackage!.fullPeriodDiscountPct!, amount: packageDiscountAmount } : undefined,
        paymentMethod,
        cardDetails: paymentMethod === 'CREDIT_CARD' ? {
          holderName: cardHolder,
          number: cardNumber,
          expiry: cardExpiry,
          cvv: cardCvv,
          installments: installments
        } : undefined,
        status: 'PENDING'
      };

      const success = await onAddReservation(reservation);
      if (!success) isSubmittingRef.current = false;
    } catch (err: any) {
      console.error('Erro na submissão da reserva:', err);
      isSubmittingRef.current = false;
    }
  };

  if (step === 1) {
    return (
      <div className="bg-white rounded shadow-2xl overflow-hidden border border-solar-gold animate-in fade-in slide-in-from-bottom-4">
        <div className="bg-solar-green text-white p-6 flex items-center gap-4">
          <button onClick={onBack} className="hover:text-solar-gold transition bg-white/10 p-2 rounded-full">
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 flex justify-between items-center">
            <h2 className="text-xl font-serif uppercase tracking-widest">Revisão da Reserva</h2>
            <span className="bg-solar-gold text-solar-green px-3 py-1 rounded-full text-[10px] font-bold">1 de 2</span>
          </div>
        </div>

        <div className="p-8 space-y-8">
          <div className="space-y-4">
            <h3 className="font-bold text-solar-green uppercase tracking-widest text-xs flex items-center gap-2"><BedDouble size={16} /> Acomodações Selecionadas</h3>
            {selectedRooms.map((room, index) => (
              <div key={index} className="flex justify-between items-center bg-slate-50 p-4 rounded border border-slate-100 shadow-sm">
                <div className="flex items-center gap-4">
                  <img src={getPublicImageUrl(room.imageUrls[0], 200)} className="w-16 h-16 rounded-lg object-cover border border-slate-200" alt={room.name} loading="lazy" decoding="async" />
                  <div>
                    <h4 className="font-bold text-solar-green text-sm">{room.name}</h4>
                    <p className="text-[10px] text-slate-400 uppercase font-bold">{nights} noites • {room.capacity} hóspedes</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-serif font-bold text-solar-green text-lg">R$ {calculateRoomTotal(room).toLocaleString('pt-BR')}</span>
                  <button onClick={() => onRemoveRoom(index)} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 size={18} /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-solar-green uppercase tracking-widest text-xs flex items-center gap-2">
                <ShoppingBag size={18} className="text-solar-gold" /> Turbine sua Experiência
              </h3>
              <span className="text-[10px] text-slate-400 font-bold uppercase">Serviços Extras</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {extras.filter(e => e.active).map(extra => (
                <div key={extra.id} className="bg-white rounded-xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-md transition-all group flex h-32 md:h-40 relative">
                  <div className="w-1/3 md:w-2/5 relative overflow-hidden shrink-0">
                    <img src={getPublicImageUrl(extra.imageUrl, 300)} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt={extra.name} loading="lazy" decoding="async" />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/10"></div>
                  </div>
                  <div className="flex-1 p-3 md:p-5 flex flex-col justify-between">
                    <div className="space-y-1">
                      <h4 className="font-bold text-solar-green text-xs md:text-sm uppercase tracking-tight">{extra.name}</h4>
                      <p className="text-[9px] md:text-[11px] text-slate-500 italic line-clamp-2 md:line-clamp-3">{extra.description}</p>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="font-bold text-solar-green text-xs md:text-base">R$ {extra.price.toLocaleString('pt-BR')}</span>
                      <div className="flex items-center bg-solar-green/5 rounded-lg p-1 border border-solar-green/10">
                        <button
                          onClick={() => setSelectedExtras(prev => ({ ...prev, [extra.id]: Math.max(0, (prev[extra.id] || 0) - 1) }))}
                          className="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center text-solar-green hover:bg-solar-green hover:text-white rounded-md transition-all"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-6 md:w-8 text-center font-bold text-xs md:sm text-solar-green">
                          {selectedExtras[extra.id] || 0}
                        </span>
                        <button
                          onClick={() => setSelectedExtras(prev => ({ ...prev, [extra.id]: (prev[extra.id] || 0) + 1 }))}
                          className="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center bg-solar-green text-white hover:bg-solar-gold rounded-md transition-all shadow-sm"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                  {(selectedExtras[extra.id] || 0) > 0 && (
                    <div className="absolute top-2 right-2 animate-in zoom-in">
                      <CheckCircle size={20} className="text-green-500 fill-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
            <div className="space-y-4">
              <h3 className="font-bold text-solar-green uppercase tracking-widest text-xs flex items-center gap-2"><Tag size={16} /> Cupom de Desconto</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={discountCode}
                  onChange={e => setDiscountCode(e.target.value)}
                  placeholder="Possui um cupom?"
                  className="flex-1 p-3 border border-slate-200 rounded uppercase text-sm outline-none focus:border-solar-gold bg-slate-50"
                />
                <button onClick={handleApplyDiscount} className="bg-solar-green text-white px-6 rounded font-bold uppercase text-[10px] tracking-widest hover:bg-solar-moss transition shadow-md">Validar</button>
              </div>
              {appliedDiscount && (
                <p className="text-xs text-green-600 font-bold flex items-center gap-1"><CheckCircle size={14} /> Desconto de {appliedDiscount.amount.toLocaleString('pt-BR')} aplicado com sucesso!</p>
              )}
            </div>
            <div className="bg-solar-green p-6 rounded-xl shadow-xl flex flex-col justify-center items-center text-white relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-solar-gold/10 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-150 duration-700"></div>
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-60 mb-1">Valor Total</span>
              <div className="font-serif text-3xl md:text-4xl font-bold text-solar-gold">R$ {total.toLocaleString('pt-BR')}</div>
              {packageDiscountAmount > 0 && (
                <div className="mt-2 text-[9px] font-bold bg-solar-gold/20 text-solar-gold px-2 py-1 rounded-full uppercase tracking-widest border border-solar-gold/30">
                  - R$ {packageDiscountAmount.toLocaleString('pt-BR')} (Pacote {activePackage?.fullPeriodDiscountPct}%)
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-bold text-solar-green uppercase tracking-widest text-xs flex items-center gap-2"><MessageSquare size={16} /> Observações</h3>
            <textarea
              value={observations}
              onChange={e => setObservations(e.target.value)}
              placeholder="Alguma observação ou pedido especial para sua reserva? (opcional)"
              className="w-full p-4 border border-slate-200 rounded-xl text-sm outline-none focus:border-solar-gold bg-slate-50 resize-none h-24"
              maxLength={500}
            />
            <p className="text-[10px] text-slate-400 text-right">{observations.length}/500 caracteres</p>
          </div>

          <button
            onClick={() => {
              setStep(2);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="w-full bg-solar-green text-white py-5 rounded-xl font-bold uppercase text-sm tracking-[0.2em] hover:bg-solar-gold hover:text-solar-green transition-all shadow-2xl flex items-center justify-center gap-3 group"
          >
            Ir para Pagamento <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={formTopRef} className="bg-white rounded shadow-2xl overflow-hidden border border-solar-gold animate-in slide-in-from-right-8 scroll-mt-24">
      <div className="bg-solar-green text-white p-6 flex items-center gap-4">
        <button onClick={() => setStep(1)} className="hover:text-solar-gold transition bg-white/10 p-2 rounded-full"><ChevronLeft size={20} /></button>
        <h2 className="text-xl font-serif uppercase tracking-widest">Seus Dados e Pagamento</h2>
      </div>

      <div className="p-8 space-y-8">
        {Object.keys(errors).length > 0 && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3 text-red-700">
              <AlertCircle size={20} />
              <span className="font-bold text-xs uppercase tracking-widest">Por favor, preencha todos os campos destacados corretamente.</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <label className={`text-[10px] font-bold uppercase tracking-widest mb-1 block ${errors.name ? 'text-red-500' : 'text-slate-400'}`}>Nome Completo</label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); if (errors.name) setErrors(prev => ({ ...prev, name: '' })) }}
              className={`w-full p-4 bg-slate-50 border rounded-lg outline-none transition-all text-sm shadow-inner ${errors.name ? 'border-red-500 ring-2 ring-red-100 bg-red-50/20' : 'border-slate-200 focus:border-solar-gold'}`}
              placeholder="Como no documento"
            />
            {errors.name && <span className="text-[9px] text-red-500 font-bold uppercase">{errors.name}</span>}
          </div>
          <div className="space-y-1">
            <label className={`text-[10px] font-bold uppercase tracking-widest mb-1 block ${errors.email ? 'text-red-500' : 'text-slate-400'}`}>E-mail</label>
            <input
              value={email}
              onChange={e => { setEmail(e.target.value); if (errors.email) setErrors(prev => ({ ...prev, email: '' })) }}
              className={`w-full p-4 bg-slate-50 border rounded-lg outline-none transition-all text-sm shadow-inner ${errors.email ? 'border-red-500 ring-2 ring-red-100 bg-red-50/20' : 'border-slate-200 focus:border-solar-gold'}`}
              placeholder="exemplo@email.com"
            />
            {errors.email && <span className="text-[9px] text-red-500 font-bold uppercase">{errors.email}</span>}
          </div>
          <div className="space-y-1">
            <label className={`text-[10px] font-bold uppercase tracking-widest mb-1 block ${errors.phone ? 'text-red-500' : 'text-slate-400'}`}>WhatsApp</label>
            <input
              value={phone}
              onChange={e => { setPhone(e.target.value); if (errors.phone) setErrors(prev => ({ ...prev, phone: '' })) }}
              className={`w-full p-4 bg-slate-50 border rounded-lg outline-none transition-all text-sm shadow-inner ${errors.phone ? 'border-red-500 ring-2 ring-red-100 bg-red-50/20' : 'border-slate-200 focus:border-solar-gold'}`}
              placeholder="(00) 00000-0000"
            />
            {errors.phone && <span className="text-[9px] text-red-500 font-bold uppercase">{errors.phone}</span>}
          </div>
          <div className="space-y-1">
            <label className={`text-[10px] font-bold uppercase tracking-widest mb-1 block ${errors.cpf ? 'text-red-500' : 'text-slate-400'}`}>CPF</label>
            <input
              value={cpf}
              onChange={e => { setCpf(e.target.value); if (errors.cpf) setErrors(prev => ({ ...prev, cpf: '' })) }}
              className={`w-full p-4 bg-slate-50 border rounded-lg outline-none transition-all text-sm shadow-inner ${errors.cpf ? 'border-red-500 ring-2 ring-red-100 bg-red-50/20' : 'border-slate-200 focus:border-solar-gold'}`}
              placeholder="000.000.000-00"
            />
            {errors.cpf && <span className="text-[9px] text-red-500 font-bold uppercase">{errors.cpf}</span>}
          </div>
        </div>

        {/* --- INÍCIO: Seção de Hóspedes Adicionais por Quarto --- */}
        <div className="space-y-4 pt-4 border-t border-slate-100 animate-in fade-in duration-500">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-solar-green uppercase tracking-widest text-xs flex items-center gap-2">
              <Users size={18} className="text-solar-gold" /> Acompanhantes (Por Quarto)
            </h3>
          </div>

          <div className="space-y-6">
            {selectedRooms.map((room) => {
              // Os hóspedes atrelados a ESTE quarto específico
              const roomGuests = additionalGuests.filter(g => g.roomId === room.id);
              // Lotação total disponível para preencher
              const maxCapacity = room.capacity;

              return (
                <div key={room.id} className="bg-slate-50/50 rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-100/80 p-3 border-b border-slate-200 flex items-center justify-between">
                    <span className="font-bold text-[11px] text-solar-green uppercase tracking-widest flex items-center gap-2">
                      <BedDouble size={14} className="text-solar-gold"/> {room.name}
                    </span>
                     <span className="text-[9px] font-bold bg-white text-slate-500 px-2 py-1 rounded-full uppercase tracking-widest border border-slate-200 shadow-sm">
                      Lotação: {roomGuests.length} de {maxCapacity}
                    </span>
                  </div>

                  <div className="p-4 space-y-3">
                    {roomGuests.map((guest, idx) => {
                      // Precisamos achar o indice real desse hospede no array principal de additionalGuests
                      // para não quebrar o setErrors e a lógica de edição.
                      const globalIndex = additionalGuests.findIndex(ag => ag === guest);

                      return (
                        <div key={globalIndex} className="flex gap-2 items-start bg-white p-3 rounded-xl border border-slate-200 relative animate-in slide-in-from-left-2 shadow-sm">
                          <div className="flex-1 space-y-1">
                            <label className={`text-[9px] font-bold uppercase tracking-widest block ${errors[`guest_${globalIndex}`] ? 'text-red-500' : 'text-slate-400'}`}>Nome do Acompanhante</label>
                            <input
                              value={guest.name}
                              onChange={e => {
                                const updated = [...additionalGuests];
                                updated[globalIndex].name = e.target.value.toUpperCase();
                                setAdditionalGuests(updated);
                                if (errors[`guest_${globalIndex}`]) {
                                  setErrors(prev => { const newErrors = { ...prev }; delete newErrors[`guest_${globalIndex}`]; return newErrors; });
                                }
                              }}
                              placeholder="Nome completo"
                              className={`w-full p-2 bg-slate-50 border rounded-lg outline-none text-xs uppercase ${errors[`guest_${globalIndex}`] ? 'border-red-500 ring-1 ring-red-100 bg-red-50/10' : 'focus:border-solar-gold border-slate-200'}`}
                            />
                            {errors[`guest_${globalIndex}`] && <span className="text-[9px] text-red-500 font-bold uppercase">{errors[`guest_${globalIndex}`]}</span>}
                          </div>

                          <div className="w-28 md:w-36 space-y-1">
                            <label className="text-[9px] font-bold uppercase tracking-widest block text-slate-400">Tipo</label>
                            <div className="relative">
                              <select
                                value={guest.age}
                                onChange={e => {
                                  const updated = [...additionalGuests];
                                  updated[globalIndex].age = e.target.value;
                                  setAdditionalGuests(updated);
                                }}
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-xs focus:border-solar-gold cursor-pointer appearance-none"
                              >
                                <option value="Adulto/Mais de 6 anos">Adulto (+6)</option>
                                <option value="Criança até 6 anos (Colo)">Criança (Colo)</option>
                              </select>
                              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                          </div>

                          <button
                            onClick={() => setAdditionalGuests(prev => prev.filter((_, i) => i !== globalIndex))}
                            className="mt-4 p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors border border-transparent hover:border-red-100 ml-1"
                            title="Remover acompanhante desta Suíte"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      );
                    })}

                    {roomGuests.length < maxCapacity && (
                      <button
                        onClick={() => setAdditionalGuests(prev => [...prev, { name: '', age: 'Adulto/Mais de 6 anos', roomId: room.id, roomName: room.name }])}
                        className="w-full py-3 border border-dashed border-slate-300 hover:border-solar-gold text-slate-400 hover:text-solar-gold rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 group bg-white hover:bg-solar-gold/5"
                      >
                        <Plus size={14} className="group-hover:scale-125 transition-transform" /> Adicionar na {room.name}
                      </button>
                    )}

                    {roomGuests.length === maxCapacity && (
                      <p className="text-[9px] text-slate-400 flex items-center gap-1 justify-center mt-2 uppercase tracking-widest"><CheckCircle size={10} className="text-green-500"/> Lotação máxima preenchida</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* --- FIM: Seção de Hóspedes Adicionais por Quarto --- */}

        <div className="space-y-4 pt-6 border-t border-slate-100">
          <h3 className="font-bold text-solar-green uppercase tracking-widest text-xs flex items-center gap-2"><CreditCard size={18} className="text-solar-gold" /> Escolha como pagar</h3>
          <div className="flex gap-4">
            <button onClick={() => setPaymentMethod('PIX')} className={`flex-1 p-6 rounded-xl border-2 flex flex-col items-center gap-3 transition-all ${paymentMethod === 'PIX' ? 'border-solar-gold bg-solar-gold/5 shadow-inner' : 'border-slate-100 text-slate-400 grayscale'}`}>
              <QrCode size={32} /> <span className="text-[11px] font-bold uppercase tracking-widest">PIX</span>
            </button>
            <button onClick={() => setPaymentMethod('CREDIT_CARD')} className={`flex-1 p-6 rounded-xl border-2 flex flex-col items-center gap-3 transition-all ${paymentMethod === 'CREDIT_CARD' ? 'border-solar-gold bg-solar-gold/5 shadow-inner' : 'border-slate-100 text-slate-400 grayscale'}`}>
              <CreditCard size={32} /> <span className="text-[11px] font-bold uppercase tracking-widest">Cartão de Crédito</span>
            </button>
          </div>

          {paymentMethod === 'CREDIT_CARD' && (
            <div className="space-y-6 bg-slate-50 p-6 rounded-xl border border-slate-200 animate-in slide-in-from-top-4">
              <div className="flex items-center gap-2 text-solar-green border-b border-slate-200 pb-2 mb-4">
                <ShieldCheck size={18} className="text-solar-gold" />
                <span className="font-bold uppercase tracking-widest text-[10px]">Ambiente Seguro</span>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className={`text-[9px] font-bold uppercase tracking-widest block ${errors.cardNumber ? 'text-red-500' : 'text-slate-400'}`}>Número do Cartão</label>
                  <input
                    value={cardNumber}
                    onChange={e => { setCardNumber(maskCardNumber(e.target.value)); if (errors.cardNumber) setErrors(prev => ({ ...prev, cardNumber: '' })) }}
                    className={`w-full p-4 bg-white border rounded-lg outline-none text-sm ${errors.cardNumber ? 'border-red-500 ring-1 ring-red-100 bg-red-50/10' : 'focus:border-solar-gold border-slate-200'}`}
                    placeholder="0000 0000 0000 0000"
                    maxLength={19}
                  />
                  {errors.cardNumber && <span className="text-[9px] text-red-500 font-bold uppercase">{errors.cardNumber}</span>}
                </div>

                <div className="space-y-1">
                  <label className={`text-[9px] font-bold uppercase tracking-widest block ${errors.cardHolder ? 'text-red-500' : 'text-slate-400'}`}>Nome Impresso no Cartão</label>
                  <input
                    value={cardHolder}
                    onChange={e => { setCardHolder(e.target.value.toUpperCase()); if (errors.cardHolder) setErrors(prev => ({ ...prev, cardHolder: '' })) }}
                    className={`w-full p-4 bg-white border rounded-lg outline-none text-sm uppercase ${errors.cardHolder ? 'border-red-500 ring-1 ring-red-100 bg-red-50/10' : 'focus:border-solar-gold border-slate-200'}`}
                    placeholder="COMO ESTÁ NO CARTÃO"
                  />
                  {errors.cardHolder && <span className="text-[9px] text-red-500 font-bold uppercase">{errors.cardHolder}</span>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className={`text-[9px] font-bold uppercase tracking-widest block ${errors.cardExpiry ? 'text-red-500' : 'text-slate-400'}`}>Validade (MM/AA)</label>
                    <input
                      value={cardExpiry}
                      onChange={e => { setCardExpiry(maskExpiry(e.target.value)); if (errors.cardExpiry) setErrors(prev => ({ ...prev, cardExpiry: '' })) }}
                      className={`w-full p-4 bg-white border rounded-lg outline-none text-sm ${errors.cardExpiry ? 'border-red-500 ring-1 ring-red-100 bg-red-50/10' : 'focus:border-solar-gold border-slate-200'}`}
                      placeholder="MM/AA"
                      maxLength={5}
                    />
                    {errors.cardExpiry && <span className="text-[9px] text-red-500 font-bold uppercase">{errors.cardExpiry}</span>}
                  </div>
                  <div className="space-y-1">
                    <label className={`text-[9px] font-bold uppercase tracking-widest block ${errors.cardCvv ? 'text-red-500' : 'text-slate-400'}`}>CVV</label>
                    <input
                      value={cardCvv}
                      onChange={e => { setCardCvv(e.target.value.replace(/\D/g, '').substring(0, 4)); if (errors.cardCvv) setErrors(prev => ({ ...prev, cardCvv: '' })) }}
                      className={`w-full p-4 bg-white border rounded-lg outline-none text-sm ${errors.cardCvv ? 'border-red-500 ring-1 ring-red-100 bg-red-50/10' : 'focus:border-solar-gold border-slate-200'}`}
                      placeholder="000"
                      maxLength={4}
                    />
                    {errors.cardCvv && <span className="text-[9px] text-red-500 font-bold uppercase">{errors.cardCvv}</span>}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase tracking-widest block text-slate-400">Parcelamento</label>
                  <div className="relative">
                    <Layers size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-solar-gold pointer-events-none" />
                    <select
                      value={installments}
                      onChange={e => setInstallments(Number(e.target.value))}
                      className="w-full p-4 pl-12 bg-white border border-slate-200 rounded-lg outline-none text-sm focus:border-solar-gold appearance-none cursor-pointer"
                    >
                      {[1, 2, 3, 4, 5, 6].map(num => (
                        <option key={num} value={num}>
                          {num}x de R$ {(total / num).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} sem juros
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4 border-t border-slate-100 pt-8 animate-in fade-in duration-500">
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setShowPolicies(!showPolicies)}
              className="flex items-center justify-between w-full p-4 bg-solar-gold/5 border border-solar-gold/20 rounded-xl hover:bg-solar-gold/10 transition-all text-solar-green group"
            >
              <div className="flex items-center gap-3">
                <FileText size={20} className="text-solar-gold" />
                <span className="text-xs md:text-sm font-bold uppercase tracking-widest">Políticas de Reserva e Cancelamento</span>
              </div>
              {showPolicies ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>

            {showPolicies && (
              <div className="p-5 bg-white border border-slate-100 rounded-xl text-[11px] md:text-[13px] text-slate-600 space-y-4 shadow-inner max-h-64 overflow-y-auto animate-in slide-in-from-top-2 duration-300 custom-scrollbar">
                <p className="font-bold text-solar-green text-center">🌞 POLÍTICA DE RESERVAS, CANCELAMENTO E REGRAS DE ESTADA</p>
                <p className="text-center italic">Hotel Solar – Salinópolis (PA)</p>

                <p className="font-bold text-solar-gold">🕑 HORÁRIOS & CONDIÇÕES</p>
                <p><strong>Check-in:</strong> a partir das 14h | <strong>Check-out:</strong> até as 12h</p>
                <p><strong>Early Check-in:</strong> Mediante disponibilidade, meia diária a partir das 06h. Antes: diária inteira.</p>
                <p><strong>Late Check-out:</strong> Até 18h: meia diária. Após: diária inteira.</p>
                <p className="text-solar-gold">🔔 O saldo restante (50%) deverá ser quitado no check-in.</p>

                <p className="font-bold text-solar-gold">❌ CANCELAMENTO E NO-SHOW</p>
                <p><strong>No-show:</strong> Não comparecimento sem comunicação prévia será considerado no-show. A reserva ficará disponível por 24h. Após, será cancelada com retenção de 100% do valor.</p>
                <p><strong>Desistência/Saída antecipada:</strong> Não dá direito a reembolso ou crédito.</p>

                <p className="font-bold text-solar-gold">👨‍👩‍👧 CRIANÇAS</p>
                <p>Crianças até 6 anos são free (1 por apartamento). Comprovação de parentesco obrigatória.</p>

                <p className="font-bold text-solar-gold">🍽️ ALIMENTAÇÃO</p>
                <p>Café da manhã: cortesia das 07h às 10h. Demais refeições à la carte.</p>

                <p className="font-bold text-solar-gold">🐾 PETS</p>
                <p>🚫 Não aceitamos animais de estimação.</p>

                <p className="font-bold text-solar-gold">🔊 CONVIVÊNCIA</p>
                <p>Não é permitido caixas de som portáteis. Piscinas: 10h às 22h.</p>

                <p className="font-bold text-solar-gold">🧾 TAXAS</p>
                <p>Taxa de serviço de 10% destinada aos colaboradores. Taxa de rolha para consumo externo.</p>

                <p className="font-bold text-solar-gold">🔑 CHAVE</p>
                <p>Devolução obrigatória na recepção. Perda: R$ 100,00.</p>

                <p className="italic text-center">✨ Desejamos uma excelente estada!</p>
              </div>
            )}

            <label className={`flex items-start gap-3 p-4 rounded-xl cursor-pointer transition-all border-2 ${agreedToPolicies ? 'bg-solar-green/5 border-solar-green/20 shadow-sm' : 'bg-slate-50 border-transparent hover:bg-slate-100'}`}>
              <input
                type="checkbox"
                checked={agreedToPolicies}
                onChange={(e) => setAgreedToPolicies(e.target.checked)}
                className="mt-1 w-5 h-5 rounded border-slate-300 text-solar-green focus:ring-solar-gold"
              />
              <div className="flex-1 select-none">
                <p className="text-xs md:text-sm font-bold text-solar-green tracking-tight">Li e aceito as políticas de reserva e cancelamento do Hotel Solar.</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Clique para liberar o botão de finalização.</p>
              </div>
            </label>
          </div>
        </div>

        {submissionError && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 p-5 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="shrink-0 mt-0.5" size={20} />
            <div className="space-y-1">
              <p className="text-sm font-bold">Não foi possível concluir a reserva</p>
              <p className="text-xs opacity-80 leading-relaxed text-left">{submissionError}</p>
            </div>
          </div>
        )}

        <button
          onClick={handleFinalSubmit}
          disabled={!agreedToPolicies || isSaving}
          className={`w-full py-5 rounded-xl font-bold uppercase text-sm tracking-[0.3em] transition-all shadow-2xl flex items-center justify-center gap-3 ${agreedToPolicies && !isSaving
            ? 'bg-solar-green text-white hover:bg-solar-gold hover:text-solar-green'
            : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
            }`}
        >
          {isSaving ? (
            <>
              <Loader2 className="animate-spin" size={24} /> Processando...
            </>
          ) : (
            <>
              <ShieldCheck size={24} /> Finalizar Reserva Agora
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default BookingForm;