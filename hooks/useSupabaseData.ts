import { useState, useEffect, useCallback, useRef } from 'react';
import { Room, HolidayPackage, DiscountCode, ExtraService, Reservation } from '../types';
import { supabase } from '../lib/supabase';
import { getPublicImageUrl } from '../utils/imageUtils';
import { toLocalISO, parseISODate } from '../utils/dateUtils';

// Chaves para localStorage (cache)
const STORAGE_KEYS = {
  rooms: 'hotel_solar_rooms',
  packages: 'hotel_solar_packages',
  discounts: 'hotel_solar_discounts',
  extras: 'hotel_solar_extras',
  reservations: 'hotel_solar_reservations',
  lastUpdate: 'hotel_solar_last_update',
};

// Tempo de cache em milissegundos (2 minutos para ser mais fresco)
const CACHE_DURATION = 2 * 60 * 1000;

// Timeout para requisições (15 segundos)
const REQUEST_TIMEOUT = 15000;

// Função para carregar dados do localStorage (cache)
const loadFromStorage = <T>(key: string, defaultValue: T): T => {
  try {
    if (typeof window === 'undefined') return defaultValue;
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error(`[Storage] Erro ao carregar ${key}:`, error);
  }
  return defaultValue;
};

// Função para salvar dados no localStorage (cache)
const saveToStorage = <T>(key: string, data: T): void => {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error(`[Storage] Erro ao salvar ${key}:`, error);
  }
};

// Wrapper para adicionar timeout às requisições
const fetchWithTimeout = async <T>(
  promise: Promise<{ data: T | null; error: any }>,
  timeout: number = REQUEST_TIMEOUT
): Promise<{ data: T | null; error: any }> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const result = await promise;
    clearTimeout(id);
    return result;
  } catch (error) {
    clearTimeout(id);
    return { data: null, error };
  }
};

export const useSupabaseData = () => {
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rooms, setRoomsState] = useState<Room[]>([]);
  const [packages, setPackagesState] = useState<HolidayPackage[]>([]);
  const [discounts, setDiscountsState] = useState<DiscountCode[]>([]);
  const [extras, setExtrasState] = useState<ExtraService[]>([]);
  const [reservations, setReservationsState] = useState<Reservation[]>([]);

  // Refs para evitar loops infinitos se usarmos os estados em dependências
  const roomsRef = useRef(rooms);
  useEffect(() => { roomsRef.current = rooms; }, [rooms]);

  // Função para mapear dados do Supabase para o formato da aplicação

  const mapRooms = (data: any[]): Room[] => data.map((r: any) => ({
    id: r.id,
    name: r.name,
    description: r.description || '',
    price: r.base_price || r.price || 0,
    capacity: r.capacity || 2,
    imageUrls: (r.images || r.image_urls || r.imageUrls || []).map(getPublicImageUrl),
    address: r.address || '',
    features: r.amenities || r.features || [],
    totalQuantity: r.total_quantity || r.totalQuantity || 1,
    active: r.active !== false,
    overrides: r.overrides || [],
  }));

  const mapPackages = (data: any[]): HolidayPackage[] => data.map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description || '',
    imageUrl: getPublicImageUrl(p.image_url || p.imageUrl || ''),
    location: p.location || '',
    includes: p.includes || [],
    benefits: p.benefits || p.includes || [],
    active: p.active !== false,
    startIsoDate: p.start_iso_date || p.start_date || p.startIsoDate || '',
    endIsoDate: p.end_iso_date || p.end_date || p.endIsoDate || '',
    roomPrices: p.room_prices || p.roomPrices || [],
    noCheckoutDates: p.no_checkout_dates || p.noCheckoutDates || [],
    noCheckInDates: p.no_checkin_dates || p.noCheckInDates || [],
    fullPeriodDiscountPct: p.full_period_discount_pct || p.fullPeriodDiscountPct || 0,
  }));

  const mapReservations = (data: any[]): Reservation[] => data.map((r: any) => ({
    id: r.id,
    createdAt: new Date(r.created_at || r.createdAt),
    checkIn: r.check_in || r.checkIn || '',
    checkOut: r.check_out || r.checkOut || '',
    nights: r.nights || 1,
    mainGuest: r.main_guest || r.mainGuest || { name: '', cpf: '' },
    additionalGuests: r.additional_guests || r.additionalGuests || [],
    observations: r.observations || '',
    rooms: r.rooms || [],
    extras: r.extras || [],
    totalPrice: r.total_price || r.totalPrice || 0,
    discountApplied: r.discount_applied || r.discountApplied,
    paymentMethod: r.payment_method || r.paymentMethod || 'PIX',
    cardDetails: r.card_details || r.cardDetails,
    status: r.status || 'PENDING',
    cancellationReason: r.cancellation_reason || r.cancellationReason,
    packageDiscountApplied: r.package_discount_applied || r.packageDiscountApplied,
  }));

  const mapExtras = (data: any[]): ExtraService[] => data.map((e: any) => ({
    id: e.id,
    name: e.name,
    description: e.description || '',
    price: e.price || 0,
    imageUrl: e.image_url || e.imageUrl || '',
    active: e.active !== false,
  }));

  const mapDiscounts = (data: any[]): DiscountCode[] => data.map((d: any) => ({
    code: d.code,
    percentage: d.percentage || 0,
    active: d.active !== false,
    startDate: d.start_date || d.startDate || '',
    endDate: d.end_date || d.endDate || '',
    minNights: d.min_nights || d.minNights || 1,
    fullPeriodRequired: d.full_period_required || d.fullPeriodRequired || false,
  }));

  // Carregar dados do Supabase com resiliência
  const loadFromSupabase = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      console.log('[Supabase] Iniciando sincronização...');

      // Adicionar um timeout menor para a consulta inicial para não travar o site
      const fetchPromise = Promise.all([
        supabase.from('room_types').select('*').order('name'),
        supabase.from('packages').select('*'),
        supabase.from('reservations').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('extras').select('*'),
        supabase.from('discount_codes').select('*'),
      ]);

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('FETCH_TIMEOUT')), 8000)
      );

      const [rRes, pRes, resRes, eRes, dRes] = await Promise.race([
        fetchPromise,
        timeoutPromise
      ]) as any;

      // Verificamos erros individuais. Se for erro de quota (429 ou similar), usamos o cache.
      const hasQuotaError = [rRes, pRes, resRes, eRes, dRes].some(res =>
        res.error && (res.error.status === 429 || res.error.status === 403 || res.error.message?.includes('quota'))
      );

      if (hasQuotaError) {
        console.warn('[Supabase] Limite de cota atingido (Egress). Usando dados do cache local.');
        return false;
      }

      // Se chegamos aqui, processamos os dados normalmente...
      if (rRes.data && rRes.data.length > 0) {
        const mapped = mapRooms(rRes.data);
        setRoomsState(mapped);
        saveToStorage(STORAGE_KEYS.rooms, mapped);
      }

      if (pRes.data && pRes.data.length > 0) {
        const mapped = mapPackages(pRes.data);
        setPackagesState(mapped);
        saveToStorage(STORAGE_KEYS.packages, mapped);
      }

      if (resRes.data) {
        const mapped = mapReservations(resRes.data);
        setReservationsState(mapped);
        saveToStorage(STORAGE_KEYS.reservations, mapped);
      }

      if (eRes.data && eRes.data.length > 0) {
        const mapped = mapExtras(eRes.data);
        setExtrasState(mapped);
        saveToStorage(STORAGE_KEYS.extras, mapped);
      }

      if (dRes.data && dRes.data.length > 0) {
        const mapped = mapDiscounts(dRes.data);
        setDiscountsState(mapped);
        saveToStorage(STORAGE_KEYS.discounts, mapped);
      }

      setIsConnected(true);
      return true;
    } catch (err: any) {
      if (err.message === 'FETCH_TIMEOUT') {
        console.warn('[Supabase] Tempo de sincronização esgotado (provável limite de Egress). Mantendo dados locais.');
      } else {
        console.error('[Supabase] Erro ao carregar dados:', err);
      }
      return false;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [packages.length, extras.length]);

  // Inicialização
  useEffect(() => {
    const init = async () => {
      const cachedRooms = loadFromStorage(STORAGE_KEYS.rooms, [] as Room[]);
      if (cachedRooms.length > 0) {
        setRoomsState(cachedRooms);
        setPackagesState(loadFromStorage(STORAGE_KEYS.packages, []));
        setDiscountsState(loadFromStorage(STORAGE_KEYS.discounts, []));
        setExtrasState(loadFromStorage(STORAGE_KEYS.extras, []));
        setReservationsState(loadFromStorage(STORAGE_KEYS.reservations, []));
        setLoading(false);
      }
      await loadFromSupabase(cachedRooms.length > 0);
    };
    init();
  }, [loadFromSupabase]);

  // --- FUNÇÕES DE SALVAMENTO ---

  const upsertRoom = async (room: Room) => {
    setIsSaving(true);
    try {
      const dataToSave = {
        id: room.id,
        name: room.name,
        description: room.description || '',
        base_price: room.price || 0,
        capacity: room.capacity || 2,
        images: room.imageUrls || [],
        address: room.address || '',
        amenities: room.features || [],
        total_quantity: room.totalQuantity || 1,
        active: room.active !== false,
        overrides: room.overrides || [],
      };

      const { error } = await supabase.from('room_types').upsert(dataToSave);
      if (error) throw error;

      setRoomsState(prev => {
        const index = prev.findIndex(r => r.id === room.id);
        const updated = index >= 0 ? prev.map((r, i) => i === index ? room : r) : [...prev, room];
        saveToStorage(STORAGE_KEYS.rooms, updated);
        return updated;
      });
      return true;
    } catch (err) {
      console.error('Erro ao salvar quarto:', err);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const deleteRoom = async (roomId: string) => {
    setIsSaving(true);
    try {
      const { error } = await supabase.from('room_types').delete().eq('id', roomId);
      if (error) throw error;
      setRoomsState(prev => {
        const updated = prev.filter(r => r.id !== roomId);
        saveToStorage(STORAGE_KEYS.rooms, updated);
        return updated;
      });
      return true;
    } catch (err: any) {
      console.error('Erro ao deletar quarto:', err);
      alert('Não foi possível excluir a acomodação: ' + (err.message || err));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const upsertPackage = async (pkg: HolidayPackage) => {
    setIsSaving(true);
    try {
      const dataToSave = {
        id: pkg.id,
        name: pkg.name,
        description: pkg.description,
        image_url: pkg.imageUrl,
        location: pkg.location,
        includes: pkg.includes || [],
        active: pkg.active !== false,
        start_date: pkg.startIsoDate,
        end_date: pkg.endIsoDate,
        start_iso_date: pkg.startIsoDate,
        end_iso_date: pkg.endIsoDate,
        room_prices: pkg.roomPrices || [],
        no_checkout_dates: pkg.noCheckoutDates || [],
        no_checkin_dates: pkg.noCheckInDates || [],
        full_period_discount_pct: pkg.fullPeriodDiscountPct || 0,
      };

      const { error } = await supabase.from('packages').upsert(dataToSave);
      if (error) throw error;

      setPackagesState(prev => {
        const index = prev.findIndex(p => p.id === pkg.id);
        const updated = index >= 0 ? prev.map((p, i) => i === index ? pkg : p) : [...prev, pkg];
        saveToStorage(STORAGE_KEYS.packages, updated);
        return updated;
      });
      return true;
    } catch (err: any) {
      console.error('Erro ao salvar pacote:', err);
      alert('Erro ao salvar pacote: ' + (err.message || JSON.stringify(err)));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const deletePackage = async (id: string) => {
    setIsSaving(true);
    try {
      const { error } = await supabase.from('packages').delete().eq('id', id);
      if (error) throw error;
      setPackagesState(prev => {
        const updated = prev.filter(p => p.id !== id);
        saveToStorage(STORAGE_KEYS.packages, updated);
        return updated;
      });
      return true;
    } catch (err: any) {
      console.error('Erro ao deletar pacote:', err);
      alert('Não foi possível excluir o pacote: ' + (err.message || err));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const upsertExtra = async (extra: ExtraService) => {
    setIsSaving(true);
    try {
      const { error } = await supabase.from('extras').upsert({
        id: extra.id,
        name: extra.name,
        description: extra.description,
        price: extra.price,
        image_url: extra.imageUrl,
        active: extra.active,
      });
      if (error) throw error;
      setExtrasState(prev => {
        const index = prev.findIndex(e => e.id === extra.id);
        const updated = index >= 0 ? prev.map((e, i) => i === index ? extra : e) : [...prev, extra];
        saveToStorage(STORAGE_KEYS.extras, updated);
        return updated;
      });
      return true;
    } catch (err) {
      console.error('Erro ao salvar serviço extra:', err);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const deleteExtra = async (id: string) => {
    setIsSaving(true);
    try {
      const { error } = await supabase.from('extras').delete().eq('id', id);
      if (error) throw error;
      setExtrasState(prev => {
        const updated = prev.filter(e => e.id !== id);
        saveToStorage(STORAGE_KEYS.extras, updated);
        return updated;
      });
      return true;
    } catch (err: any) {
      console.error('Erro ao deletar serviço extra:', err);
      alert('Não foi possível excluir o serviço: ' + (err.message || err));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const upsertDiscount = async (discount: DiscountCode) => {
    setIsSaving(true);
    try {
      const { error } = await supabase.from('discount_codes').upsert({
        code: discount.code,
        percentage: discount.percentage,
        active: discount.active,
        start_date: discount.startDate,
        end_date: discount.endDate,
        min_nights: discount.minNights,
        full_period_required: discount.fullPeriodRequired,
      });
      if (error) throw error;
      setDiscountsState(prev => {
        const index = prev.findIndex(d => d.code === discount.code);
        const updated = index >= 0 ? prev.map((d, i) => i === index ? discount : d) : [...prev, discount];
        saveToStorage(STORAGE_KEYS.discounts, updated);
        return updated;
      });
      return true;
    } catch (err) {
      console.error('Erro ao salvar cupom:', err);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const deleteDiscount = async (code: string) => {
    setIsSaving(true);
    try {
      const { error } = await supabase.from('discount_codes').delete().eq('code', code);
      if (error) throw error;
      setDiscountsState(prev => {
        const updated = prev.filter(d => d.code !== code);
        saveToStorage(STORAGE_KEYS.discounts, updated);
        return updated;
      });
      return true;
    } catch (err) {
      console.error('Erro ao deletar cupom:', err);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const saveReservationToSupabase = async (reservation: Reservation): Promise<{ success: boolean; error?: string }> => {
    setIsSaving(true);
    console.log('[Supabase] Tentando salvar reserva:', reservation.id);

    try {
      const dataToSave = {
        id: reservation.id,
        created_at: reservation.createdAt instanceof Date ? reservation.createdAt.toISOString() : reservation.createdAt,
        check_in: reservation.checkIn,
        check_out: reservation.checkOut,
        nights: reservation.nights,
        main_guest: reservation.mainGuest,
        additional_guests: reservation.additionalGuests,
        observations: reservation.observations || '',
        rooms: reservation.rooms,
        extras: reservation.extras,
        total_price: reservation.totalPrice,
        discount_applied: reservation.discountApplied || null,
        package_discount_applied: reservation.packageDiscountApplied || null,
        payment_method: reservation.paymentMethod,
        card_details: reservation.cardDetails || null,
        status: reservation.status,
        cancellation_reason: reservation.cancellationReason || null,
      };

      console.log('[Supabase] Enviando dados:', JSON.stringify(dataToSave));

      // Usar insert em vez de upsert para evitar problemas de permissão de UPDATE
      const savePromise = supabase.from('reservations').insert(dataToSave);
      const timeoutPromise = new Promise<{ error: any }>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_25S')), 25000));

      const result = await Promise.race([
        savePromise,
        timeoutPromise
      ]) as any;

      if (result.error) {
        console.error('[Supabase] Erro retornado:', result.error);
        return { success: false, error: result.error.message || JSON.stringify(result.error) };
      }

      console.log('[Supabase] Reserva salva com sucesso');

      // --- ATUALIZAÇÃO DE INVENTÁRIO (BAIXA NO MAPA) ---
      try {
        console.log('[Supabase] Iniciando baixa de inventário para os quartos reservados...');
        for (const roomSnapshot of reservation.rooms) {
          // Precisamos pegar o quarto atualizado direto do banco para garantir o saldo correto
          const { data: roomData, error: roomFetchError } = await supabase
            .from('room_types')
            .select('*')
            .eq('id', roomSnapshot.id)
            .single();

          if (roomFetchError || !roomData) {
            console.error(`[Supabase] Erro ao buscar quarto ${roomSnapshot.id} para baixa:`, roomFetchError);
            continue;
          }

          const currentRoom = mapRooms([roomData])[0];
          const checkInDate = parseISODate(reservation.checkIn);
          const checkOutDate = parseISODate(reservation.checkOut);
          const updatedOverrides = [...(currentRoom.overrides || [])];

          // Iterar por cada dia da estadia (exceto o dia do check-out)
          let current = new Date(checkInDate);
          while (current < checkOutDate) {
            const iso = toLocalISO(current);
            const ovIndex = updatedOverrides.findIndex(o => o.dateIso === iso);

            if (ovIndex >= 0) {
              const currentQty = updatedOverrides[ovIndex].availableQuantity ?? currentRoom.totalQuantity;
              updatedOverrides[ovIndex] = {
                ...updatedOverrides[ovIndex],
                availableQuantity: Math.max(0, currentQty - 1)
              };
            } else {
              updatedOverrides.push({
                dateIso: iso,
                availableQuantity: Math.max(0, currentRoom.totalQuantity - 1)
              });
            }
            current.setDate(current.getDate() + 1);
          }

          // Salvar o quarto com os overrides atualizados
          const { error: updateError } = await supabase
            .from('room_types')
            .update({ overrides: updatedOverrides })
            .eq('id', roomSnapshot.id);

          if (updateError) {
            console.error(`[Supabase] Erro ao atualizar inventário do quarto ${roomSnapshot.id}:`, updateError);
          } else {
            console.log(`[Supabase] Inventário atualizado para o quarto ${roomSnapshot.name}`);
          }
        }
        // Atualiza o estado local dos quartos para refletir no mapa administrativo
        loadFromSupabase(true);
      } catch (inventoryErr) {
        console.error('[Supabase] Erro crítico ao processar baixa de inventário:', inventoryErr);
      }
      // --- FIM DA ATUALIZAÇÃO DE INVENTÁRIO ---

      setReservationsState(prev => {
        const updated = [reservation, ...prev].slice(0, 500);
        saveToStorage(STORAGE_KEYS.reservations, updated);
        return updated;
      });
      return { success: true };
    } catch (err: any) {
      const msg = err.message === 'TIMEOUT_25S'
        ? 'A operação demorou demais (25s). Verifique sua conexão.'
        : `Erro ao salvar: ${err.message || err}`;
      console.error('[Supabase] Erro ao salvar reserva:', msg);
      return { success: false, error: msg };
    } finally {
      setIsSaving(false);
    }
  };

  const updateReservationStatus = async (id: string, status: string, reason?: string) => {
    setIsSaving(true);
    try {
      // Quando atualizamos o status (Confirmado/Cancelado), limpamos os dados do cartão por segurança
      const { error } = await supabase.from('reservations').update({
        status,
        cancellation_reason: reason || null,
        card_details: null
      }).eq('id', id);

      if (error) {
        throw error;
      }

      // --- ATUALIZAÇÃO DE INVENTÁRIO (REPOSIÇÃO EM CASO DE CANCELAMENTO) ---
      if (status === 'CANCELED') {
        const resToUpdate = reservations.find(r => r.id === id);
        if (resToUpdate) {
          console.log('[Supabase] Reserva cancelada detectada. Restaurando inventário...');
          for (const roomSnapshot of resToUpdate.rooms) {
            const { data: roomData } = await supabase.from('room_types').select('*').eq('id', roomSnapshot.id).single();
            if (roomData) {
              const currentRoom = mapRooms([roomData])[0];
              const checkInDate = parseISODate(resToUpdate.checkIn);
              const checkOutDate = parseISODate(resToUpdate.checkOut);
              const updatedOverrides = [...(currentRoom.overrides || [])];

              let current = new Date(checkInDate);
              while (current < checkOutDate) {
                const iso = toLocalISO(current);
                const ovIndex = updatedOverrides.findIndex(o => o.dateIso === iso);
                if (ovIndex >= 0) {
                  const currentQty = updatedOverrides[ovIndex].availableQuantity ?? currentRoom.totalQuantity;
                  updatedOverrides[ovIndex] = {
                    ...updatedOverrides[ovIndex],
                    availableQuantity: Math.min(currentRoom.totalQuantity, currentQty + 1)
                  };
                }
                current.setDate(current.getDate() + 1);
              }
              await supabase.from('room_types').update({ overrides: updatedOverrides }).eq('id', roomSnapshot.id);
            }
          }
          loadFromSupabase(true);
        }
      }
      // --- FIM DA ATUALIZAÇÃO DE INVENTÁRIO ---

      setReservationsState(prev => {
        const updated = prev.map(r => r.id === id ? { ...r, status, cancellationReason: reason, cardDetails: undefined } as Reservation : r);
        saveToStorage(STORAGE_KEYS.reservations, updated);
        return updated;
      });
      return true;
    } catch (err: any) {
      console.error('Erro ao atualizar status da reserva:', err);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const setRooms = useCallback((val: any) => setRoomsState(val), []);
  const setPackages = useCallback((val: any) => setPackagesState(val), []);
  const setDiscounts = useCallback((val: any) => setDiscountsState(val), []);
  const setExtras = useCallback((val: any) => setExtrasState(val), []);
  const setReservations = useCallback((val: any) => setReservationsState(val), []);

  return {
    loading,
    isSaving,
    isConnected,
    error,
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
    refreshData: () => loadFromSupabase(false),
    upsertRoom,
    deleteRoom,
    upsertPackage,
    deletePackage,
    upsertExtra,
    deleteExtra,
    upsertDiscount,
    deleteDiscount,
    saveReservationToSupabase,
    updateReservationStatus,
  };
};
