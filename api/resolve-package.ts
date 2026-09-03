import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

type PackageRecord = {
  id: string;
  name?: string;
  description?: string;
  location?: string;
  image_url?: string;
  includes?: string[];
  benefits?: string[];
  start_iso_date?: string;
  end_iso_date?: string;
  room_prices?: Array<{ roomId?: string; room_id?: string; price?: number }>;
  full_period_discount_pct?: number;
  full_period_required?: boolean;
  max_installments?: number;
  no_checkin_dates?: string[];
  no_checkout_dates?: string[];
};

type RoomRecord = {
  id: string;
  name?: string;
  capacity?: number;
  base_price?: number;
  overrides?: Array<{ dateIso?: string; date_iso?: string; price?: number }>;
};

const MONTHS = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const STOP_WORDS = new Set([
  'a', 'ao', 'aos', 'as', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'no', 'nos',
  'na', 'nas', 'o', 'os', 'para', 'por', 'um', 'uma', 'quero', 'saber', 'sobre',
  'qual', 'quais', 'como', 'tem', 'hotel', 'solar', 'pacote', 'pacotes', 'feriado',
  'feriados', 'informacao', 'informacoes', 'detalhe', 'detalhes', 'programacao',
]);

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const tokens = (value: string) => normalize(value)
  .split(/\s+/)
  .filter(token => token.length >= 3 && !STOP_WORDS.has(token));

const formatDate = (isoDate?: string) => {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  return year && month && day ? `${day}/${month}/${year}` : isoDate;
};

const money = (value: number) => Math.round(Number(value)).toLocaleString('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fitWhatsApp = (value: string, conversational = false) => {
  const limit = 1900;
  if (value.length <= limit) return value;
  const suffix = conversational
    ? '\n\nHá mais detalhes cadastrados. Qual informação você gostaria de conhecer? Podemos continuar por aqui.'
    : '\n\nHá mais detalhes cadastrados. Peça uma informação específica ou fale com a recepção: (91) 98100-0800.';
  return `${value.slice(0, limit - suffix.length).trimEnd()}…${suffix}`;
};

const dateIsInsidePackage = (pkg: PackageRecord, day: number, monthIndex: number) => {
  if (!pkg.start_iso_date || !pkg.end_iso_date) return false;
  const start = new Date(`${pkg.start_iso_date}T12:00:00Z`);
  const end = new Date(`${pkg.end_iso_date}T12:00:00Z`);
  for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) {
    const candidate = new Date(Date.UTC(year, monthIndex, day, 12));
    if (candidate >= start && candidate <= end) return true;
  }
  return false;
};

const scorePackage = (message: string, pkg: PackageRecord) => {
  const normalizedMessage = normalize(message);
  const normalizedName = normalize(pkg.name || '');
  if (!normalizedName) return 0;

  let score = normalizedMessage.includes(normalizedName) ? 120 : 0;
  const messageTokens = new Set(tokens(message));
  const nameTokens = tokens(pkg.name || '');
  for (const token of nameTokens) {
    if (messageTokens.has(token)) score += /^\d{4}$/.test(token) ? 8 : 20;
  }

  const asksNatal = messageTokens.has('natal');
  const asksNewYear = messageTokens.has('reveillon') || messageTokens.has('virada');
  const packageHasNatal = nameTokens.includes('natal');
  const packageHasNewYear = nameTokens.includes('reveillon') || nameTokens.includes('virada');
  if (asksNatal && asksNewYear && packageHasNatal && packageHasNewYear) score += 35;
  if (asksNewYear && !asksNatal && packageHasNatal && packageHasNewYear) score -= 12;
  if (asksNatal && !asksNewYear && packageHasNatal && packageHasNewYear) score -= 12;

  MONTHS.forEach((month, monthIndex) => {
    if (!normalizedMessage.includes(month)) return;
    const dateMatches = [...normalizedMessage.matchAll(new RegExp(`(?:^|\\s)(\\d{1,2})(?:\\s+de)?\\s+${month}`, 'g'))];
    if (dateMatches.some(match => dateIsInsidePackage(pkg, Number(match[1]), monthIndex))) {
      score += 45;
      return;
    }
    const packageMonth = Number(pkg.start_iso_date?.slice(5, 7) || 0) - 1;
    if (packageMonth === monthIndex) score += 12;
  });

  return score;
};

const isPackageIntent = (message: string, bestScore: number) => {
  const normalized = normalize(message);
  return bestScore >= 20 || [
    'pacote', 'pacotes', 'feriado', 'feriados', 'programacao', 'programacao do',
  ].some(term => normalized.includes(term));
};

const formatPackageList = (packages: PackageRecord[], conversational = false) => {
  const lines = packages
    .sort((a, b) => String(a.start_iso_date || '').localeCompare(String(b.start_iso_date || '')))
    .map(pkg => {
      const period = pkg.start_iso_date && pkg.end_iso_date
        ? ` — ${formatDate(pkg.start_iso_date)} a ${formatDate(pkg.end_iso_date)}`
        : '';
      return `• *${pkg.name || 'Pacote especial'}*${period}`;
    });

  return fitWhatsApp([
    '🎉 *Pacotes ativos do Hotel Solar*',
    '',
    ...lines,
    '',
    'Qual deles você gostaria de conhecer? Posso mostrar a programação, as regras, os valores e a foto atual do pacote.',
  ].join('\n'), conversational);
};

const formatPackageDetails = (
  pkg: PackageRecord,
  rooms: RoomRecord[],
  conversational = false,
) => {
  const period = pkg.start_iso_date && pkg.end_iso_date
    ? `${formatDate(pkg.start_iso_date)} a ${formatDate(pkg.end_iso_date)}`
    : 'Consulte o período no motor de reservas';
  const items = [...(pkg.includes || []), ...(pkg.benefits || [])]
    .map(item => String(item).trim())
    .filter((item, index, all) => item && all.indexOf(item) === index);
  const roomNames = new Map(rooms.map(room => [String(room.id), room.name || 'Acomodação']));
  let prices = (pkg.room_prices || [])
    .map(item => ({
      name: roomNames.get(String(item.roomId || item.room_id || '')) || 'Acomodação',
      price: Number(item.price || 0),
    }))
    .filter(item => item.price > 0)
    .sort((a, b) => b.price - a.price);

  let priceLabel = '💰 *Valores cadastrados por acomodação:*';
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
      return { name: room.name || 'Acomodação', price: total };
    }).filter(item => item.price > 0).sort((a, b) => b.price - a.price);
    priceLabel = '💰 *Simulação cadastrada para o período completo:*';
  }

  const text: string[] = [`🎉 *${pkg.name || 'Pacote especial'}*`, `📅 *Período:* ${period}`];
  if (pkg.location) text.push(`📍 *Local:* ${pkg.location}`);
  if (pkg.description) text.push('', String(pkg.description).trim());
  if (items.length) {
    text.push('', '✨ *Programação e itens inclusos:*', ...items.map(item => `• ${item}`));
  }
  if (prices.length) {
    text.push('', priceLabel);
    prices.forEach(item => text.push(`• ${item.name}: *R$ ${money(item.price)}*`));
  }

  const legacyNewYearRule = normalize(pkg.name || '').includes('reveillon')
    && String(pkg.start_iso_date || '').endsWith('-12-31');
  const storedFullPeriodRule = (pkg.no_checkin_dates || []).includes('__FULL_PERIOD_REQUIRED__');
  const storedFreePeriodRule = (pkg.no_checkin_dates || []).includes('__FULL_PERIOD_FREE__');
  const fullPeriodRequired = !storedFreePeriodRule
    && (pkg.full_period_required === true || storedFullPeriodRule || legacyNewYearRule);
  if (fullPeriodRequired) {
    text.push('', `📌 *Regra de permanência:* este pacote é vendido somente no período completo de ${period}.`);
  } else {
    text.push('', '📌 *Regra de permanência:* pode ser solicitado por uma ou mais diárias dentro do período, conforme as tarifas cadastradas para as datas escolhidas.');
  }
  if (Number(pkg.full_period_discount_pct || 0) > 0) {
    text.push(`• Desconto para o período completo: ${Number(pkg.full_period_discount_pct)}%.`);
  }
  if (Number(pkg.max_installments || 0) > 0) {
    text.push(`• Parcelamento: em até ${Number(pkg.max_installments)}x no cartão.`);
  }
  const restrictedCheckInDates = (pkg.no_checkin_dates || [])
    .filter(date => !['__FULL_PERIOD_REQUIRED__', '__FULL_PERIOD_FREE__'].includes(date));
  if (restrictedCheckInDates.length || (pkg.no_checkout_dates || []).length) {
    text.push('• Existem restrições de entrada ou saída cadastradas para algumas datas; a recepção confirma a combinação escolhida.');
  }

  text.push(
    '',
    conversational
      ? 'Os valores acima são informativos e não confirmam disponibilidade. Podemos personalizar a simulação conforme os hóspedes e as datas da sua viagem, aproveitando o que você já informou. Se desejar prosseguir com uma opção, a recepção continuará o atendimento aqui na conversa.'
      : 'Os valores acima são informativos e não confirmam disponibilidade. Para uma simulação personalizada, informe entrada, saída e quantidade de hóspedes. A recepção confirma as vagas e finaliza a reserva pelo WhatsApp (91) 98100-0800.',
  );
  return fitWhatsApp(text.join('\n'), conversational);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Missing Supabase configuration.' });
  }

  const userMessage = String(req.body?.user_message || req.body?.message || '').trim();
  if (!userMessage) {
    return res.status(400).json({ error: 'Missing user_message.' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const [{ data: packages, error: packageError }, { data: rooms, error: roomError }] = await Promise.all([
    supabase.from('packages').select('*').eq('active', true),
    supabase.from('room_types').select('*').eq('active', true),
  ]);

  if (packageError) return res.status(500).json({ error: packageError.message });
  if (roomError) return res.status(500).json({ error: roomError.message });
  if (!packages?.length) {
    return res.status(200).json({
      quote_request: 'NO_PACKAGE',
      quote_text: 'No momento não há pacotes ativos cadastrados no motor de reservas.',
      conversation_text: 'No momento não há pacotes ativos cadastrados no motor de reservas. Posso ajudar com uma simulação de diárias: para quantas pessoas será a estadia?',
      matched: false,
    });
  }

  const ranked = (packages as PackageRecord[])
    .map(pkg => ({ pkg, score: scorePackage(userMessage, pkg) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];

  if (!isPackageIntent(userMessage, best.score)) {
    return res.status(200).json({ quote_request: 'NO_PACKAGE', quote_text: '', conversation_text: '', matched: false });
  }

  if (best.score < 20) {
    return res.status(200).json({
      quote_request: 'PACKAGE_LIST',
      quote_text: formatPackageList(packages as PackageRecord[]),
      conversation_text: formatPackageList(packages as PackageRecord[], true),
      matched: true,
      match_type: 'list',
    });
  }

  const pkg = best.pkg;
  const reference = `PACKAGE_ID|${pkg.id}`;
  return res.status(200).json({
    quote_request: reference,
    quote_text: formatPackageDetails(pkg, (rooms || []) as RoomRecord[]),
    conversation_text: formatPackageDetails(pkg, (rooms || []) as RoomRecord[], true),
    package_image_url: pkg.image_url
      ? `https://reservas.hotelsolar.tur.br/api/package-image?code=${encodeURIComponent(reference)}`
      : '',
    package_id: pkg.id,
    package_name: pkg.name || '',
    matched: true,
    match_type: 'specific',
    score: best.score,
  });
}
