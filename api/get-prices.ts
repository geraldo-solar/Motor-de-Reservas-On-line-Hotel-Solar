import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { withDailyGreeting } from '../utils/dailyGreeting.js';
import { familyAccommodation, baseRoomCapacity, familyAgeQuestionFor, familyRoomExplanation, coupleRoomConfigurationText } from '../utils/familyAccommodation.js';
import { explicitPackageBoatBenefit, safeBoatPackageCopy } from '../utils/extraMedia.js';
import {motorStayPrice,motorStayRestriction,requiresFullPackagePeriod} from '../utils/motorStayPricing.js';
import {readPackageStayQuery} from '../utils/packageStayQuery.js';
import {packageToday} from '../utils/packageAvailability.js';
import {readStayDatePending,stayDateClarification} from '../utils/stayDuration.js';

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
  const sendJson = res.json.bind(res);
  res.json = ((payload: any) => sendJson(withDailyGreeting(payload, req.body?.state))) as typeof res.json;
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
    const diffTime = co.getTime() - ci.getTime();
    const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (nights <= 0 || nights > 30 || ci.toISOString().slice(0, 10) !== checkIn || co.toISOString().slice(0, 10) !== checkOut) {
      return res.status(400).json({ error: 'Check-out date must be after check-in date.' });
    }
    let state: any;
    try { state = typeof body.state === 'string' ? JSON.parse(body.state) : body.state; } catch { state = undefined; }
    // The conversational integration may not quote a fixed third-party boat
    // price. Preserve the public motor's existing explicit-date API behavior.
    const conversationQuote = typeof body.quote_request === 'string' || state?.version === 2;
    if(state?.version===2&&state.flexible_stay){
      const answer='Escolha primeiro uma das opções de datas, ou informe entrada e saída. A busca por datas econômicas não confirma um período nem autoriza reutilizar a cotação anterior.';
      return res.status(200).json({quote_request:'NOQUOTE',quote_state:'',can_collect:'NAO',conversation_text:answer,
        whatsapp_text:answer,prices_summary:answer,availability_checked:false,requires_human_confirmation:true});
    }
    if(state?.version===2&&state.stay_date_pending){
      // Even a stale/raw state with the old dates restored cannot bypass the
      // unresolved date question by calling the pricing endpoint directly.
      const pending=readStayDatePending(state.stay_date_pending);
      const answer=pending?stayDateClarification(pending):'Quais são as novas datas de entrada e saída? Preciso confirmar o período antes de recalcular os valores.';
      return res.status(200).json({quote_request:'NOQUOTE',quote_state:'',can_collect:'NAO',conversation_text:answer,
        whatsapp_text:answer,prices_summary:answer,availability_checked:false,requires_human_confirmation:true});
    }
    if(conversationQuote&&checkIn<packageToday()){
      const answer='Esse período já passou. Não vou reutilizar tarifas ou pacotes antigos. Quais são as novas datas de entrada e saída que deseja consultar?';
      return res.status(200).json({quote_request:'NOQUOTE',quote_state:'',can_collect:'NAO',conversation_text:answer,
        whatsapp_text:answer,prices_summary:answer,availability_checked:false,requires_human_confirmation:true});
    }
    const family = familyAccommodation(state, guestCount);
    const familyDatesMismatch = (state?.version === 2 || !!state?.family_party?.children) && (state?.facts?.guests !== guestCount
      || state?.facts?.check_in !== checkIn || state?.facts?.check_out !== checkOut);
    if (family.pending || familyDatesMismatch) {
      const answer = familyDatesMismatch
        ? state?.family_party?.age_subject === 'offspring'
          ? 'Preciso conferir as datas e a composição da família antes de simular. Quais são as datas de entrada e saída e quantas pessoas vão se hospedar? ' + familyAgeQuestionFor(state)
          : 'Preciso conferir os dados atuais antes de simular. Quais são as datas de entrada e saída e quantas pessoas vão se hospedar? Se houver crianças, informe também suas idades.'
        : familyAgeQuestionFor(state);
      return res.status(200).json({quote_request:'NOQUOTE',quote_state:'',can_collect:'NAO',
        conversation_text:answer,whatsapp_text:answer,prices_summary:answer,
        availability_checked:false,requires_human_confirmation:true});
    }
    if (state?.version === 2) {
      const extraKey = (codes: unknown) => [...new Set(Array.isArray(codes)
        ? codes.filter(code => typeof code === 'string' && ['BARCO','MESA','LUA'].includes(code)) : [])].sort().join(',');
      if (extraKey(state?.facts?.extras) !== extraKey(requestedExtraCodes)) {
        const answer = 'Antes de simular, confirme quais extras deseja incluir, ou se prefere somente a hospedagem.';
        return res.status(200).json({quote_request:'NOQUOTE',quote_state:'',can_collect:'NAO',
          conversation_text:answer,whatsapp_text:answer,prices_summary:answer,
          availability_checked:false,requires_human_confirmation:true});
      }
    }

    // Busca preços do Supabase. O orçamento é uma simulação comercial e não
    // consulta estoque nem confirma disponibilidade; respeita as restrições
    // comerciais de entrada/saída e fechamento cadastradas no mesmo motor.
    const { data: rooms, error: roomError } = await supabase.from('room_types').select('*').eq('active', true);
    const { data: packages, error: packageError } = await supabase.from('packages').select('*').eq('active', true);
    const { data: extras } = await supabase.from('extras').select('*').eq('active', true);

    if (!rooms || roomError || !packages || packageError) {
      return res.status(500).json({ error: 'Failed to fetch rooms from Supabase.' });
    }
    if(state?.version===2&&state.package_stay_query){
      const query=readPackageStayQuery(state.package_stay_query,state.package_context);
      if(!query||!packages.some(pkg=>pkg.id===query.package_id&&pkg.start_iso_date===state.package_context.start_date&&pkg.end_iso_date===state.package_context.end_date)){
        const answer='Preciso consultar o cadastro atual do pacote antes de recalcular essas datas. Qual pacote deseja consultar?';
        return res.status(200).json({quote_request:'NOQUOTE',quote_state:'',can_collect:'NAO',conversation_text:answer,
          whatsapp_text:answer,prices_summary:answer,availability_checked:false,requires_human_confirmation:true});
      }
    }

    // A regra de período completo é lida do próprio cadastro do pacote. O
    // fallback do Réveillon preserva a regra atual até o pacote ser salvo uma
    // vez no editor novo, que passa a gravar explicitamente Obrigatório/Livre.
    const fullPeriodPackage = packages?.find(pkg => {
      return requiresFullPackagePeriod(pkg)
        && periodsOverlap(checkIn, checkOut, pkg.start_iso_date, pkg.end_iso_date);
    });
    if (
      fullPeriodPackage &&
      (checkIn > fullPeriodPackage.start_iso_date || checkOut < fullPeriodPackage.end_iso_date)
    ) {
      const fullPeriodText = `🎆 O pacote ${fullPeriodPackage.name} exige incluir o período completo, de ${formatDate(fullPeriodPackage.start_iso_date)} a ${formatDate(fullPeriodPackage.end_iso_date)} (${Math.round((new Date(`${fullPeriodPackage.end_iso_date}T12:00:00Z`).getTime() - new Date(`${fullPeriodPackage.start_iso_date}T12:00:00Z`).getTime()) / (1000 * 60 * 60 * 24))} diárias). É possível simular diárias adicionais antes ou depois, respeitando as restrições do motor. O período pedido não inclui todas as noites obrigatórias; não confirmei essas datas. Para calcular o pacote completo ou esclarecer alguma condição, fale com a recepção: (91) 98100-0800.`;

      return res.status(200).json({
        message: 'Restricted package period',
        whatsapp_text: fullPeriodText,
        conversation_text: fullPeriodText.replace('Para calcular o pacote completo ou esclarecer alguma condição, fale com a recepção: (91) 98100-0800.', 'Quer que eu apresente as acomodações e os valores para esse período completo?'),
        prices_summary: fullPeriodText,
        availability_checked: false,
        requires_human_confirmation: true,
        policy_restriction: 'package_full_period_only',
        quote_request:'NOQUOTE',quote_state:'',can_collect:'NAO',
        required_check_in: fullPeriodPackage.start_iso_date,
        required_check_out: fullPeriodPackage.end_iso_date,
      });
    }

    // Verifica se algum pacote ativo casa exatamente com as datas pesquisadas
    const exactPackage = packages.find(p => p.start_iso_date === checkIn && p.end_iso_date === checkOut);
    const activePackage = exactPackage || fullPeriodPackage;
    const permittedRooms=rooms.filter(room=>!motorStayRestriction(room,checkIn,checkOut));
    if(!permittedRooms.length){
      const answer=`O motor tem uma restrição de entrada, saída ou funcionamento para ${formatDate(checkIn)} a ${formatDate(checkOut)}. Não vou apresentar esse período como permitido nem confirmar disponibilidade. Quais outras datas você gostaria de consultar?`;
      return res.status(200).json({quote_request:'NOQUOTE',quote_state:'',can_collect:'NAO',
        policy_restriction:'motor_date_restriction',conversation_text:answer,whatsapp_text:answer,prices_summary:answer,
        availability_checked:false,requires_human_confirmation:true});
    }

    let summaryText = `Simulação para ${nights} ${nights === 1 ? 'diária' : 'diárias'} (${formatDate(checkIn)} a ${formatDate(checkOut)}), ${guestCount} ${guestCount === 1 ? 'hóspede' : 'hóspedes'}:\n\n`;
    let whatsappText = `☀️ Fiz uma simulação para ${nights} ${nights === 1 ? 'diária' : 'diárias'}, de ${formatDate(checkIn)} a ${formatDate(checkOut)}, para ${guestCount} ${guestCount === 1 ? 'hóspede' : 'hóspedes'}:\n\n`;

    if (activePackage) {
      const displayPackage = conversationQuote ? safeBoatPackageCopy(activePackage) : activePackage;
      let pkgInfo = `\n🎉 PACOTE ESPECIAL ATIVO: ${activePackage.name}\n`;
      if (displayPackage.description) pkgInfo += `Detalhes: ${displayPackage.description}\n`;
      if (displayPackage.benefits && displayPackage.benefits.length > 0) {
        pkgInfo += `Benefícios Inclusos:\n- ${displayPackage.benefits.join('\n- ')}\n`;
      }
      if (displayPackage.includes && displayPackage.includes.length > 0) {
        pkgInfo += `Programação/Inclusos:\n- ${displayPackage.includes.join('\n- ')}\n`;
      }
      summaryText = pkgInfo + '\n' + summaryText;
      whatsappText += `🎉 Pacote especial: ${activePackage.name}\n\n`;
    }

    const activePackageItems = [
      ...(activePackage?.includes || []),
      ...(activePackage?.benefits || []),
      activePackage?.description || '',
    ].map((item: string) => normalize(item));
    const packageIncludesBoat = conversationQuote ? explicitPackageBoatBenefit(activePackage)
      : activePackageItems.some((item: string) => item.includes('barco') || item.includes('catamara'));

    if (conversationQuote && requestedExtraCodes.includes('BARCO') && !packageIncludesBoat) {
      const answer = 'O passeio de barco é realizado por terceiros, sob consulta. Valores, horários, duração e disponibilidade precisam ser consultados com a recepção; não incluí um preço fixo de passeio nesta simulação. Para continuar a simulação da hospedagem sem o passeio, diga “retirar o passeio de barco”. O passeio poderá ser tratado separadamente com a recepção.';
      return res.status(200).json({ quote_request: 'NOQUOTE', quote_state: '', can_collect: 'NAO',
        conversation_text: answer, whatsapp_text: answer, prices_summary: answer,
        availability_checked: false, requires_human_confirmation: true });
    }

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

    const allRoomQuotes: Array<{ name: string; capacity: number; base_capacity: number; finalPrice: number }> = [];

    for (const room of permittedRooms) {
      const base_capacity = baseRoomCapacity(Number(room.capacity || 0));
      if (!base_capacity) continue;
      const capacity = base_capacity + Math.min(1, family.eligible);

      const finalPrice=motorStayPrice(room,checkIn,checkOut,exactPackage);
      if(!Number.isFinite(finalPrice)||finalPrice<=0)continue;

      allRoomQuotes.push({ name: room.name, capacity, base_capacity, finalPrice });
    }
    if(!allRoomQuotes.length)return res.status(500).json({error:'No valid room tariffs for the requested stay.'});

    // Acomodação premium primeiro: entre as opções compatíveis, apresenta os
    // maiores valores antes das opções econômicas para favorecer o upsell.
    const roomQuotes = allRoomQuotes.filter(room => guestCount <= room.capacity);
    const coupleWithChild = guestCount === 3 && family.children === 1 && family.eligible === 1;
    roomQuotes.sort((a, b) => (coupleWithChild ? Number(b.base_capacity === 2) - Number(a.base_capacity === 2) : 0) || b.finalPrice - a.finalPrice);
    const quoteOptions: Array<{ name: string; capacity: number; total: number; child_allowance?: number }> = [];
    // ManyChat's plain-text block has a 2,000-character budget. Keep the
    // complete policy/extra/next-step paragraphs, but describe shared columns
    // and category groups once instead of repeating them beside every price.
    // Legacy summary/WhatsApp fields and all calculated quote data stay intact.
    let compactRoomText = '*Hospedagem no período:*\n';

    if (roomQuotes.length === 0) {
      const maxCapacity = Math.max(...allRoomQuotes.map(room => room.base_capacity));
      let roomsNeeded = Math.ceil(guestCount / maxCapacity);
      while (roomsNeeded > 1 && (roomsNeeded - 1) * maxCapacity + Math.min(roomsNeeded - 1, family.eligible) >= guestCount) roomsNeeded--;
      const combinations: Array<{
        rooms: typeof allRoomQuotes;
        capacity: number;
        finalPrice: number;
      }> = [];

      const buildCombinations = (startIndex: number, selected: typeof allRoomQuotes) => {
        if (selected.length === roomsNeeded) {
          const capacity = selected.reduce((sum, room) => sum + room.base_capacity, 0) + Math.min(selected.length, family.eligible);
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
      compactRoomText += `Combinações para ${guestCount} hóspedes:\n`;
      recommendedCombinations.forEach((combination, index) => {
        const roomCounts = combination.rooms.reduce<Record<string, number>>((counts, room) => {
          counts[room.name] = (counts[room.name] || 0) + 1;
          return counts;
        }, {});
        const description = Object.entries(roomCounts)
          .map(([name, quantity]) => `${quantity}x ${name}`)
          .join(' + ');
        const combinedTotal = combination.finalPrice + extrasTotal;
        quoteOptions.push({ name: description, capacity: combination.capacity, total: combinedTotal,
          ...(family.eligible ? {child_allowance:Math.min(combination.rooms.length,family.eligible)} : {}) });
        compactRoomText += `${index === 0 ? '⭐ Recomendação premium\n' : ''}• ${description}: *R$ ${money(combination.finalPrice)}*${extrasTotal > 0 ? `; com extras: *R$ ${money(combinedTotal)}*` : ''}\n`;

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
        quoteOptions.push({ name: room.name, capacity: room.capacity, total: room.finalPrice + extrasTotal,
          ...(family.eligible ? {child_allowance:1} : {}) });
        const label = coupleWithChild ? (room.base_capacity === 2 ? 'Categoria Casal, com a criança em cortesia' : 'Categoria maior opcional') : index === 0 ? '⭐ Recomendação premium' : '';
        const capacityLabel = family.eligible ? `até ${room.base_capacity} pessoas mais 1 criança de até 6 anos em cortesia` : `até ${room.capacity} pessoas`;
        if (coupleWithChild && (index === 0 || (room.base_capacity === 2) !== (roomQuotes[index - 1].base_capacity === 2)))
          compactRoomText += `*${room.base_capacity === 2 ? 'Categoria Casal, com a criança em cortesia' : 'Categoria maior opcional'}*\n`;
        else if (!coupleWithChild && index === 0) compactRoomText += '⭐ Recomendação premium\n';
        const compactCapacity = family.eligible ? `até ${room.base_capacity} pessoas + 1 criança` : `até ${room.capacity} pessoas`;
        compactRoomText += `• ${room.name} (${compactCapacity}): *R$ ${money(room.finalPrice)}*${extrasTotal > 0 ? `; com extras: *R$ ${money(room.finalPrice + extrasTotal)}*` : ''}\n`;
        summaryText += `- ${label ? label+' — ' : ''}${room.name} (${capacityLabel}): R$ ${money(room.finalPrice)} em hospedagem`;
        whatsappText += `${label ? '*'+label+'*\n' : ''}• ${room.name} (${capacityLabel}): *R$ ${money(room.finalPrice)}* em hospedagem`;
        if (extrasTotal > 0) {
          summaryText += `; R$ ${money(room.finalPrice + extrasTotal)} com os extras escolhidos`;
          whatsappText += ` — *R$ ${money(room.finalPrice + extrasTotal)}* com os extras escolhidos`;
        }
        summaryText += '.\n';
        whatsappText += '.\n\n';
      });
    }
    compactRoomText += '\n';

    let compactFamilyText = '';
    if (family.children) {
      const explanation = familyRoomExplanation(guestCount, family.eligible, roomQuotes.length === 0);
      summaryText += explanation + '\n';
      whatsappText += explanation + '\n\n';
      compactFamilyText = family.eligible && roomQuotes.length > 0
        ? 'A capacidade indicada soma no máximo 1 criança de até 6 anos em cortesia por apartamento; as demais pessoas contam na ocupação normal. Casal + 1 criança nessa faixa pode usar a categoria Casal pelo valor de casal; categoria maior é opcional.\n'
          + 'O berço é gratuito; para a criança de até 6 anos em cortesia há cama extra gratuita, sem obrigatoriedade de dividir cama. Solicite à recepção, que confere a disponibilidade dos itens e a compatibilidade com o apartamento. Nenhum item está reservado ou instalado.\n\n'
        : explanation + '\n\n';
    }
    const familyTextEnd = whatsappText.length;

    if (quoteOptions.some(option => /\bcasal\b/.test(normalize(option.name)))) {
      summaryText += coupleRoomConfigurationText + '\n';
      whatsappText += coupleRoomConfigurationText + '\n\n';
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
        if (conversationQuote && extra.code === 'BARCO') {
          whatsappText += '• Passeio de barco com terceiros, sob consulta. Valores, horários, duração e disponibilidade com a recepção.\n';
          return;
        }
        const unit = extra.pricing === 'fixed_up_to_4' ? ' por grupo de até 4 pessoas' : '';
        whatsappText += `• ${extra.name}: R$ ${money(extra.price)}${unit}\n`;
      });
      if (packageIncludesBoat) {
        whatsappText += '• Passeio de Barco: já incluído no pacote\n';
      }
      whatsappText += '\n';
    }

    whatsappText += '🚲 Bicicletas: cortesia da Cia. Marítima e do Hotel Solar, exclusiva para hóspedes. Retirada na recepção.\n\n';

    // The new conversational flow stays in the same WhatsApp conversation.
    // Preserve legacy response fields for integrations that still use them.
    const conversationText = `☀️ Simulação: ${formatDate(checkIn)} a ${formatDate(checkOut)} · ${nights} ${nights === 1 ? 'diária' : 'diárias'} · ${guestCount} ${guestCount === 1 ? 'hóspede' : 'hóspedes'}.\n\n`
      + (activePackage ? `🎉 Pacote especial: ${activePackage.name}\n\n` : '')
      + compactRoomText + compactFamilyText + whatsappText.slice(familyTextEnd)
      + 'Simulação sem confirmação de disponibilidade.\n\n'
      + 'Qual acomodação você prefere? Primeiro confirmaremos sua escolha; só depois pediremos os dados para a recepção continuar por aqui.';

    const handoffText = 'Esta é uma simulação de valores e não confirma disponibilidade. Para consultar vagas e finalizar a reserva, fale com a recepção pelo WhatsApp: (91) 98100-0800.';
    summaryText += `\n${handoffText}`;
    whatsappText += `⚠️ ${handoffText}`;

    const safeSummary = summaryText.replace(/\n/g, " ||| ");

    return res.status(200).json({ 
        message: 'Success', 
        prices_summary: safeSummary,
        whatsapp_text: whatsappText,
        conversation_text: conversationText,
        quote_state: JSON.stringify({ version: 1, id: crypto.randomUUID(), created_at: Date.now(), check_in: checkIn, check_out: checkOut, guests: guestCount, family_key:family.key, extras: selectedExtras.map(extra => extra.code), options: quoteOptions }),
        discount_applied: Number(exactPackage?.full_period_discount_pct||0)>0,
        package_name: activePackage ? activePackage.name : null,
        check_in: checkIn,
        check_out: checkOut,
        guests: guestCount,
        nights,
        availability_checked: false,
        requires_human_confirmation: true,
        extras_total: extrasTotal,
        selected_extras: selectedExtras.map(extra => extra.code),
        recommendation_order: coupleWithChild ? 'couple_category_then_optional_upgrades' : 'highest_compatible_price_first'
    });

  } catch (error: any) {
    console.error("API Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
