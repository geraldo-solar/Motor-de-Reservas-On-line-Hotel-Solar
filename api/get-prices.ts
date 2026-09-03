import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials in environment variables.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

const FALLBACK_EXTRAS = [
  { code: 'BARCO', name: 'Passeio de Barco', price: 350, pricing: 'fixed_up_to_4' },
  { code: 'MESA', name: 'Mesa Posta', price: 180, pricing: 'fixed' },
  { code: 'LUA', name: 'Kit Lua de Mel/Celebração', price: 350, pricing: 'fixed' },
] as const;

const money = (value: number) => Math.round(value).toLocaleString('pt-BR');

const formatDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
};

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const getExtraCode = (name: string) => {
  const normalized = normalize(name);
  if (normalized.includes('barco')) return 'BARCO';
  if (normalized.includes('mesa')) return 'MESA';
  if (normalized.includes('lua') || normalized.includes('romantic')) return 'LUA';
  return null;
};

const periodsOverlap = (
  requestedCheckIn: string,
  requestedCheckOut: string,
  packageCheckIn: string,
  packageCheckOut: string
) => requestedCheckIn < packageCheckOut && requestedCheckOut > packageCheckIn;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  const body = req.body || {};
  let { checkIn, checkOut, guests } = body;
  let requestedExtraCodes: string[] = [];

  // O ManyChat envia a extração da IA em um único campo para evitar que o
  // modelo tenha qualquer participação no cálculo das tarifas.
  // Formato aceito: QUOTE|2026-09-20|2026-09-25|2|BARCO,MESA
  if ((!checkIn || !checkOut || !guests) && typeof body.quote_request === 'string') {
    const parsed = body.quote_request.match(
      /QUOTE\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(\d{1,2})(?:\s*\|\s*([A-Z,]+))?/i
    );

    if (parsed) {
      checkIn = parsed[1];
      checkOut = parsed[2];
      guests = Number(parsed[3]);
      requestedExtraCodes = (parsed[4] || 'NONE')
        .split(',')
        .map(code => code.trim().toUpperCase())
        .filter(code => ['BARCO', 'MESA', 'LUA'].includes(code));
    }
  }

  if (Array.isArray(body.extras)) {
    requestedExtraCodes = body.extras
      .map((code: unknown) => String(code).trim().toUpperCase())
      .filter((code: string) => ['BARCO', 'MESA', 'LUA'].includes(code));
  }

  if (!checkIn || !checkOut || !guests) {
    return res.status(400).json({
      error: 'Missing or invalid quote data.',
      expected_format: 'QUOTE|YYYY-MM-DD|YYYY-MM-DD|GUESTS|BARCO,MESA,LUA or NONE'
    });
  }

  try {
    const ci = new Date(`${checkIn}T12:00:00Z`);
    const co = new Date(`${checkOut}T12:00:00Z`);
    const guestCount = Number(guests);

    if (
      Number.isNaN(ci.getTime()) ||
      Number.isNaN(co.getTime()) ||
      !Number.isInteger(guestCount) ||
      guestCount < 1 ||
      guestCount > 20
    ) {
      return res.status(400).json({ error: 'Invalid dates or guest count.' });
    }
    
    // Calcula o número de diárias
    const diffTime = Math.abs(co.getTime() - ci.getTime());
    const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (nights <= 0 || nights > 30) {
      return res.status(400).json({ error: 'Check-out date must be after check-in date.' });
    }

    // Busca preços do Supabase. O orçamento é uma simulação comercial e não
    // consulta estoque, bloqueios, restrições de check-in ou disponibilidade.
    const { data: rooms } = await supabase.from('room_types').select('*').eq('active', true);
    const { data: packages } = await supabase.from('packages').select('*').eq('active', true);
    const { data: extras } = await supabase.from('extras').select('*').eq('active', true);

    if (!rooms) {
      return res.status(500).json({ error: 'Failed to fetch rooms from Supabase.' });
    }

    // A regra de período completo é lida do próprio cadastro do pacote. O
    // fallback do Réveillon preserva a regra atual até o pacote ser salvo uma
    // vez no editor novo, que passa a gravar explicitamente Obrigatório/Livre.
    const fullPeriodPackage = packages?.find(pkg => {
      const storedRule = Array.isArray(pkg.no_checkin_dates)
        && pkg.no_checkin_dates.includes('__FULL_PERIOD_REQUIRED__');
      const storedFreeRule = Array.isArray(pkg.no_checkin_dates)
        && pkg.no_checkin_dates.includes('__FULL_PERIOD_FREE__');
      const legacyNewYearRule = normalize(pkg.name || '').includes('reveillon')
        && String(pkg.start_iso_date || '').endsWith('-12-31');
      const requiresFullPeriod = !storedFreeRule
        && (pkg.full_period_required === true || storedRule || legacyNewYearRule);
      return requiresFullPeriod
        && periodsOverlap(checkIn, checkOut, pkg.start_iso_date, pkg.end_iso_date);
    });
    if (
      fullPeriodPackage &&
      (checkIn !== fullPeriodPackage.start_iso_date || checkOut !== fullPeriodPackage.end_iso_date)
    ) {
      const fullPeriodText = `🎆 O pacote ${fullPeriodPackage.name} é vendido somente no período completo, de ${formatDate(fullPeriodPackage.start_iso_date)} a ${formatDate(fullPeriodPackage.end_iso_date)} (${Math.round((new Date(`${fullPeriodPackage.end_iso_date}T12:00:00Z`).getTime() - new Date(`${fullPeriodPackage.start_iso_date}T12:00:00Z`).getTime()) / (1000 * 60 * 60 * 24))} diárias). Não fazemos simulação parcial dentro desse período. Para calcular o pacote completo ou esclarecer alguma condição, fale com a recepção: (91) 98100-0800.`;

      return res.status(200).json({
        message: 'Restricted package period',
        whatsapp_text: fullPeriodText,
        prices_summary: fullPeriodText,
        availability_checked: false,
        requires_human_confirmation: true,
        policy_restriction: 'package_full_period_only',
        required_check_in: fullPeriodPackage.start_iso_date,
        required_check_out: fullPeriodPackage.end_iso_date,
      });
    }

    // Verifica se algum pacote ativo casa exatamente com as datas pesquisadas
    const activePackage = packages?.find(p => p.start_iso_date === checkIn && p.end_iso_date === checkOut);

    let summaryText = `Simulação para ${nights} ${nights === 1 ? 'diária' : 'diárias'} (${formatDate(checkIn)} a ${formatDate(checkOut)}), ${guestCount} ${guestCount === 1 ? 'hóspede' : 'hóspedes'}:\n\n`;
    let whatsappText = `☀️ Fiz uma simulação para ${nights} ${nights === 1 ? 'diária' : 'diárias'}, de ${formatDate(checkIn)} a ${formatDate(checkOut)}, para ${guestCount} ${guestCount === 1 ? 'hóspede' : 'hóspedes'}:\n\n`;

    if (activePackage) {
      let pkgInfo = `\n🎉 PACOTE ESPECIAL ATIVO: ${activePackage.name}\n`;
      if (activePackage.description) pkgInfo += `Detalhes: ${activePackage.description}\n`;
      if (activePackage.benefits && activePackage.benefits.length > 0) {
        pkgInfo += `Benefícios Inclusos:\n- ${activePackage.benefits.join('\n- ')}\n`;
      }
      if (activePackage.includes && activePackage.includes.length > 0) {
        pkgInfo += `Programação/Inclusos:\n- ${activePackage.includes.join('\n- ')}\n`;
      }
      summaryText = pkgInfo + '\n' + summaryText;
      whatsappText += `🎉 Pacote especial: ${activePackage.name}\n\n`;
    }

    const activePackageItems = [
      ...(activePackage?.includes || []),
      ...(activePackage?.benefits || []),
      activePackage?.description || '',
    ].map((item: string) => normalize(item));
    const packageIncludesBoat = activePackageItems.some((item: string) =>
      item.includes('barco') || item.includes('catamara')
    );

    const configuredExtras = FALLBACK_EXTRAS.map(fallback => {
      const databaseExtra = extras?.find(extra => getExtraCode(extra.name || '') === fallback.code);
      return databaseExtra
        ? {
            ...fallback,
            name: databaseExtra.name,
            // O valor do barco é uma regra comercial por grupo e prevalece
            // sobre cadastros antigos por pessoa que ainda possam existir.
            price: fallback.code === 'BARCO' ? fallback.price : Number(databaseExtra.price),
          }
        : fallback;
    });

    const selectedExtras = configuredExtras.filter(extra => requestedExtraCodes.includes(extra.code));
    const extrasTotal = selectedExtras.reduce((total, extra) => (
      total + (extra.code === 'BARCO' && packageIncludesBoat ? 0 : extra.price)
    ), 0);

    const allRoomQuotes: Array<{ name: string; capacity: number; finalPrice: number }> = [];

    for (const room of rooms) {
      const capacity = Number(room.capacity || 0);
      if (!capacity) continue;

      let total = 0;
      const current = new Date(ci);

      for (let i = 0; i < nights; i++) {
        const iso = current.toISOString().split('T')[0];
        const override = room.overrides?.find((o: any) => o.dateIso === iso);
        total += override?.price !== undefined ? override.price : room.base_price;
        current.setDate(current.getDate() + 1);
      }

      let finalPrice = total;
      if (activePackage && activePackage.discount_percentage) {
        finalPrice = total * (1 - (activePackage.discount_percentage / 100));
      }

      allRoomQuotes.push({ name: room.name, capacity, finalPrice });
    }

    // Acomodação premium primeiro: entre as opções compatíveis, apresenta os
    // maiores valores antes das opções econômicas para favorecer o upsell.
    const roomQuotes = allRoomQuotes.filter(room => guestCount <= room.capacity);
    roomQuotes.sort((a, b) => b.finalPrice - a.finalPrice);

    if (roomQuotes.length === 0) {
      const maxCapacity = Math.max(...allRoomQuotes.map(room => room.capacity));
      const roomsNeeded = Math.ceil(guestCount / maxCapacity);
      const combinations: Array<{
        rooms: typeof allRoomQuotes;
        capacity: number;
        finalPrice: number;
      }> = [];

      const buildCombinations = (startIndex: number, selected: typeof allRoomQuotes) => {
        if (selected.length === roomsNeeded) {
          const capacity = selected.reduce((sum, room) => sum + room.capacity, 0);
          if (capacity >= guestCount) {
            combinations.push({
              rooms: [...selected],
              capacity,
              finalPrice: selected.reduce((sum, room) => sum + room.finalPrice, 0),
            });
          }
          return;
        }

        for (let index = startIndex; index < allRoomQuotes.length; index++) {
          buildCombinations(index, [...selected, allRoomQuotes[index]]);
        }
      };

      buildCombinations(0, []);

      const minimumSpareBeds = Math.min(
        ...combinations.map(combination => combination.capacity - guestCount)
      );
      const recommendedCombinations = combinations
        .filter(combination => combination.capacity - guestCount === minimumSpareBeds)
        .sort((a, b) => b.finalPrice - a.finalPrice)
        .slice(0, 3);

      whatsappText += `Para acomodar bem ${guestCount} hóspedes, estas são as combinações com melhor aproveitamento dos apartamentos:\n\n`;
      recommendedCombinations.forEach((combination, index) => {
        const roomCounts = combination.rooms.reduce<Record<string, number>>((counts, room) => {
          counts[room.name] = (counts[room.name] || 0) + 1;
          return counts;
        }, {});
        const description = Object.entries(roomCounts)
          .map(([name, quantity]) => `${quantity}x ${name}`)
          .join(' + ');
        const combinedTotal = combination.finalPrice + extrasTotal;

        summaryText += `- ${index === 0 ? '⭐ Recomendação premium — ' : ''}${description}: R$ ${money(combination.finalPrice)} em hospedagem`;
        whatsappText += `${index === 0 ? '⭐ *Recomendação premium*\n' : ''}• ${description}: *R$ ${money(combination.finalPrice)}* em hospedagem`;
        if (extrasTotal > 0) {
          summaryText += `; R$ ${money(combinedTotal)} com os extras escolhidos`;
          whatsappText += ` — *R$ ${money(combinedTotal)}* com os extras escolhidos`;
        }
        summaryText += '.\n';
        whatsappText += '.\n\n';
      });
    } else {
      roomQuotes.forEach((room, index) => {
        const premiumLabel = index === 0 ? '⭐ Recomendação premium — ' : '';
        summaryText += `- ${premiumLabel}${room.name} (até ${room.capacity} pessoas): R$ ${money(room.finalPrice)} em hospedagem`;
        whatsappText += `${index === 0 ? '⭐ *Recomendação premium*\n' : ''}• ${room.name} (até ${room.capacity} pessoas): *R$ ${money(room.finalPrice)}* em hospedagem`;
        if (extrasTotal > 0) {
          summaryText += `; R$ ${money(room.finalPrice + extrasTotal)} com os extras escolhidos`;
          whatsappText += ` — *R$ ${money(room.finalPrice + extrasTotal)}* com os extras escolhidos`;
        }
        summaryText += '.\n';
        whatsappText += '.\n\n';
      });
    }

    if (selectedExtras.length > 0) {
      whatsappText += `✨ *Extras escolhidos*\n`;
      selectedExtras.forEach(extra => {
        if (extra.code === 'BARCO' && packageIncludesBoat) {
          whatsappText += `• ${extra.name}: já incluído no pacote, sem cobrança adicional\n`;
          return;
        }
        const unit = extra.pricing === 'fixed_up_to_4'
          ? ' por grupo de até 4 pessoas; acima disso, consulte a recepção'
          : '';
        whatsappText += `• ${extra.name}: R$ ${money(extra.price)}${unit}\n`;
      });
      whatsappText += extrasTotal > 0
        ? `*Total dos extras: R$ ${money(extrasTotal)}*\n\n`
        : '*Nenhuma cobrança adicional de extras.*\n\n';
    } else {
      whatsappText += `✨ Para tornar a experiência ainda mais especial, você pode acrescentar:\n`;
      configuredExtras
        .filter(extra => !(extra.code === 'BARCO' && packageIncludesBoat))
        .forEach(extra => {
        const unit = extra.pricing === 'fixed_up_to_4' ? ' por grupo de até 4 pessoas' : '';
        whatsappText += `• ${extra.name}: R$ ${money(extra.price)}${unit}\n`;
      });
      if (packageIncludesBoat) {
        whatsappText += '• Passeio de Barco: já incluído no pacote\n';
      }
      whatsappText += '\n';
    }

    whatsappText += '🚲 Bicicletas: cortesia da Cia. Marítima e do Hotel Solar, exclusiva para hóspedes. Retirada na recepção.\n\n';

    const handoffText = 'Esta é uma simulação de valores e não confirma disponibilidade. Para consultar vagas e finalizar a reserva, fale com a recepção pelo WhatsApp: (91) 98100-0800.';
    summaryText += `\n${handoffText}`;
    whatsappText += `⚠️ ${handoffText}`;

    const safeSummary = summaryText.replace(/\n/g, " ||| ");

    return res.status(200).json({ 
        message: 'Success', 
        prices_summary: safeSummary,
        whatsapp_text: whatsappText,
        discount_applied: activePackage ? true : false,
        package_name: activePackage ? activePackage.name : null,
        check_in: checkIn,
        check_out: checkOut,
        guests: guestCount,
        nights,
        availability_checked: false,
        requires_human_confirmation: true,
        extras_total: extrasTotal,
        selected_extras: selectedExtras.map(extra => extra.code),
        recommendation_order: 'highest_compatible_price_first'
    });

  } catch (error: any) {
    console.error("API Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
