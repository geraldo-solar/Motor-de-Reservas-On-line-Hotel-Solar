import { useState, useEffect, useCallback, useRef } from 'react';
import { Room, HolidayPackage, DiscountCode, ExtraService, Reservation } from '../types';
import { supabase } from '../lib/supabase';
import { offlineQueue } from '../lib/offlineQueue';
import { getPublicImageUrl } from '../utils/imageUtils';
import { toLocalISO, parseISODate } from '../utils/dateUtils';
import { safeArray, safeObject } from '../utils/dataSafety';

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

  const mapRooms = (data: any[]): Room[] => safeArray(data).map((r: any) => ({
    id: String(r.id || ''),
    name: r.name || 'Nova Acomodação',
    description: r.description || '',
    price: r.base_price || r.price || 0,
    capacity: r.capacity || 2,
    imageUrls: safeArray(r.images || r.image_urls || r.imageUrls).map(getPublicImageUrl),
    address: r.address || '',
    features: safeArray(r.amenities || r.features),
    totalQuantity: r.total_quantity || r.totalQuantity || 1,
    active: r.active !== false,
    overrides: safeArray(r.overrides || []),
  }));

  const mapPackages = (data: any[]): HolidayPackage[] => safeArray(data).map((p: any) => ({
    id: String(p.id || ''),
    name: p.name || '',
    description: p.description || '',
    imageUrl: getPublicImageUrl(p.image_url || p.imageUrl || ''),
    location: p.location || '',
    includes: safeArray(p.includes || p.benefits || []),
    benefits: safeArray(p.benefits || p.includes || []),
    active: p.active !== false,
    startIsoDate: p.start_iso_date || p.start_date || p.startIsoDate || '',
    endIsoDate: p.end_iso_date || p.end_date || p.endIsoDate || '',
    roomPrices: safeArray(p.room_prices || p.roomPrices),
    noCheckoutDates: safeArray(p.no_checkout_dates || p.noCheckoutDates),
    noCheckInDates: safeArray(p.no_checkin_dates || p.noCheckInDates),
    fullPeriodDiscountPct: p.full_period_discount_pct || p.fullPeriodDiscountPct || 0,
    category: p.category || 'SPECIAL',
    isPromotional: p.is_promotional || p.isPromotional || false,
  }));

  const mapReservations = (data: any[]): Reservation[] => safeArray(data).map((r: any) => {
    try {
      return {
        id: String(r.id || ''),
        createdAt: (r.created_at || r.createdAt) ? new Date(r.created_at || r.createdAt) : new Date(),
        checkIn: String(r.check_in || r.checkIn || ''),
        checkOut: String(r.check_out || r.checkOut || ''),
        nights: Number(r.nights || 1),
        mainGuest: safeObject(r.main_guest || r.mainGuest, { name: 'Hóspede', email: '', phone: '', cpf: '' }),
        additionalGuests: safeArray(r.additional_guests || r.additionalGuests),
        observations: String(r.observations || ''),
        rooms: safeArray(r.rooms || r.reservation_rooms).map((rm: any) => ({
          id: String(rm.id || rm.room_id || ''),
          name: String(rm.name || 'Acomodação'),
          priceSnapshot: Number(rm.priceSnapshot || rm.price_snapshot || 0)
        })),
        extras: safeArray(r.extras || r.reservation_extras).map((ex: any) => ({
          id: String(ex.id || ex.extra_id || ''),
          name: String(ex.name || 'Serviço'),
          priceSnapshot: Number(ex.priceSnapshot || ex.price_snapshot || 0),
          quantity: Number(ex.quantity || 1)
        })),
        totalPrice: Number(r.total_price || r.totalPrice || 0),
        discountApplied: (r.discount_applied || r.discountApplied) ? {
          code: String((r.discount_applied || r.discountApplied).code || ''),
          amount: Number((r.discount_applied || r.discountApplied).amount || 0)
        } : undefined,
        paymentMethod: (r.payment_method || r.paymentMethod || 'PIX') as 'PIX' | 'CREDIT_CARD',
        cardDetails: r.card_details || r.cardDetails ? safeObject(r.card_details || r.cardDetails, undefined) : undefined,
        status: (r.status || 'PENDING') as any,
        cancellationReason: r.cancellation_reason || r.cancellationReason || '',
        packageDiscountApplied: (r.package_discount_applied || r.packageDiscountApplied) ? {
          percentage: Number((r.package_discount_applied || r.packageDiscountApplied).percentage || 0),
          amount: Number((r.package_discount_applied || r.packageDiscountApplied).amount || 0)
        } : undefined,
      };
    } catch (e) {
      console.error('[Mapper] Erro ao mapear reserva individual:', e, r);
      // Retorna uma reserva mínima para não quebrar o loop
      return { id: 'ERR', mainGuest: { name: 'Erro Dados', email: '', phone: '', cpf: '' }, status: 'PENDING', totalPrice: 0, rooms: [], extras: [], checkIn: '', checkOut: '', nights: 1, createdAt: new Date() } as any;
    }
  });

  const mapExtras = (data: any[]): ExtraService[] => safeArray(data).map((e: any) => ({
    id: String(e.id || ''),
    name: e.name,
    description: e.description || '',
    price: e.price || 0,
    imageUrl: getPublicImageUrl(e.image_url || e.imageUrl || ''),
    active: e.active !== false,
  }));

  const mapDiscounts = (data: any[]): DiscountCode[] => safeArray(data).map((d: any) => ({
    code: String(d.code || ''),
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

      const startTime = Date.now();

      // Funções de busca individuais para melhor controle de erro
      const fetchRooms = () => supabase.from('room_types').select('*').order('name');
      const fetchPackages = () => supabase.from('packages').select('*');
      const fetchReservations = () => supabase.from('reservations').select('*').order('created_at', { ascending: false }).limit(300);
      const fetchExtras = () => supabase.from('extras').select('*');
      const fetchDiscounts = () => supabase.from('discount_codes').select('*');

      // Executamos em paralelo mas tratamos individualmente se necessário
      // Usamos um timeout global maior (15s)
      const results = await Promise.race([
        Promise.all([fetchRooms(), fetchPackages(), fetchReservations(), fetchExtras(), fetchDiscounts()]),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('FETCH_TIMEOUT')), 15000))
      ]) as any[];

      const [rRes, pRes, resRes, eRes, dRes] = results;
      const duration = Date.now() - startTime;
      console.log(`[Supabase] Busca concluída em ${duration}ms`);

      // Verificamos erros individuais de quota
      const quotaError = results.find(r => r.error && (r.error.status === 429 || r.error.status === 403));
      if (quotaError) {
        console.warn('[Supabase] Limite de cota atingido (Egress). Usando cache.', quotaError.error);
        return false;
      }

      // Processar cada resultado se não houver erro crítico
      if (!rRes.error && rRes.data) {
        const mapped = mapRooms(rRes.data);
        setRoomsState(mapped);
        saveToStorage(STORAGE_KEYS.rooms, mapped);
      }

      if (!pRes.error && pRes.data) {
        const mapped = mapPackages(pRes.data);
        setPackagesState(mapped);
        saveToStorage(STORAGE_KEYS.packages, mapped);
      }

      if (!resRes.error && resRes.data) {
        const mapped = mapReservations(resRes.data);
        console.log(`[Supabase] ${mapped.length} reservas carregadas.`);
        setReservationsState(mapped);
        saveToStorage(STORAGE_KEYS.reservations, mapped);
      } else if (resRes.error) {
        console.error('[Supabase] Erro ao carregar reservas:', resRes.error);
      }

      if (!eRes.error && eRes.data) {
        const mapped = mapExtras(eRes.data);
        setExtrasState(mapped);
        saveToStorage(STORAGE_KEYS.extras, mapped);
      }

      if (!dRes.error && dRes.data) {
        const mapped = mapDiscounts(dRes.data);
        setDiscountsState(mapped);
        saveToStorage(STORAGE_KEYS.discounts, mapped);
      }

      setIsConnected(true);
      return true;
    } catch (err: any) {
      if (err.message === 'FETCH_TIMEOUT') {
        console.warn('[Supabase] Tempo esgotado (15s). Mantendo dados locais para fluidez.');
      } else {
        console.error('[Supabase] Falha na sincronização:', err);
      }
      return false;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

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

  // Realtime subscription para manter o Painel Admin sincronizado com o ERP e outras mudanças
  useEffect(() => {
    const channel = supabase
      .channel('db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations' },
        (payload) => {
          console.log('[Realtime] Reserva atualizada/alterada. Sincronizando...', payload);
          loadFromSupabase(true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_types' },
        (payload) => {
          console.log('[Realtime] Acomodações/Estoque alterados. Sincronizando...', payload);
          loadFromSupabase(true);
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
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

  const upsertRooms = async (updatedRooms: Room[]) => {
    setIsSaving(true);
    try {
      const dataToSave = updatedRooms.map(room => ({
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
      }));

      const { error } = await supabase.from('room_types').upsert(dataToSave);
      if (error) throw error;

      setRoomsState(prev => {
        const newRooms = [...prev];
        updatedRooms.forEach(room => {
          const index = newRooms.findIndex(r => r.id === room.id);
          if (index >= 0) newRooms[index] = room;
          else newRooms.push(room);
        });
        saveToStorage(STORAGE_KEYS.rooms, newRooms);
        return newRooms;
      });
      return true;
    } catch (err) {
      console.error('Erro ao salvar quartos em massa:', err);
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
        // Mantemos category e is_promotional fora do upsert por enquanto 
        // para evitar erros se as colunas não existirem no schema do cliente.
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
        max_uses: discount.maxUses,
        discount_type: discount.discountType || 'percentage',
        fixed_value: discount.fixedValue,
        stackable: discount.stackable,
        valid_days: discount.validDays,
        valid_room_types: discount.validRoomTypes,
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

      // Tenta salvar no Supabase
      const { error: insertError } = await supabase.from('reservations').insert(dataToSave);

      if (insertError) {
        // Se for erro de rede, enfileira e finge sucesso (otimismo)
        // Adicionado 'Load failed' (Safari/iOS) catch
        if (insertError.message?.includes('failed to fetch') || insertError.message?.includes('NetworkError') || insertError.message?.includes('Load failed') || !navigator.onLine) {
          console.warn('[Offline] Rede indisponível (ou erro de Load failed). Enfileirando reserva...');
          await offlineQueue.enqueue({
            table: 'reservations',
            action: 'INSERT',
            data: dataToSave
          });

          // Atualiza estado local otimista
          setReservationsState(prev => [reservation, ...prev].slice(0, 500));
          saveToStorage(STORAGE_KEYS.reservations, [reservation, ...reservations].slice(0, 500));
          return { success: true };
        }

        console.error('[Supabase] Erro no banco:', insertError);
        return { success: false, error: `Erro no banco de dados: ${insertError.message}` };
      }

      console.log('[Supabase] Reserva salva com sucesso no banco');

      // Notifica o ERP em tempo real via Broadcast (mais rápido que a replicação do Postgres)
      supabase.channel('erp-sync').subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          supabase.channel('erp-sync').send({
            type: 'broadcast',
            event: 'new-online-res',
            payload: { name: reservation.mainGuest.name, id: reservation.id }
          });
        }
      });

      // --- SINCRONIZAÇÃO DE INVENTÁRIO (DECREMENTO) ---
      // Caso a reserva venha do site, decrementamos o estoque imediatamente
      const syncInventory = async (res: Reservation) => {
        try {
          for (const roomSnapshot of res.rooms) {
            const { data: roomData } = await supabase.from('room_types').select('*').eq('id', roomSnapshot.id).single();
            if (roomData) {
              const currentRoom = mapRooms([roomData])[0];
              const checkInDate = parseISODate(res.checkIn);
              const checkOutDate = parseISODate(res.checkOut);
              const updatedOverrides = [...(currentRoom.overrides || [])];

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
                    price: currentRoom.price,
                    availableQuantity: Math.max(0, currentRoom.totalQuantity - 1),
                    isClosed: false
                  });
                }
                current.setDate(current.getDate() + 1);
              }
              await supabase.from('room_types').update({ overrides: updatedOverrides }).eq('id', roomSnapshot.id);
            }
          }
        } catch (err) {
          console.error('[Inventory] Erro ao decrementar estoque:', err);
          // Tenta recarregar os dados mesmo se falhar para tentar manter sincronia
          loadFromSupabase(true);
        }
      };

      await syncInventory(reservation);
      // --- FIM DA SINCRONIZAÇÃO ---

      // Recarregar dados para atualizar estoque local e map de disponibilidade
      await loadFromSupabase(true);

      // Adiciona apenas se ainda não estiver na lista (evita duplicação por fetch rápido)
      setReservationsState(prev => {
        if (prev.some(r => r.id === reservation.id)) return prev;
        const updated = [reservation, ...prev].slice(0, 500);
        saveToStorage(STORAGE_KEYS.reservations, updated);
        return updated;
      });
      return { success: true };

    } catch (err: any) {
      console.error('[Supabase] Erro de rede ou conexão:', err);

      // Se for erro de rede/conexão no catch (ex: TypeError: Failed to fetch), 
      // tentamos enfileirar offline para não perder a reserva e permitir que o usuário continue.
      // Adicionado 'Load failed' para iPhone
      const isNetworkError = err.name === 'TypeError' || err.message?.includes('failed to fetch') || err.message?.includes('NetworkError') || err.message?.includes('Load failed');

      if (isNetworkError) {
        console.warn('[Offline] Erro detectado no catch. Enfileirando reserva de segurança...');

        // Dados para salvar (repetindo a estrutura se necessário ou criando uma variável acima)
        // Como o reservationId agora é persistente no BookingForm, isso evita duplicatas mesmo se o 
        // primeiro request "quase" deu certo.
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
          payment_method: reservation.paymentMethod,
          status: reservation.status
        };

        await offlineQueue.enqueue({
          table: 'reservations',
          action: 'INSERT',
          data: dataToSave
        });

        // Adiciona ao estado local apenas se ainda não existir (prevenção contra duplicidade na UI)
        setReservationsState(prev => {
          if (prev.some(r => r.id === reservation.id)) return prev;
          const updated = [reservation, ...prev].slice(0, 500);
          saveToStorage(STORAGE_KEYS.reservations, updated);
          return updated;
        });

        return { success: true }; // Retornamos sucesso otimista
      }

      return {
        success: false,
        error: err.name === 'TypeError' ? 'Erro de conexão com o servidor. Verifique sua internet ou se há algum bloqueador ativado.' : err.message
      };
    } finally {
      setIsSaving(false);
    }
  };

  const updateReservationStatus = async (id: string, status: string, reason?: string) => {
    setIsSaving(true);
    try {
      // Tenta atualizar no Supabase
      const { error } = await supabase.from('reservations').update({
        status,
        cancellation_reason: reason || null,
        card_details: null
      }).eq('id', id);

      if (error) {
        // Se for erro de rede, enfileira
        if (error.message?.includes('failed to fetch') || error.message?.includes('NetworkError') || !navigator.onLine) {
          console.warn('[Offline] Rede indisponível. Enfileirando atualização de status...');
          await offlineQueue.enqueue({
            table: 'reservations',
            action: 'UPDATE',
            data: { status, cancellation_reason: reason || null, card_details: null },
            filters: [{ column: 'id', value: id }]
          });
        } else {
          throw error;
        }
      }

      // --- SINCRONIZAÇÃO DE INVENTÁRIO ---
      const syncInventory = async (res: Reservation, operation: 'increase' | 'decrease') => {
        try {
          for (const roomSnapshot of res.rooms) {
            const { data: roomData } = await supabase.from('room_types').select('*').eq('id', roomSnapshot.id).single();
            if (roomData) {
              const currentRoom = mapRooms([roomData])[0];
              const checkInDate = parseISODate(res.checkIn);
              const checkOutDate = parseISODate(res.checkOut);
              const updatedOverrides = [...(currentRoom.overrides || [])];

              let current = new Date(checkInDate);
              while (current < checkOutDate) {
                const iso = toLocalISO(current);
                const ovIndex = updatedOverrides.findIndex(o => o.dateIso === iso);

                if (ovIndex >= 0) {
                  const currentQty = updatedOverrides[ovIndex].availableQuantity ?? currentRoom.totalQuantity;
                  updatedOverrides[ovIndex] = {
                    ...updatedOverrides[ovIndex],
                    availableQuantity: operation === 'increase'
                      ? Math.min(currentRoom.totalQuantity, currentQty + 1)
                      : Math.max(0, currentQty - 1)
                  };
                } else if (operation === 'decrease') {
                  updatedOverrides.push({
                    dateIso: iso,
                    price: currentRoom.price, // Use base price if no override exists
                    availableQuantity: Math.max(0, currentRoom.totalQuantity - 1),
                    isClosed: false
                  });
                }
                current.setDate(current.getDate() + 1);
              }
              await supabase.from('room_types').update({ overrides: updatedOverrides }).eq('id', roomSnapshot.id);
            }
          }
        } catch (err) {
          console.error('[Inventory] Erro na sincronização:', err);
        }
      };

      if (status === 'CANCELED') {
        const resToUpdate = reservations.find(r => r.id === id);
        if (resToUpdate) {
          console.log('[Supabase] Reserva cancelada detectada. Restaurando inventário...');
          await syncInventory(resToUpdate, 'increase');
        }
      }

      // Forçar recarregamento dos dados de acomodações/estoque
      await loadFromSupabase(true);
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
    upsertRooms,
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
