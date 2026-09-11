import { familyAccommodation, familyAgeQuestion, baseRoomCapacity, familyRoomExplanation } from './familyAccommodation.js';

export type PackagePricingRecord = {
  id: string;
  name?: string;
  description?: string;
  includes?: string[];
  benefits?: string[];
  start_iso_date?: string;
  end_iso_date?: string;
  room_prices?: Array<{ roomId?: string; room_id?: string; price?: number }>;
  full_period_discount_pct?: number;
  [key: string]: unknown;
};

export type PackageRoomRecord = {
  id: string;
  name?: string;
  capacity?: number;
  base_price?: number;
  overrides?: Array<{ dateIso?: string; date_iso?: string; price?: number }>;
  [key: string]: unknown;
};

export type PackagePrice = {
  id: string;
  name: string;
  capacity?: number;
  price: number;
};

// This is the package-details calculation, not the personalized quote engine.
// Explicit package prices take precedence over full-period nightly simulation.
export function packagePrices(pkg: PackagePricingRecord, rooms: PackageRoomRecord[]): {
  prices: PackagePrice[];
  label: string;
} {
  const roomRecords = new Map(rooms.map(room => [String(room.id), room]));
  let prices: PackagePrice[] = (pkg.room_prices || [])
    .map(item => {
      const id = String(item.roomId || item.room_id || '');
      const room = roomRecords.get(id);
      return {
        id,
        name: room?.name || 'Acomodação',
        capacity: room?.capacity,
        price: Number(item.price || 0),
      };
    })
    .filter(item => item.price > 0)
    .sort((a, b) => b.price - a.price);

  let label = '💰 *Valores cadastrados por acomodação:*';
  if (!prices.length && pkg.start_iso_date && pkg.end_iso_date) {
    const start = new Date(`${pkg.start_iso_date}T12:00:00Z`);
    const end = new Date(`${pkg.end_iso_date}T12:00:00Z`);
    const discount = Number(pkg.full_period_discount_pct || 0);
    prices = rooms.map(room => {
      let total = 0;
      const current = new Date(start);
      while (current < end) {
        const isoDate = current.toISOString().slice(0, 10);
        const override = (room.overrides || []).find(item =>
          String(item.dateIso || item.date_iso || '') === isoDate
        );
        total += override?.price !== undefined ? Number(override.price) : Number(room.base_price || 0);
        current.setUTCDate(current.getUTCDate() + 1);
      }
      if (discount > 0) total *= 1 - discount / 100;
      return {
        id: String(room.id),
        name: room.name || 'Acomodação',
        capacity: room.capacity,
        price: total,
      };
    }).filter(item => item.price > 0).sort((a, b) => b.price - a.price);
    label = '💰 *Simulação cadastrada para o período completo:*';
  }
  return { prices, label };
}

const displayText = (value: string, limit: number) => String(value)
  .replace(/[\r\n\t]+/g, ' ').trim().slice(0, limit);
const displayDate = (value?: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
};
const money = (value: number) => value.toLocaleString('pt-BR', {
  style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2,
}).replace(/\u00a0/g, ' ');

/** Informational comparison confined to this catalog package and known capacity. */
export function packageRecommendation(
  pkg: PackagePricingRecord,
  rooms: PackageRoomRecord[],
  guests?: number,
  state?: unknown,
): string {
  const name = displayText(pkg.name || 'Pacote especial', 150);
  const start = displayDate(pkg.start_iso_date);
  const end = displayDate(pkg.end_iso_date);
  const text = [`🎉 *${name}*`];
  if (start && end) text.push(`📅 *Período do pacote:* ${start} a ${end}`);

  if (!Number.isInteger(guests) || Number(guests) <= 0) {
    text.push('', 'Quantas pessoas vão se hospedar, contando adultos e crianças? Assim posso indicar acomodações para esse pacote.');
    return text.join('\n');
  }

  text.push(`👥 *Ocupação:* ${guests} hóspede${guests === 1 ? '' : 's'}, contando adultos e crianças.`);
  const family = familyAccommodation(state, Number(guests));
  if (family.pending) return text.join('\n') + '\n\n' + familyAgeQuestion;
  const { prices, label } = packagePrices(pkg, rooms);
  const knownRooms = new Set(rooms.map(room => String(room.id)));
  const compatible = prices.filter(item =>
    knownRooms.has(item.id)
    && Number.isInteger(item.capacity)
    && baseRoomCapacity(Number(item.capacity)) + Math.min(1,family.eligible) >= Number(guests)
    && Number.isFinite(item.price)
    && item.price > 0
  );
  const disclaimer = '\n\nEsses valores são informativos, sem confirmar disponibilidade ou reserva. A recepção confirma as condições e a disponibilidade da opção escolhida.';
  if (!compatible.length) {
    if (family.children) text.push('',familyRoomExplanation(Number(guests),family.eligible,true));
    text.push('', 'Não encontrei valores e capacidades cadastrados suficientes para recomendar uma acomodação para esse grupo nesse pacote. A recepção pode conferir as opções.');
    return text.join('\n') + disclaimer;
  }

  text.push('', 'Para comparar as acomodações com capacidade para o seu grupo:', label);
  const coupleWithChild = guests === 3 && family.children === 1 && family.eligible === 1;
  if (coupleWithChild) compatible.sort((a,b)=>Number(b.capacity===2)-Number(a.capacity===2));
  let result = text.join('\n');
  const seen = new Set<string>();
  for (const option of compatible) {
    if (seen.has(option.id)) continue;
    const prefix = coupleWithChild ? (option.capacity === 2 ? 'Categoria Casal, com a criança em cortesia' : 'Categoria maior opcional') : seen.size ? 'Outra opção' : 'Opção premium (maior valor cadastrado)';
    const capacity = baseRoomCapacity(Number(option.capacity));
    const line = `\n• ${prefix}: *${displayText(option.name, 120)}* — ${money(option.price)}; capacidade de ${capacity} hóspedes${family.eligible ? ' mais 1 criança de até 6 anos em cortesia' : ''}.`;
    if (result.length + line.length + disclaimer.length > 1800) break;
    result += line;
    seen.add(option.id);
  }
  return result + (family.children ? '\n\n'+familyRoomExplanation(Number(guests),family.eligible) : '') + disclaimer;
}
