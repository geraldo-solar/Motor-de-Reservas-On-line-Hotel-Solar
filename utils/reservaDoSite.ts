// Regras do que o site público pode fazer com reservas (VEN-10, fase 2).
//
// Até aqui o navegador de qualquer visitante baixava até 1.000 reservas com
// os dados dos hóspedes (e as guardava no próprio aparelho), gravava reserva,
// hóspede e estoque direto no banco pela chave pública, e achava a reserva do
// cancelamento com uma busca que casava qualquer pedaço do número. Agora o
// site pede ao servidor (api/check-reservation), que usa estas regras: só a
// reserva do número completo (o link do e-mail) ou do código curto junto com
// o e-mail do hóspede; gravação só nos campos que o site preenche.

import type { Reservation } from '../types';
import { safeArray } from './dataSafety.js';
import { generateUUID } from './uuid.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export const ehUuid = (valor: unknown): boolean => UUID.test(String(valor ?? '').trim());

/** Mesmo código de 8 caracteres dos e-mails (services/emailService). */
export const codigoCurto = (id: string): string =>
  String(id || '').replace('RES-', '').replace(/-/g, '').substring(0, 8).toUpperCase();

export const ehCodigoCurto = (valor: unknown): boolean => /^[0-9A-F]{8}$/i.test(String(valor ?? '').trim());

/**
 * Colunas que o hóspede vê no cancelamento, no pré-check-in e no link do
 * chatbot. Fora: cartão, histórico de pagamento, vínculos internos.
 */
export const COLUNAS_DO_SITE =
  'id, created_at, check_in, check_out, nights, main_guest, additional_guests, observations, rooms, extras, total_price, discount_applied, package_discount_applied, payment_method, status, cancellation_reason, group_id';

const texto = (valor: unknown, max: number): string => String(valor ?? '').slice(0, max);
const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : NaN;
};

/** Devolve o motivo da recusa, ou null se a reserva do site pode ser gravada. */
export function conferirReservaDoSite(r: any): string | null {
  if (!r || typeof r !== 'object') return 'Reserva vazia.';
  if (!ehUuid(r.id)) return 'Número da reserva inválido.';
  if (!DATA.test(String(r.checkIn)) || !DATA.test(String(r.checkOut))) return 'Datas inválidas.';
  if (String(r.checkIn) >= String(r.checkOut)) return 'A saída precisa ser depois da entrada.';
  const noites = numero(r.nights);
  if (!Number.isInteger(noites) || noites < 1 || noites > 60) return 'Número de diárias inválido.';
  const quartos = safeArray<any>(r.rooms);
  if (quartos.length < 1 || quartos.length > 10) return 'Escolha de 1 a 10 acomodações.';
  if (quartos.some(q => !q?.id || !(numero(q.priceSnapshot) >= 0))) return 'Acomodação inválida.';
  const hospede = r.mainGuest || {};
  if (!String(hospede.name || '').trim() || !String(hospede.email || '').includes('@')) return 'Nome e e-mail do hóspede são obrigatórios.';
  if (!['PIX', 'CREDIT_CARD'].includes(r.paymentMethod)) return 'Forma de pagamento inválida.';
  if (!(numero(r.totalPrice) >= 0)) return 'Valor total inválido.';
  if (safeArray(r.extras).length > 50 || safeArray(r.additionalGuests).length > 40) return 'Reserva grande demais.';
  return null;
}

/** Só o que o formulário do site preenche; situação sempre "pendente". */
export function reservaLimpa(r: any): Reservation {
  const hospede = r.mainGuest || {};
  const maxParcelas = Number(r.cardDetails?.maxInstallments ?? r.cardDetails?.installments ?? 1);
  return {
    id: String(r.id).trim().toLowerCase(),
    createdAt: new Date(),
    checkIn: String(r.checkIn),
    checkOut: String(r.checkOut),
    nights: Number(r.nights),
    mainGuest: {
      name: texto(hospede.name, 200).trim(),
      email: texto(hospede.email, 200).trim(),
      phone: texto(hospede.phone, 40).trim(),
      cpf: texto(hospede.cpf, 20).trim(),
    },
    additionalGuests: safeArray<any>(r.additionalGuests).map(g => ({
      name: texto(g?.name, 200), cpf: texto(g?.cpf, 20), age: g?.age, roomId: texto(g?.roomId, 80), roomName: texto(g?.roomName, 120),
    })) as any,
    observations: texto(r.observations, 2000),
    rooms: safeArray<any>(r.rooms).map(q => ({ id: texto(q.id, 80), name: texto(q.name, 120), priceSnapshot: Number(q.priceSnapshot) })),
    extras: safeArray<any>(r.extras).map(e => ({ ...e, name: texto(e?.name, 120) })),
    totalPrice: Number(r.totalPrice),
    discountApplied: r.discountApplied ? { code: texto(r.discountApplied.code, 40), amount: Number(r.discountApplied.amount) || 0 } : undefined,
    packageDiscountApplied: r.packageDiscountApplied
      ? { percentage: Number(r.packageDiscountApplied.percentage) || 0, amount: Number(r.packageDiscountApplied.amount) || 0 }
      : undefined,
    paymentMethod: r.paymentMethod,
    cardDetails: r.paymentMethod === 'CREDIT_CARD'
      ? { viaCielo: true, maxInstallments: Number.isInteger(maxParcelas) && maxParcelas >= 1 && maxParcelas <= 12 ? maxParcelas : 1 } as any
      : undefined,
    status: 'PENDING' as any,
  };
}

// Transforma uma Reservation "combinada" (todos os quartos numa única lista, total somado)
// em uma linha por quarto para o banco (mesmo padrão usado pelo ERP e pela API do chatbot),
// evitando que uma reserva multi-apto chegue ao ERP como se fosse 1 apto só com diária somada.
export const linhasPorQuarto = (reservation: Reservation, createdBy: string) => {
  const rooms = safeArray<any>(reservation.rooms);

  const baseFields = {
    check_in: reservation.checkIn,
    check_out: reservation.checkOut,
    nights: reservation.nights,
    main_guest: reservation.mainGuest,
    observations: reservation.observations || '',
    discount_applied: reservation.discountApplied || null,
    package_discount_applied: reservation.packageDiscountApplied || null,
    payment_method: reservation.paymentMethod,
    // Nunca número, validade ou CVV: o cartão é digitado na Cielo. Guarda só
    // o que a cobrança precisa (limite de parcelas do pacote).
    card_details: reservation.cardDetails
      ? { viaCielo: true, maxInstallments: reservation.cardDetails.maxInstallments ?? reservation.cardDetails.installments ?? 1 }
      : null,
    status: reservation.status,
    cancellation_reason: reservation.cancellationReason || null,
    created_by: createdBy,
  };

  const criadaEm = reservation.createdAt instanceof Date ? reservation.createdAt.toISOString() : reservation.createdAt;

  if (rooms.length <= 1) {
    return [{
      id: reservation.id,
      created_at: criadaEm,
      ...baseFields,
      additional_guests: reservation.additionalGuests,
      rooms: reservation.rooms,
      extras: reservation.extras,
      total_price: reservation.totalPrice,
      group_id: null,
    }];
  }

  const accommodationTotal = rooms.reduce((sum, r: any) => sum + (r.priceSnapshot || 0), 0);
  const couponDiscount = reservation.discountApplied?.amount || 0;
  const packageDiscount = reservation.packageDiscountApplied?.amount || 0;
  // Deriva o total de extras (serviços adicionais, ex: transfer) a partir do total já calculado
  const extrasTotal = reservation.totalPrice - accommodationTotal + couponDiscount + packageDiscount;

  const combinedBreakdown: any = safeArray<any>(reservation.extras).find((e: any) => e.id === 'daily_breakdown' && e.isBreakdown);
  const otherExtras = safeArray<any>(reservation.extras).filter((e: any) => e.id !== 'daily_breakdown');

  const groupId = generateUUID();

  return rooms.map((room: any, index: number) => {
    const roomShare = accommodationTotal > 0 ? (room.priceSnapshot || 0) / accommodationTotal : 1 / rooms.length;
    const roomDiscount = (couponDiscount + packageDiscount) * roomShare;
    const roomAccommodation = (room.priceSnapshot || 0) - roomDiscount;
    const roomTotal = Math.round(roomAccommodation + (index === 0 ? extrasTotal : 0));

    const roomExtras: any[] = index === 0 ? [...otherExtras] : [];
    if (combinedBreakdown) {
      roomExtras.push({
        id: 'daily_breakdown',
        name: 'daily_breakdown',
        isBreakdown: true,
        quantity: 1,
        priceSnapshot: 0,
        days: safeArray<any>(combinedBreakdown.days).map((d: any) => ({ date: d.date, price: Math.round(d.price * roomShare) })),
      });
    }

    // Hóspedes adicionais já vêm com roomId associado; cada linha fica só com os seus
    const roomGuests = safeArray<any>(reservation.additionalGuests).filter((g: any) => g.roomId === room.id);

    return {
      id: index === 0 ? reservation.id : generateUUID(),
      created_at: criadaEm,
      ...baseFields,
      additional_guests: roomGuests,
      rooms: [room],
      extras: roomExtras,
      total_price: roomTotal,
      group_id: groupId,
    };
  });
};

/**
 * Link do chatbot (?paymentId=): a reserva já existe, criada pelo chatbot, e
 * o site só a completa. Só vale para rascunho do chatbot ainda pendente.
 */
export function ehRascunhoDoChatbot(linha: any): boolean {
  return Boolean(linha)
    && String(linha.observations || '').startsWith('[ORIGEM: AI CHATBOT]')
    && String(linha.status || '').toUpperCase() === 'PENDING';
}

type LinhaDoQuarto = { overrides?: any; total_quantity?: number | null; base_price?: number | null };

/** Dias da estadia (entrada inclusive, saída exclusive), em AAAA-MM-DD. */
export function diasDaEstadia(entrada: string, saida: string): string[] {
  const dias: string[] = [];
  const atual = new Date(`${entrada}T12:00:00Z`);
  const fim = new Date(`${saida}T12:00:00Z`);
  for (let guarda = 0; atual < fim && guarda < 366; guarda++) {
    dias.push(atual.toISOString().slice(0, 10));
    atual.setUTCDate(atual.getUTCDate() + 1);
  }
  return dias;
}

/**
 * Estoque da acomodação depois de um cancelamento (devolve 1 por dia, sem
 * passar do total). "reservar" (tira 1 por dia) fica para quem precisar: na
 * entrada da reserva quem tira é o próprio banco.
 */
export function estoqueAjustado(quarto: LinhaDoQuarto, entrada: string, saida: string, operacao: 'reservar' | 'devolver') {
  const total = Number(quarto.total_quantity || 1);
  const ajustes = safeArray<any>(quarto.overrides).map(o => ({ ...o }));
  for (const dia of diasDaEstadia(entrada, saida)) {
    const i = ajustes.findIndex(o => o.dateIso === dia);
    if (i >= 0) {
      const atual = ajustes[i].availableQuantity ?? total;
      ajustes[i].availableQuantity = operacao === 'devolver' ? Math.min(total, atual + 1) : Math.max(0, atual - 1);
    } else if (operacao === 'reservar') {
      ajustes.push({ dateIso: dia, price: quarto.base_price, availableQuantity: Math.max(0, total - 1), isClosed: false });
    }
  }
  return ajustes;
}

/**
 * Cancelamento pelo hóspede. Total, ou só as acomodações/serviços marcados;
 * se não sobrar acomodação, vira total. Mesma conta que a tela fazia.
 */
export function cancelamentoDoSite(linha: any, quartosMarcados: number[], extrasMarcados: number[], hoje: string) {
  const quartos = safeArray<any>(linha.rooms);
  const extras = safeArray<any>(linha.extras);
  const q = new Set(quartosMarcados.filter(i => Number.isInteger(i) && i >= 0 && i < quartos.length));
  const e = new Set(extrasMarcados.filter(i => Number.isInteger(i) && i >= 0 && i < extras.length));
  if (q.size === 0 && e.size === 0) return { tipo: 'nada' as const };
  const restamQuartos = quartos.filter((_, i) => !q.has(i));
  const restamExtras = extras.filter((_, i) => !e.has(i));
  const total = (q.size === quartos.length && e.size === extras.length) || restamQuartos.length === 0;
  if (total) return { tipo: 'total' as const };
  const nomes = [...[...q].map(i => quartos[i]?.name), ...[...e].map(i => extras[i]?.name)].filter(Boolean);
  const novoTotal = restamQuartos.reduce((s, r) => s + (Number(r.priceSnapshot) || 0), 0)
    + restamExtras.reduce((s, x) => s + (Number(x.priceSnapshot) || 0) * (Number(x.quantity) || 1), 0);
  return {
    tipo: 'parcial' as const,
    quartosDevolvidos: [...q].map(i => quartos[i]).filter(Boolean),
    canceladosQuartos: [...q].map(i => quartos[i]?.name).filter(Boolean) as string[],
    canceladosExtras: [...e].map(i => extras[i]?.name).filter(Boolean) as string[],
    alteracao: {
      rooms: restamQuartos,
      extras: restamExtras,
      total_price: novoTotal,
      observations: `${linha.observations || ''}\n[CANCELAMENTO PARCIAL em ${hoje}]: Itens cancelados: ${nomes.join(', ')}`.trim(),
    },
  };
}

const CAMPOS_DO_HOSPEDE = ['name', 'full_name', 'email', 'phone', 'cpf_cnpj', 'document', 'rg', 'birthdate', 'nationality', 'profession', 'gender', 'zip_code', 'address', 'city_state'];

/** Ficha de hóspede vinda do pré-check-in: só os campos da FNRH, com limite de tamanho. */
export function fichaDoHospede(dados: any): Record<string, string> {
  const ficha: Record<string, string> = {};
  for (const campo of CAMPOS_DO_HOSPEDE) {
    if (dados?.[campo] !== undefined && dados?.[campo] !== null) ficha[campo] = texto(dados[campo], 300);
  }
  return ficha;
}

export const soDigitos = (valor: unknown): string => String(valor ?? '').replace(/\D/g, '');

/**
 * Ficha já existente que o pré-check-in pode completar: a de mesmo CPF; pelo
 * nome, só a ficha sem documento (a que o ERP cria antes do pré-check-in).
 * Antes bastava o nome parecido para sobrescrever a ficha de outra pessoa.
 */
export function fichaQuePodeSerCompletada(porCpf: any | null, porNome: any | null): string | null {
  if (porCpf?.id) return porCpf.id;
  if (porNome?.id && !soDigitos(porNome.document) && !soDigitos(porNome.cpf_cnpj)) return porNome.id;
  return null;
}

/** Cupom como o formulário usa (utils/pricing.validateDiscount). */
export function cupomParaOSite(linha: any) {
  return {
    code: String(linha.code || ''),
    percentage: linha.percentage || 0,
    active: linha.active !== false,
    startDate: linha.start_date || linha.startDate || '',
    endDate: linha.end_date || linha.endDate || '',
    minNights: linha.min_nights || linha.minNights || 1,
    fullPeriodRequired: linha.full_period_required || linha.fullPeriodRequired || false,
  };
}
