import { familyAccommodation, familyAgeQuestionFor, baseRoomCapacity, familyRoomExplanation } from './familyAccommodation.js';

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
        // Nightly rates such as 3.166,67 add up to 9.500,01. Round like the
        // quote engine (motorStayPricing) so both show the same total.
        price: Math.round(total),
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

/** Sale conditions the caller confirmed for this package (e.g. Réveillon 10% à vista). */
export type PackageSaleTerms = { cashDiscountPct?: number; siteUrl?: string };

/** Sales card for a known group: the cheapest compatible option first, with
 * payment conditions, the other options and a closing question. */
export function packageRecommendation(
  pkg: PackagePricingRecord,
  rooms: PackageRoomRecord[],
  guests?: number,
  state?: unknown,
  terms: PackageSaleTerms = {},
): string {
  const name = displayText(pkg.name || 'Pacote especial', 150);
  const start = displayDate(pkg.start_iso_date);
  const end = displayDate(pkg.end_iso_date);
  const text = [`🎉 *${name}*`];

  if (!Number.isInteger(guests) || Number(guests) <= 0) {
    if (start && end) text.push(`📅 *Período do pacote:* ${start} a ${end}`);
    text.push('', 'Quantas pessoas vão se hospedar, contando adultos e crianças? Assim posso indicar acomodações para esse pacote.');
    return text.join('\n');
  }

  const nights = pkg.start_iso_date && pkg.end_iso_date
    ? Math.round((Date.parse(`${pkg.end_iso_date}T12:00:00Z`) - Date.parse(`${pkg.start_iso_date}T12:00:00Z`)) / 86400000) : 0;
  const period = start && end ? `${start} a ${end}${nights > 0 ? ` · ${nights} ${nights === 1 ? 'noite' : 'noites'}` : ''} · ` : '';
  text.push(`📅 ${period}${guests} ${guests === 1 ? 'hóspede' : 'hóspedes'}`);
  const family = familyAccommodation(state, Number(guests));
  if (family.pending) return text.join('\n') + '\n\n' + familyAgeQuestionFor(state);
  const { prices } = packagePrices(pkg, rooms);
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

  const seen = new Set<string>();
  const options = [...compatible].sort((a, b) => a.price - b.price)
    .filter(option => !seen.has(option.id) && !!seen.add(option.id));
  const best = options[0];
  const installments = Number(pkg.max_installments || 0) > 1 ? Number(pkg.max_installments) : 0;
  const cashPct = Number(terms.cashDiscountPct || 0) > 0 ? Number(terms.cashDiscountPct) : 0;
  const pay = [
    installments ? `em até ${installments}x de ${money(best.price / installments)} no cartão` : '',
    cashPct ? `${money(best.price * (1 - cashPct / 100))} à vista (${cashPct}% de desconto)` : '',
  ].filter(Boolean).join(' ou ');
  const bestName = displayText(best.name, 120);
  const coupleWithChild = guests === 3 && family.children === 1 && family.eligible === 1 && best.capacity === 2;
  text.push('', `⭐ *Indicada para vocês: ${bestName}* — *${money(best.price)}*${coupleWithChild ? ', com a criança em cortesia' : ''}`);
  if (pay) text.push(`💳 ${pay.charAt(0).toUpperCase()}${pay.slice(1)}`);
  if (family.eligible) text.push('👶 1 criança de até 6 anos em cortesia por apartamento (não paga); berço ou cama extra sem custo, conforme disponibilidade.');
  else if (family.children) text.push('Todos contam na ocupação normal do apartamento; a cortesia é só para criança de até 6 anos.');
  const site = terms.siteUrl || `https://reservas.hotelsolar.tur.br/?pacote=${encodeURIComponent(pkg.id)}`;
  const closing = [
    '', 'Valores por apartamento (não por pessoa), para o pacote completo, sujeitos à disponibilidade.',
    `👉 Reserve pelo site: ${site}`,
    `Prefere a ${bestName} ou outra opção? Me diga qual que eu preparo o resumo para você confirmar.`,
  ].join('\n');
  let result = text.join('\n');
  if (options.length > 1) result += '\n\nOutras opções para o seu grupo:';
  for (const option of options.slice(1)) {
    const line = `\n• ${displayText(option.name, 120)} — ${money(option.price)}`;
    if (result.length + line.length + closing.length > 1800) break;
    result += line;
  }
  return result + '\n' + closing;
}

const normChoice = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^\w\s.,]/g, ' ').replace(/\s+/g, ' ').trim();
const cardMoney = (value: string) => Number(value.replace(/\./g, '').replace(',', '.'));

/** The option a customer picks right after the sales card of
 * packageRecommendation: "sim"/"pode ser" takes the indicated one; a category
 * name, its total or "a mais barata" picks that line. Anything hesitant,
 * a question or an ambiguous reference is not a choice. */
export function packageCardChoice(message: string, cardText: string): {name: string; price: number} | undefined {
  const best = /⭐ \*Indicada para vocês: (.+?)\* — \*R\$ ([\d.]+,\d{2})\*/.exec(cardText);
  if (!best) return;
  const options = [{name: best[1], price: cardMoney(best[2])}];
  const others = cardText.split('Outras opções para o seu grupo:')[1] || '';
  for (const line of others.matchAll(/^• (.+?) — R\$ ([\d.]+,\d{2})$/gm)) options.push({name: line[1], price: cardMoney(line[2])});
  const s = normChoice(message);
  if (!s || s.length > 80 || message.includes('?')) return;
  if (/\b(?:nao|talvez|pensar|depois|ainda|caro|cara|vou ver|verificar|consultar|quanto|qual|quais|como|somos|seremos|pessoas?|adult[oa]s?|criancas?|filh[oa]s?)\b/.test(s)) return;
  const distinct = (name: string) => normChoice(name).replace(/\bsuite\b/g, '').trim();
  // "Só um casal" describes the group; a long message names a room only with a choice verb.
  const choosing = /\b(?:quero|prefiro|escolho|escolhi|fico com|vou de|vamos de|pode ser|reservar|fechar)\b/.test(s);
  const groupWords = /\b(?:um|uma|o|so|somos|para|pra|sendo)\s+(?:um\s+)?casal\b/.test(s) && !/\bsuite casal\b/.test(s);
  const byName = s.length > 40 && !choosing ? [] : options.filter(option => {
    if (groupWords && /\bcasal\b/.test(distinct(option.name))) return false;
    const words = distinct(option.name).split(' ').filter(word => word.length > 3 && !['vista', 'terreo'].includes(word));
    return words.some(word => new RegExp(`\\b${word}\\b`).test(s))
      || /\bvista mar\b/.test(distinct(option.name)) && /\bvista (?:para o |pro |pra o |do |ao )?mar\b/.test(s);
  });
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) return;
  const amounts = [...s.matchAll(/\b\d{1,3}(?:\.\d{3})+(?:,\d{2})?\b|\b\d{4,5}\b/g)].map(match => cardMoney(match[0].replace(/,\d{2}$/, '')));
  if (amounts.length) {
    const byPrice = options.filter(option => amounts.includes(Math.round(option.price)));
    return byPrice.length === 1 ? byPrice[0] : undefined;
  }
  if (/\b(?:mais barat[oa]|mais em conta|mais economic[oa]|a indicada|primeira opcao|a primeira)\b/.test(s)) return options[0];
  // A bare acceptance of the indicated option, nothing else in the message.
  const bare = s.replace(/[.,!]+/g, ' ').replace(/\b(?:ok|okay|entao|sim|por favor|obrigad[oa]|pode|quero|essa|esse|ela|mesmo|mesma|ai|isso|vamos|bora|ser|seguir|preparar|fechar|fechado|reservar|perfeito|claro|com certeza|aceito|otimo|beleza|show|com|a|o)\b/g, '').trim();
  if (!bare && /\b(?:sim|pode ser|quero|essa|esse|fechado|fechar|vamos|bora|pode seguir|pode preparar|perfeito|aceito|reservar)\b/.test(s)) return options[0];
  return;
}
