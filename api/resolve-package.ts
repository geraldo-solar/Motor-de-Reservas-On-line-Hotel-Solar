import { VercelRequest, VercelResponse } from '@vercel/node';
import { MANYCHAT_TEXT_TRANSPORT, withManyChatTextEnvelope } from '../utils/manychatText.js';
import { createClient } from '@supabase/supabase-js';
import { resolveRoomMedia, nextRoomMedia, roomDetailInquiry, roomDetailAnswer } from '../utils/roomMedia.js';
import { control, safeTypedMessage } from './conversation-control.js';
import { withDailyGreeting, belemClock } from '../utils/dailyGreeting.js';
import {stripAssistantDisclosure} from '../utils/assistantDisclosure.js';
import { PHOTO_CLARIFY, documentPhotoInquiry, photoClarificationQuestion, photoRetryRequest } from '../utils/photoIntent.js';
import { requestedExtraCodes, extraCodes, extraPhotoRequest, extraMediaResult, nextExtraMedia, normalizeExtra, explicitPackageBoatBenefit, safeBoatCopy, safeBoatPackageCopy } from '../utils/extraMedia.js';
import { eventInquiry, eventContactText, reservaPhotoRequest, sitePhotoResult } from '../utils/hotelInfo.js';
import { readEvent, eventFieldReply } from '../utils/eventInquiry.js';
import { deliverEvent, deliveryFailed, acceptEventReceipt } from '../utils/eventDelivery.js';
import { publicEventInquiry, publicEventAnswer } from '../utils/publicEvents.js';
import { isAudioInput } from '../utils/audioTranscription.js';
import { AUDIO_RETRY, AUDIO_UNAVAILABLE, audioMessage } from '../utils/audioInput.js';
import { isAttachmentInput } from '../utils/attachmentAnalysis.js';
import { attachmentReceivedMessage } from '../utils/attachmentInput.js';
import { namedPackageInquiry, packageGeneralInclusionQuestion, packageFollowup, packageBookingRequest, packageRecommendationInquiry, readPackageContext, packageWeekdayClarification,packageAcknowledgment,packageInclusionFollowup,focusedPackageNameReference,packageOccupancyFollowup,packageDiscoveryRequest,packageRoomDetailFollowup } from '../utils/packageContext.js';
import {packageInclusionReply} from '../utils/packageInclusions.js';
import {newYearSalesTurn,newYearStayRange,newYearFullPeriodNote,readNewYearStayRequest,newYearCampaignFocus,newYearCampaignPackage,newYearSalesPolicy,newYearSiteLink} from '../utils/newYearSales.js';
import {packageConsultationReply} from '../utils/packageDateException.js';
import {possibleCompanionInquiry} from '../utils/possibleCompanion.js';
import {packageStayDates,readPackageStayQuery,packageStayPriceRequest} from '../utils/packageStayQuery.js';
import {motorStayRestriction,requiresFullPackagePeriod} from '../utils/motorStayPricing.js';
import {updateFamilyParty} from '../utils/familyParty.js';
import {familyAgeFollowup} from '../utils/familyAges.js';
import {currentPackage,packageEnded,retiredIndependence,endedPackageMarker,endedPackageAnswer} from '../utils/packageAvailability.js';
import {packageDateRequest,readPackageDateRequest,packageDateRequestAnswer} from '../utils/packageDateRequest.js';
import { WEEKEND_PRICES } from '../utils/pricing.js';
import { packagePrices, packageRecommendation, packageOfferSummary, packageGroupCombination, type PackageSaleTerms } from '../utils/packageReply.js';
import { childPolicyQuestion, childAgeFollowup, packageChildReply } from '../utils/packageChildInquiry.js';
import { stayDateClarification } from '../utils/stayDuration.js';
import {lodgingInclusionsAnswer} from '../utils/stayInformation.js';
import {flexibleStayQuestion,flexibleStayAnswer,compareFlexibleStays} from '../utils/flexibleStay.js';
import { guestServiceRequest } from '../utils/guestService.js';
import { hotelPhoneInquiry, hotelContactAnswer,hotelCallDifficulty,hotelCallDifficultyAnswer } from '../utils/hotelContact.js';
import {bookingDeferral,bookingDeferralAnswer} from '../utils/conversationContinuation.js';
import { locmilAnswer, confirmedHotelAnswer } from '../utils/hotelPolicy.js';
import {massageServiceAnswer} from '../utils/massageService.js';
import { paymentStatusInquiry } from '../utils/paymentStatus.js';
import { paymentSupportInquiry } from '../utils/paymentSupport.js';
import {arrivalTimeQuestion,arrivalTimeHandoff} from '../utils/conversationalStayDates.js';
import { existingReservationInquiry } from '../utils/existingReservation.js';
import { familyAccommodation, familyAgeQuestionFor, familyRoomRule, familyRoomExplanation, baseRoomCapacity } from '../utils/familyAccommodation.js';
import {readMultiRoomHandoff,multiRoomGuidanceText} from '../utils/multiRoomHandoff.js';
import {multiRoomRequest,roomAlternativeComparison} from '../utils/lodgingScope.js';
import {restaurantHoursAnswer} from '../utils/diningPolicy.js';
import {explicitHumanRequest,stripNegatedHumanRequests} from '../utils/humanIntent.js';
import {closingTurn,assistantBefore,closingAnswer,declined} from '../utils/conversationClosers.js';

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
  'dia', 'dias', 'bom', 'boa', 'tarde', 'noite', 'ola', 'oi', 'salinas', 'pessoas',
  'familia', 'praia', 'ferias', 'valor', 'valores', 'preco', 'precos', 'obrigado',
  // Function words and generic commercial terms cannot identify a holiday.
  'com', 'sem', 'pra', 'pro', 'pelo', 'pela', 'pelos', 'pelas', 'que', 'voces',
  'vcs', 'desconto', 'descontos',
  // Party composition is not a holiday request (e.g. "três crianças").
  // The complete holiday expressions are matched separately below.
  'crianca', 'criancas', 'mae', 'maes', 'pai', 'pais', 'namorado', 'namorada',
  'namorados', 'namoradas', 'adulto', 'adultos', 'bebe', 'bebes', 'casal',
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
  for (const holiday of ['dia das criancas', 'dia das maes', 'dia dos pais', 'dia dos namorados']) {
    if (normalizedMessage.includes(holiday) && normalizedName.includes(holiday)) score += 40;
  }
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
  if (/^(oi|ola|bom dia|boa tarde|boa noite|obrigad[oa]|tudo bem)(\s+(tudo bem|obrigad[oa]))*$/.test(normalized)) return false;
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

function validPackagePeriod(pkg:PackageRecord):boolean {
  const valid=(date:unknown):date is string=>typeof date==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(date)
    &&Number.isFinite(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;
  return valid(pkg.start_iso_date)&&valid(pkg.end_iso_date)&&pkg.end_iso_date>pkg.start_iso_date;
}

async function catalogBoatBenefit(supabase: any, focus: ReturnType<typeof readPackageContext>) {
  if (!focus) return false;
  const { data: packages, error } = await supabase.from('packages').select('*').eq('active', true);
  const pkg = !error && (packages || []).find((item: PackageRecord) => currentPackage(item)&&item.id === focus.id
    && item.start_iso_date === focus.start_date && item.end_iso_date === focus.end_date);
  return !!pkg && explicitPackageBoatBenefit(pkg);
}

const formatPackageDetails = (
  pkg: PackageRecord,
  rooms: RoomRecord[],
  conversational = false,
) => {
  pkg = safeBoatPackageCopy(pkg);
  const period = pkg.start_iso_date && pkg.end_iso_date
    ? `${formatDate(pkg.start_iso_date)} a ${formatDate(pkg.end_iso_date)}`
    : 'Consulte o período no motor de reservas';
  const items = [...(pkg.includes || []), ...(pkg.benefits || [])]
    .map(item => String(item).trim())
    .filter((item, index, all) => item && all.indexOf(item) === index);
  const {prices, label:priceLabel} = packagePrices(pkg, rooms);

  const text: string[] = [`🎉 *${pkg.name || 'Pacote especial'}*`, `📅 *Período:* ${period}`];
  if (pkg.location) text.push(`📍 *Local:* ${pkg.location}`);
  if (pkg.description) {
    // Public copy is data, not an instruction to expose coupons or assert stock.
    const description = conversational
      ? String(pkg.description).split(/(?<=[.!?])\s+/).filter(sentence =>
        !/cupom|cupon|vagas? limitad|apenas \d+ reservas|ultimas? (vagas?|unidades?)/i.test(normalize(sentence))
      ).join(' ')
      : String(pkg.description).trim();
    if (description) text.push('', description);
  }
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
    text.push('', `📌 *Regra de permanência:* é necessário incluir o período completo de ${period}. Também posso calcular diárias adicionais antes ou depois, conforme as tarifas de cada data, sem confirmar disponibilidade.`);
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
      // End on the question that moves the lead forward (most stop replying
      // after a closing statement).
      ? 'Os valores acima são informativos e não confirmam disponibilidade. Para quantas pessoas seria? Me diga quantos adultos e a idade das crianças que eu indico a melhor opção para vocês.'
      : 'Os valores acima são informativos e não confirmam disponibilidade. Para uma simulação personalizada, informe entrada, saída e quantidade de hóspedes. A recepção confirma as vagas e finaliza a reserva pelo WhatsApp (91) 98100-0800.',
  );
  return fitWhatsApp(text.join('\n'), conversational);
};

// "O que vem no pacote?": programme and conditions only, without re-sending
// the whole price table the customer has already received.
const formatPackageInclusions = (pkg: PackageRecord, guests?: number) => {
  pkg = safeBoatPackageCopy(pkg);
  const period = pkg.start_iso_date && pkg.end_iso_date ? `${formatDate(pkg.start_iso_date)} a ${formatDate(pkg.end_iso_date)}` : '';
  const items = [...(pkg.includes || []), ...(pkg.benefits || [])].map(item => String(item).trim())
    .filter((item, index, all) => item && all.indexOf(item) === index);
  const text: string[] = [`🎉 *${pkg.name || 'Pacote especial'}*${period ? ` — ${period}` : ''}`];
  const description = String(pkg.description || '').split(/(?<=[.!?])\s+/).filter(sentence =>
    !/cupom|cupon|vagas? limitad|apenas \d+ reservas|ultimas? (vagas?|unidades?)|parcel/i.test(normalize(sentence))).join(' ');
  if (description) text.push('', description);
  if (items.length) text.push('', '✨ *Programação e itens inclusos:*', ...items.map(item => `• ${item}`));
  text.push('', '☕ Café da manhã incluso todos os dias, como em toda hospedagem.');
  if (Number(pkg.max_installments || 0) > 0) text.push(`💳 Parcelamento em até ${Number(pkg.max_installments)}x no cartão.`);
  text.push('', guests ? 'Se quiser, já calculo o valor para o seu grupo.' : 'Quantas pessoas vão, contando adultos e crianças? Assim calculo o valor para vocês.');
  return fitWhatsApp(text.join('\n'), true);
};

// Dates just widened to the full Réveillon package ("31/12 a 01/01"): the
// turn that gave them says why the answer uses the whole package.
const withFullPeriodNote = (answer: string, message: string, state: any) => {
  const asked = newYearStayRange(message) ? readNewYearStayRequest(state?.full_period_extended, state?.facts) : undefined;
  return asked ? `${newYearFullPeriodNote(asked)}\n\n${answer}` : answer;
};

async function newYearCheapestOption(state: any, mode: 'objection' | 'hesitation' = 'objection'): Promise<string | undefined> {
  const client = createClient(supabaseUrl!, supabaseKey!);
  const [{data: packages, error: packageError}, {data: rooms, error: roomError}] = await Promise.all([
    client.from('packages').select('*').eq('active', true), client.from('room_types').select('*').eq('active', true)]);
  if (packageError || roomError || !rooms?.length) return;
  const pkg = (packages || []).find((item: PackageRecord) => currentPackage(item) && item.id === newYearCampaignPackage.id);
  if (!pkg) return;
  const guests = Number(state?.facts?.guests) || 0;
  const family = familyAccommodation(state, guests);
  const options = packagePrices(pkg, rooms).prices.filter(item => Number.isInteger(item.capacity) && (guests
    ? baseRoomCapacity(Number(item.capacity)) + Math.min(1, family.eligible) >= guests
    : Number(item.capacity) >= 2));
  if (!options.length) return;
  const best = options.reduce((a, b) => (b.price < a.price ? b : a));
  const nights = Math.round((Date.parse(`${pkg.end_iso_date}T12:00:00Z`) - Date.parse(`${pkg.start_iso_date}T12:00:00Z`)) / 86400000);
  const installments = Number(pkg.max_installments || 0) > 0 ? Number(pkg.max_installments) : newYearSalesPolicy.package_installments;
  const cash = best.price * (1 - newYearSalesPolicy.cash_discount_pct / 100);
  const group = guests ? ` para ${guests} ${guests === 1 ? 'pessoa' : 'pessoas'}` : '';
  const each = (best.price / installments).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  // "Vou pensar": a concrete reference to decide with, and the way back.
  if (mode === 'hesitation') return `Claro, fiquem à vontade! 😊 Para ajudar na decisão: a opção mais em conta${group} é a ${best.name}, R$ ${money(best.price)} pelas ${nights} noites, já com a Festa da Virada (ceia, open bar, Banda Zona Rural e DJ), em até ${installments}x de R$ ${each} no cartão ou R$ ${money(cash)} à vista. É o nosso evento mais procurado do ano. Quando decidirem, é só me chamar aqui ou garantir direto pelo site: ${newYearSiteLink(String(pkg.start_iso_date), String(pkg.end_iso_date)) || `https://reservas.hotelsolar.tur.br/?pacote=${pkg.id}`}`;
  return `Entendo! A opção mais em conta${group} é a ${best.name}: R$ ${money(best.price)} pelas ${nights} noites, já com a Festa da Virada (ceia, open bar, Banda Zona Rural e DJ). Dá para parcelar em até ${installments}x de R$ ${(best.price / installments).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} no cartão, ou pagar à vista com ${newYearSalesPolicy.cash_discount_pct}% de desconto: R$ ${money(cash)}. Criança de até 6 anos não paga.${guests ? ' Quer que eu siga com essa opção?' : ' Para quantas pessoas seria?'}`;
}

const packageHowToBook = (message: string) =>
  /\bcomo (?:eu )?(?:faco|faz|fazer|faco a|posso|consigo) (?:para |pra |a )?(?:reservar|reserva|fechar|garantir)\b|\bcomo (?:reservo|fecho|garanto)\b/.test(normalize(message));
const formatPackageHowToBook = (pkg: PackageRecord, guests?: number) => [
  `Para reservar o ${pkg.name || 'pacote'}, é por aqui mesmo:`,
  guests
    ? '1. Me diga qual acomodação prefere.\n2. Eu te mostro o resumo com o valor para você tocar em "Confirmar opção".\n3. A recepção confere a disponibilidade e finaliza com você nesta conversa.'
    : '1. Me diga quantos adultos e crianças vão (com a idade das crianças).\n2. Eu calculo o valor e te mostro o resumo para você tocar em "Confirmar opção".\n3. A recepção confere a disponibilidade e finaliza com você nesta conversa.',
  '',
  `Se preferir, também dá para reservar pelo site: https://reservas.hotelsolar.tur.br/?pacote=${encodeURIComponent(pkg.id)}${Number(pkg.max_installments || 0) > 0 ? ` (em até ${Number(pkg.max_installments)}x no cartão)` : ''}.`,
].join('\n');

const packageInstallmentQuestion = (message: string) =>
  /\b(?:parcel(?:ar|a|as|amento|ado|ada)|em quantas vezes|quantas vezes|dividir no cartao)\b/.test(normalize(message));
const formatPackageInstallments = (pkg: PackageRecord) => Number(pkg.max_installments || 0) > 0
  ? `Sim! No ${pkg.name || 'pacote'}, o pagamento pode ser parcelado em até ${Number(pkg.max_installments)}x no cartão de crédito. A recepção confirma a forma de pagamento ao finalizar a reserva.`
  : `Para o ${pkg.name || 'pacote'}, não há parcelamento específico cadastrado. Nas reservas comuns, o cartão pode ser parcelado em até 3x sem juros; a recepção confirma a condição desse pacote.`;

// Owner-confirmed Réveillon terms (29/09 and 01/10/2026): 10% à vista only on
// the package with lodging, its booking link and what the package includes.
const saleTermsFor = (pkg: PackageRecord): PackageSaleTerms => pkg.id === newYearCampaignPackage.id
  ? {cashDiscountPct: newYearSalesPolicy.cash_discount_pct, siteUrl: newYearSiteLink(String(pkg.start_iso_date), String(pkg.end_iso_date)),
    highlights: 'Festa da Virada com ceia, open bar, Banda Zona Rural e DJ, passeio de barco e café da manhã todos os dias'}
  : {};

/** The group stated in this very message ("Qual valor do Réveillon para 4 pessoas?"). */
const groupInMessage = (message: string, state: any) => {
  const guests = Number(state?.facts?.guests) || 0;
  return guests > 0 && updateFamilyParty(message, undefined, Date.now()).guests === guests ? guests : 0;
};
const endOfYearMention = (message: string) => /\b(?:fim|final) (?:do|de) ano\b/.test(normalize(message));
const programmeQuestion = (message: string) =>
  /\b(?:programac\w*|programa|roteiro|o que (?:inclui|vem|tem)|inclus\w*|incluid\w*|itens)\b/.test(normalize(message));

// Audit of 05/10/2026: "Como posso fazer o pagamento do pacote?" and "Posso
// dar uma parte para reservar e pagar o restante?" got the package text again.
// A deposit with the balance later is not a confirmed condition: the team decides.
const packageDepositQuestion = (message: string) => {
  const s = normalize(message);
  return /\b(?:sinal|uma parte|parte do valor|metade|restante|o resto|saldo)\b/.test(s) && /\b(?:pag\w*|reserv\w*|dar|deixar|depositar)\b/.test(s);
};
const packagePaymentQuestion = (message: string) => /\b(?:pagamento|pagar|como (?:eu )?pago)\b/.test(normalize(message))
  && !/\b(?:paguei|ja pago|comprovante|reembolso|estorno)\b/.test(normalize(message));
const packageDepositAnswer = 'Pagar uma parte para reservar e o restante depois precisa ser combinado com a nossa equipe. Vou chamar a recepção para te responder nesta conversa.';
const formatPackagePayment = (pkg: PackageRecord, guests?: number, siteUrl?: string) => [
  Number(pkg.max_installments || 0) > 0
    ? `No ${pkg.name || 'pacote'}, o pagamento pode ser no cartão de crédito em até ${Number(pkg.max_installments)}x.`
    : `No ${pkg.name || 'pacote'}, a forma de pagamento é confirmada pela nossa equipe ao finalizar a reserva.`,
  guests
    ? 'Para reservar, me diga qual acomodação prefere: eu preparo o resumo para você confirmar e a nossa equipe finaliza o pagamento com você nesta conversa.'
    : 'Para reservar, me diga quantas pessoas vão (com a idade das crianças) que eu calculo o valor; você confirma a opção e a nossa equipe finaliza o pagamento com você nesta conversa.',
  `Se preferir, também dá para reservar pelo site: ${siteUrl || `https://reservas.hotelsolar.tur.br/?pacote=${encodeURIComponent(pkg.id)}`}`,
].join(' ');

/** Groups that need more than one apartment in the focused package: the
 * cheapest combination from the current catalogue (the caller hands off). */
async function packageCombination(state: any): Promise<string | undefined> {
  const focus = readPackageContext(state?.package_context);
  if (!focus || !supabaseUrl || !supabaseKey) return;
  const client = createClient(supabaseUrl, supabaseKey);
  const [{data: packages, error: packageError}, {data: rooms, error: roomError}] = await Promise.all([
    client.from('packages').select('*').eq('active', true), client.from('room_types').select('*').eq('active', true)]);
  if (packageError || roomError || !rooms?.length) return;
  const pkg = (packages || []).find((item: PackageRecord) => currentPackage(item) && item.id === focus.id);
  return pkg ? packageGroupCombination(safeBoatPackageCopy(pkg), rooms, Number(state?.facts?.guests) || 0, state, saleTermsFor(pkg)) : undefined;
}

// After the combination card the team is already called: later turns of the
// same group do not resend it nor hand off again.
const combinationSent = (state: any) => {
  const guests = Number(state?.facts?.guests) || 0;
  return (Array.isArray(state?.turns) ? state.turns : []).slice(-10).some((turn: any) => turn?.role === 'assistant'
    && /A combinação mais em conta:/.test(String(turn.text || '')) && String(turn.text).includes(`· ${guests} hóspedes`));
};
// remember_response keeps no catalogue text while a multi-room offer is open;
// the card is still what the customer read, so it is the assistant turn.
const withAssistantTurn = (stateJson: string, text: string) => {
  try {
    const next = JSON.parse(stateJson), turns = Array.isArray(next.turns) ? next.turns : [];
    if (turns.at(-1)?.role === 'assistant') turns.at(-1).text = text.slice(0, 900);
    else turns.push({role: 'assistant', text: text.slice(0, 900)});
    next.turns = turns.slice(-16);
    return JSON.stringify(next);
  } catch { return stateJson; }
};
const teamCalledAnswer = 'Nossa equipe já foi chamada e vai confirmar com você, nesta conversa, a disponibilidade e a distribuição dos apartamentos.';

/** "O loft dá quantas pessoas?": the capacity of that category (and its
 * package price), not the general family rule. Undefined unless exactly one
 * category is named; "casal" alone describes the group, not the suite. */
async function namedRoomCapacity(message: string, state: any): Promise<string | undefined> {
  const s = normalize(message);
  if (!/\b(?:loft|sacada|varanda|quadruplo|triplo|suite|quarto|apartamento|apto|categoria)\b/.test(s) || !supabaseUrl || !supabaseKey) return;
  const client = createClient(supabaseUrl, supabaseKey);
  const [{data: rooms, error: roomError}, {data: packages, error: packageError}] = await Promise.all([
    client.from('room_types').select('*').eq('active', true), client.from('packages').select('*').eq('active', true)]);
  if (roomError || !rooms?.length) return;
  const named = (rooms as RoomRecord[]).filter(room => normalize(String(room.name || '')).replace(/\bsuite\b/g, '').split(/\s+/)
    .filter(word => word.length > 3 && !['vista', 'terreo'].includes(word))
    .some(word => word === 'casal' ? /\b(?:suite|quarto|apartamento|apto|categoria)\s+casal\b/.test(s) : new RegExp(`\\b${word}\\b`).test(s)));
  if (named.length !== 1 || !Number.isInteger(named[0].capacity)) return;
  const room = named[0], capacity = baseRoomCapacity(Number(room.capacity));
  const focus = readPackageContext(state?.package_context);
  const pkg = !packageError && focus ? (packages || []).find((item: PackageRecord) => currentPackage(item) && item.id === focus.id) : undefined;
  const price = pkg ? packagePrices(pkg, rooms).prices.find(item => item.id === String(room.id))?.price : undefined;
  const guests = Number(state?.facts?.guests) || 0, family = familyAccommodation(state, guests);
  const article = /^su[ií]te/i.test(String(room.name)) ? 'A' : 'O', pronoun = article === 'A' ? 'ela' : 'ele';
  return `${article} ${room.name} acomoda até ${capacity} ${capacity === 1 ? 'pessoa' : 'pessoas'}, e ainda 1 criança de até 6 anos em cortesia.`
    + (price ? ` No ${pkg!.name}, ${pronoun} sai por R$ ${money(price)} o pacote completo, por apartamento.` : '')
    + (!guests || family.pending ? ' Quantas pessoas vão? Assim indico a melhor opção para vocês.'
      : capacity + Math.min(1, family.eligible) >= guests ? ` Para os ${guests} hóspedes, ${pronoun} atende vocês.`
      : ` Para os ${guests} hóspedes, ${pronoun} não comporta o grupo todo em um apartamento.`);
}

// Asking the same group question twice in a row (audit 05/10/2026: "Seria o
// casal" got "Quantas pessoas vão se hospedar?" three times): the team takes over.
const groupQuestionKind = (text: string) =>
  /Quantas pessoas vão se hospedar|Para quantas pessoas será a (?:estadia|hospedagem|reserva)|preciso saber para quantas pessoas/i.test(text) ? 'people'
  : /Quais são as idades/.test(text) ? 'ages' : undefined;
const repeatedQuestionAnswer = 'Para não te fazer repetir, vou chamar nossa equipe para calcular o valor para vocês nesta conversa.';

// The customer asked the price again without the group or dates (audit
// 05/10/2026, "Estou tentando mas não consigo saber o valor"): the regular
// rates by category, the same table the team sends, from the catalogue.
const priceTableTitle = 'Valores das diárias fora de férias e feriados';
const whole = (value: number) => Math.round(value).toLocaleString('pt-BR', {maximumFractionDigits: 0});
const priceAsked = (state: any, message: string) => [message, ...(Array.isArray(state?.turns) ? state.turns : [])
  .filter((turn: any) => turn?.role === 'user').slice(-3).map((turn: any) => String(turn.text || ''))]
  .some(text => /\b(?:valor(?:es)?|precos?|quanto|tarifas?|diarias?|orcamento|estadi[as]|custa|custo)\b/.test(normalize(text)));
const priceTableSent = (state: any) => (Array.isArray(state?.turns) ? state.turns : []).slice(-8)
  .some((turn: any) => turn?.role === 'assistant' && String(turn.text || '').startsWith(priceTableTitle));
async function regularPriceTable(): Promise<string | undefined> {
  if (!supabaseUrl || !supabaseKey) return;
  const {data: rooms, error} = await createClient(supabaseUrl, supabaseKey).from('room_types').select('*').eq('active', true);
  if (error || !rooms?.length) return;
  const list = (rooms as RoomRecord[]).filter(room => Number(room.base_price) > 0 && room.name)
    .map(room => ({name: String(room.name), capacity: Number(room.capacity) || 0, weekday: Number(room.base_price),
      weekend: WEEKEND_PRICES[String(room.name)] || Number(room.base_price) * 1.15}))
    .sort((a, b) => a.weekday - b.weekday || a.name.localeCompare(b.name));
  if (!list.length) return;
  return [`${priceTableTitle}, por apartamento e já com café da manhã ☕`, '', '*Sexta e sábado:*',
    ...list.map(room => `• ${room.name}${room.capacity ? ` (até ${room.capacity} ${room.capacity === 1 ? 'pessoa' : 'pessoas'})` : ''}: R$ ${whole(room.weekend)}`),
    '', '*Domingo a quinta:*', ...list.map(room => `• ${room.name}: R$ ${whole(room.weekday)}`), '',
    'Uma criança de até 6 anos por apartamento não paga. Parcelamos em até 3x sem juros no cartão.', '',
    'Em férias e feriados os valores mudam. Me diga as datas e quantas pessoas vão que eu confirmo para você. Se preferir, também dá para reservar pelo site: https://reservas.hotelsolar.tur.br',
  ].join('\n');
}

function repeatedQuestionHandoff(payload: any, sourceState: any, message: string, priceTable?: string) {
  if (!payload || payload.quote_request !== 'ROOM_LIST' && !/^PACKAGE_ID\|/.test(String(payload.quote_request || ''))) return payload;
  const kind = groupQuestionKind(String(payload.conversation_text || ''));
  if (!kind || !message) return payload;
  let state: any;
  try { state = typeof sourceState === 'string' ? JSON.parse(sourceState) : sourceState; } catch { return payload; }
  if (groupQuestionKind(assistantBefore(state, message)) !== kind) return payload;
  // A partial answer ("uma tem 2 anos", "4 pessoas") is progress, not a loop.
  if (kind === 'ages' ? /\d/.test(message) || familyAgeFollowup(message) : updateFamilyParty(message, undefined, Date.now()).handled) return payload;
  // A repeated "quantas pessoas?" about a price gets the table once; after it, the team.
  const table = kind === 'people' && priceTable && !priceTableSent(state) ? priceTable : undefined;
  const answer = table || repeatedQuestionAnswer;
  let remembered = payload.state;
  try {
    const next = JSON.parse(payload.state);
    if (next?.turns?.at(-1)?.role === 'assistant') next.turns.at(-1).text = answer.slice(0, 900);
    remembered = JSON.stringify(next);
  } catch { /* Keep the state as returned. */ }
  return {...payload, quote_request: table ? 'ROOM_LIST' : 'HUMANO', quote_text: answer, conversation_text: answer,
    can_collect: 'NAO', confirmation_text: '', match_type: table ? 'regular_price_table' : 'repeated_question_handoff', ...(remembered ? {state: remembered} : {})};
}

// The model sometimes promises an action ("aguarde enquanto confirmo com a
// equipe", "encaminhei seu pedido") that only a handoff performs.
const teamPromise = (text: string) =>
  /\b(?:vou|irei|vamos) (?:confirmar|verificar|consultar|checar|conferir)\b[^.!?]{0,60}\bcom (?:a |nossa )?(?:equipe|recepção)\b|\baguarde\b[^.!?]{0,40}\benquanto (?:confirmo|verifico|consulto|confiro)\b|\bencaminh(?:ei|arei|aremos)\b|\b(?:vou|irei) (?:encaminhar|repassar)\b/i.test(text);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only the first response of a user turn: carousel pages / suggested media
  // are internal continuations and must not send the greeting again.
  let priceTable: string | undefined;
  if (!req.query?.operation || req.query?.transport === MANYCHAT_TEXT_TRANSPORT) {
    const sendJson = res.json.bind(res);
    res.json = ((payload: any) => {
      const result = !req.query?.operation ? withDailyGreeting(repeatedQuestionHandoff(payload, req.body?.state, safeTypedMessage(String(req.body?.user_message || req.body?.message || '').trim()), priceTable), req.body?.state) : payload;
      return sendJson(req.query?.transport === MANYCHAT_TEXT_TRANSPORT ? withManyChatTextEnvelope(result) : result);
    }) as typeof res.json;
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }
  if(req.query?.operation==='event-receipt') {const r=await acceptEventReceipt(req.body);return res.status(r.code).json({status:r.status});}
  const suppliedMessage = String(req.body?.user_message || req.body?.message || '').trim();
  // The offers step receives our previous public answer, not a fresh customer
  // message. Remove only the canonical presentation before privacy/intent checks.
  const incomingMessage = req.query?.operation==='offers' ? stripAssistantDisclosure(suppliedMessage) : suppliedMessage;
  if (isAttachmentInput(incomingMessage)) {
    const routed = control({operation:'route', user_message:incomingMessage, state:req.body?.state});
    const kind = 'attachment_kind' in routed ? routed.attachment_kind! : 'unreadable';
    const message = attachmentReceivedMessage(kind);
    return res.status(200).json({...routed, answer:message, quote_text:message, conversation_text:message,
      matched:false, match_type:'attachment', availability_checked:false});
  }
  let serviceMessage = safeTypedMessage(incomingMessage);
  if (isAudioInput(incomingMessage)) {
    try {
      const state = typeof req.body?.state === 'string' ? JSON.parse(req.body.state) : req.body?.state;
      serviceMessage = audioMessage(incomingMessage, state) || '';
    } catch { serviceMessage = ''; }
  }
  let previousPaymentMessage = '';
  let earlyState: any;
  try {const checked=control({operation:'remember_response',state:req.body?.state});
    earlyState = 'state' in checked ? JSON.parse(checked.state || '{}') : undefined;
    previousPaymentMessage = earlyState?.history?.at(-1) || '';
  } catch { /* Invalid state cannot establish payment context. */ }
  const discovery=!req.query?.operation&&packageDiscoveryRequest(serviceMessage,earlyState?.package_context);
  if(!req.query?.operation&&!readPackageContext(earlyState?.package_context)&&groupQuestionKind(assistantBefore(earlyState,serviceMessage))==='people'
    &&priceAsked(earlyState,serviceMessage)&&!priceTableSent(earlyState)&&!updateFamilyParty(serviceMessage,undefined,Date.now()).handled)
    priceTable=await regularPriceTable().catch(()=>undefined);
  // "Ok", "obrigado", "👍", "nenhuma": a short closing. After a goodbye, or
  // for the customer's own away message, nothing is sent (ROOM_DONE).
  const closingCandidate=!req.query?.operation&&!isAudioInput(incomingMessage)
    ?closingTurn(serviceMessage,assistantBefore(earlyState,serviceMessage)):undefined;
  const closing=closingCandidate?.kind==='closing'&&earlyState?.package_context&&earlyState?.topic==='package_info'
    &&packageAcknowledgment(serviceMessage)?undefined:closingCandidate;
  if(closing){
    if(closing.kind!=='closing')return res.status(200).json({quote_request:'ROOM_DONE',quote_text:'',conversation_text:'',
      can_collect:'NAO',confirmation_text:'',matched:false,match_type:closing.kind,availability_checked:false,state:JSON.stringify(earlyState)});
    return res.status(200).json({quote_request:'ROOM_LIST',quote_text:closing.answer,conversation_text:closing.answer,
      can_collect:'NAO',confirmation_text:'',matched:false,match_type:'closing',availability_checked:false,
      ...control({operation:'remember_response',state:req.body?.state,response_text:closing.answer})});
  }
  // "Não", "não precisa" right after an offer (package text, card or the
  // cheapest option): a short close, never the package again (audit 05/10/2026).
  if(!req.query?.operation&&!isAudioInput(incomingMessage)&&declined(serviceMessage)
    &&/🎉 \*|Quer que eu siga com essa opção\?|Prefere a .+ ou outra opção\?/.test(assistantBefore(earlyState,serviceMessage))){
    const answer=earlyState?.facts?.guests?'Tudo bem! 😊 Se mudar de ideia ou tiver alguma dúvida, é só me chamar por aqui.'
      :'Tudo bem! 😊 Se mudar de ideia, é só me dizer quantas pessoas vão que eu calculo o valor para vocês.';
    return res.status(200).json({quote_request:'ROOM_LIST',quote_text:answer,conversation_text:answer,
      can_collect:'NAO',confirmation_text:'',matched:false,match_type:'offer_declined',availability_checked:false,
      ...control({operation:'remember_response',state:req.body?.state,response_text:answer})});
  }
  if(!req.query?.operation&&massageServiceAnswer(serviceMessage,earlyState?.massage_context)){
    const routed=control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    if('service_info' in routed&&routed.service_info==='outsourced_massage'){
      const answer='answer' in routed?routed.answer:'';
      return res.status(200).json({...routed,quote_request:'ROOM_LIST',quote_text:answer,conversation_text:answer,
        matched:false,match_type:'outsourced_massage',availability_checked:false});
    }
  }
  if (!req.query?.operation && hotelPhoneInquiry(serviceMessage)
    && !hotelCallDifficulty(serviceMessage)
    && !paymentStatusInquiry(serviceMessage, previousPaymentMessage)
    && !existingReservationInquiry(serviceMessage, !!earlyState?.existing_reservation)) {
    const routed = control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    return res.status(200).json({...routed,quote_request:'ROOM_LIST',
      quote_text:hotelContactAnswer,conversation_text:hotelContactAnswer,
      matched:false,match_type:'hotel_contact',availability_checked:false});
  }
  if (!req.query?.operation && paymentStatusInquiry(serviceMessage, previousPaymentMessage)) {
    const routed = control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    const answer = 'answer' in routed ? routed.answer : '';
    return res.status(200).json({...routed,quote_text:answer,conversation_text:answer,
      matched:false,match_type:'payment_verification',availability_checked:false});
  }
  if (!req.query?.operation && paymentSupportInquiry(serviceMessage, !!earlyState?.payment_support)) {
    const routed = control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    const answer = 'answer' in routed ? routed.answer : '';
    return res.status(200).json({...routed,quote_text:answer,conversation_text:answer,
      matched:false,match_type:'payment_support',availability_checked:false});
  }
  let eventReply=false;
  try {const state=typeof req.body?.state==='string'?JSON.parse(req.body.state):req.body?.state;eventReply=eventFieldReply(state?.event,serviceMessage);} catch { /* Invalid state cannot establish event context. */ }
  if (!req.query?.operation && !eventReply && guestServiceRequest(stripNegatedHumanRequests(serviceMessage))) {
    // Use the same existing handoff code even when invoked directly. No
    // catalog, private-event delivery, document issuance or service order runs.
    const routed = control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    const answer = 'answer' in routed ? routed.answer : '';
    return res.status(200).json({...routed,quote_text:answer,conversation_text:answer,
      matched:false,match_type:'guest_service',availability_checked:false});
  }
  if (!req.query?.operation && existingReservationInquiry(serviceMessage, !!earlyState?.existing_reservation)) {
    // Return the actual human route, not a textual promise left on ROOM_LIST.
    // This branch never fetches a booking, catalogue or payment link.
    const routed = control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    const answer = 'answer' in routed ? routed.answer : '';
    return res.status(200).json({...routed,quote_text:answer,conversation_text:answer,
      matched:false,match_type:'existing_reservation',availability_checked:false});
  }
  if (!req.query?.operation && explicitHumanRequest(serviceMessage)) {
    const routed=control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    const answer='answer' in routed?routed.answer:'';
    return res.status(200).json({...routed,quote_text:answer,conversation_text:answer,
      matched:false,match_type:'human_request',availability_checked:false});
  }
  if(!req.query?.operation&&(bookingDeferral(serviceMessage)||hotelCallDifficulty(serviceMessage))){
    const deferred=bookingDeferral(serviceMessage);
    const answer=deferred?bookingDeferralAnswer:hotelCallDifficultyAnswer;
    const routed=control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    return res.status(200).json({...routed,quote_request:'ROOM_LIST',quote_text:answer,conversation_text:answer,
      can_collect:'NAO',confirmation_text:'',matched:false,match_type:deferred?'booking_deferral':'hotel_call_difficulty',availability_checked:false});
  }
  const newYearSale=!req.query?.operation?newYearSalesTurn(serviceMessage,earlyState?.package_context||earlyState?.recent_package,earlyState?.facts?.guests,Date.now(),newYearCampaignFocus(earlyState?.campaign,earlyState?.facts)):undefined;
  if(newYearSale){
    // Owner-confirmed Réveillon answers: the controller owns the handoff and
    // the remembered turn; never replace them with the package card or a quote.
    const routed=control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    let answer='answer' in routed&&routed.answer?routed.answer:newYearSale.answer;
    const handoff='quote_request' in routed&&routed.quote_request==='HUMANO';
    // "Achei caro": answer with the most affordable option for the group,
    // from the current catalogue (never a price from memory).
    // A second "vou pensar" right after that answer only closes the turn.
    if(newYearSale.kind==='hesitation'&&!handoff){
      const repeated=/Quando decidirem, é só me chamar/.test(assistantBefore(earlyState,serviceMessage));
      const text=repeated?closingAnswer:await newYearCheapestOption(earlyState,'hesitation');
      if(text){
        const remembered=control({operation:'remember_response',state:'state' in routed?routed.state:req.body?.state,response_text:text});
        return res.status(200).json({...routed,...remembered,quote_request:'ROOM_LIST',quote_text:text,conversation_text:text,
          can_collect:'NAO',confirmation_text:'',matched:false,match_type:'new_year_hesitation',availability_checked:false});
      }
    }
    if(newYearSale.kind==='price_objection'&&!handoff){
      const cheapest=await newYearCheapestOption(earlyState);
      if(cheapest){
        answer=cheapest;
        const remembered=control({operation:'remember_response',state:'state' in routed?routed.state:req.body?.state,response_text:answer});
        return res.status(200).json({...routed,...remembered,quote_request:'ROOM_LIST',quote_text:answer,conversation_text:answer,
          can_collect:'NAO',confirmation_text:'',matched:false,match_type:'new_year_price_objection',availability_checked:false});
      }
    }
    return res.status(200).json({...routed,quote_request:handoff?'HUMANO':'ROOM_LIST',quote_text:answer,conversation_text:answer,
      can_collect:'NAO',confirmation_text:'',matched:false,match_type:`new_year_${newYearSale.kind}`,availability_checked:false});
  }
  let expiredSource=false;
  try{const source=typeof req.body?.state==='string'?JSON.parse(req.body.state):req.body?.state;expiredSource=packageEnded(source?.package_context);}catch{ /* No valid old focus. */ }
  if(!req.query?.operation&&(retiredIndependence(serviceMessage)||expiredSource||earlyState?.resolved_message===endedPackageMarker)){
    const routed=control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    if('quote_request' in routed&&routed.quote_request==='HUMANO')return res.status(200).json({...routed,
      quote_text:routed.answer,conversation_text:routed.answer,matched:false,match_type:'human_request',availability_checked:false});
    if('resolved_message' in routed&&routed.resolved_message===endedPackageMarker)return res.status(200).json({...routed,
      quote_request:'ROOM_LIST',quote_text:endedPackageAnswer,conversation_text:endedPackageAnswer,
      package_image_url:'',matched:false,match_type:'ended_package',availability_checked:false});
  }
  if(req.query?.operation==='offers'&&earlyState?.resolved_message===endedPackageMarker)
    return res.status(200).json({quote_request:'ROOM_DONE',quote_text:'',conversation_text:'',state:JSON.stringify(earlyState),availability_checked:false});
  const currentStay=readPackageStayQuery(earlyState?.package_stay_query,earlyState?.package_context);
  const queriedStay=!possibleCompanionInquiry(serviceMessage)?packageStayDates(serviceMessage,earlyState?.package_context,Date.now(),currentStay):undefined;
  if(!req.query?.operation&&(queriedStay||currentStay&&earlyState?.history?.at(-1)===serviceMessage.slice(0,500)
    &&currentStay.price_requested&&(packageStayPriceRequest(serviceMessage)||updateFamilyParty(serviceMessage,earlyState?.family_party,Date.now(),earlyState?.facts?.guests).handled))){
    const routed=control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    if('quote_request' in routed&&routed.quote_request==='HUMANO')return res.status(200).json({...routed,
      quote_text:routed.answer,conversation_text:routed.answer,matched:false,match_type:'human_request',availability_checked:false});
    const query=queriedStay||currentStay!;
    const client=createClient(supabaseUrl,supabaseKey);
    const [{data:packages,error:packageError},{data:rooms,error:roomError}]=await Promise.all([
      client.from('packages').select('*').eq('active',true),client.from('room_types').select('*').eq('active',true)]);
    if(packageError||roomError||!rooms?.length)return res.status(500).json({error:'Unable to validate stay dates.'});
    const pkg=packages?.find((p:PackageRecord)=>currentPackage(p)&&p.id===query.package_id&&p.start_iso_date===earlyState?.package_context?.start_date&&p.end_iso_date===earlyState?.package_context?.end_date);
    const permitted=rooms.filter((room:any)=>!motorStayRestriction(room,query.check_in,query.check_out));
    const covered=pkg&&query.check_in<=pkg.start_iso_date&&query.check_out>=pkg.end_iso_date;
    const blockedExit=rooms.every((room:any)=>motorStayRestriction(room,query.check_in,query.check_out)==='check_out');
    const blockedEntry=rooms.every((room:any)=>motorStayRestriction(room,query.check_in,query.check_out)==='check_in');
    const period=`${formatDate(query.check_in)} a ${formatDate(query.check_out)}`;
    const regular=pkg?`${formatDate(pkg.start_iso_date)} a ${formatDate(pkg.end_iso_date)}`:'';
    const answer=!pkg?'O cadastro desse pacote mudou. Preciso consultar o pacote atual antes de calcular essas datas. Qual pacote deseja consultar?'
      :!permitted.length?`${blockedExit?'Não temos saída em '+formatDate(query.check_out):blockedEntry?'Não temos entrada em '+formatDate(query.check_in):'Não temos hospedagem no período '+period} nesse pacote. O pacote é de ${regular}; se quiserem, dá para somar diárias antes ou depois dele. Qual período vocês preferem?`
      :!covered&&requiresFullPackagePeriod(pkg)&&query.check_in<pkg.end_iso_date&&query.check_out>pkg.start_iso_date
      ?`O ${pkg.name} é vendido somente no período completo, de ${regular}. O período ${period} deixa de fora parte do pacote. Posso calcular o pacote completo, somando diárias antes ou depois se quiserem. Quais datas deseja simular?`
      :currentStay?.price_requested&&'answer' in routed?routed.answer
      :`Posso simular ${period}, somando as tarifas de cada diária cadastradas no motor${covered?' e mantendo todas as noites do pacote':''}. Isso não confirma disponibilidade nem reserva. ${earlyState?.facts?.guests?`Você já informou ${earlyState.facts.guests} hóspedes; pode pedir o cálculo para esse grupo.`:'Para quantas pessoas será a estadia? Se houver crianças, informe também as idades.'}`;
    return res.status(200).json({quote_request:'ROOM_LIST',can_collect:'NAO',confirmation_text:'',quote_text:answer,conversation_text:answer,
      matched:false,match_type:'package_stay_query',availability_checked:false,
      ...control({operation:'remember_response',state:routed.state,response_text:answer})});
  }
  if(req.query?.operation==='offers'&&currentStay&&(earlyState?.turns?.at(-1)?.text===incomingMessage
    ||packageStayDates(earlyState?.history?.at(-1)||'',earlyState?.package_context,Date.now(),currentStay)
    ||packageStayPriceRequest(earlyState?.history?.at(-1)||'')))
    return res.status(200).json({quote_request:'ROOM_DONE',quote_text:'',conversation_text:'',state:JSON.stringify(earlyState),availability_checked:false});
  const exceptionalPeriod=packageDateRequest(serviceMessage,earlyState?.package_context);
  if(!req.query?.operation&&exceptionalPeriod){
    const routed=control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    return res.status(200).json({...routed,quote_request:'ROOM_LIST',can_collect:'NAO',confirmation_text:'',
      quote_text:packageDateRequestAnswer,conversation_text:packageDateRequestAnswer,
      matched:false,match_type:'package_date_request',availability_checked:false});
  }
  if(req.query?.operation==='offers'
    &&readPackageDateRequest(earlyState?.package_date_request,earlyState?.package_context)
    &&incomingMessage===packageDateRequestAnswer)
    return res.status(200).json({quote_request:'ROOM_DONE',quote_text:'',conversation_text:'',
      state:JSON.stringify(earlyState),availability_checked:false});
  const consultation=packageConsultationReply(serviceMessage,earlyState?.package_context);
  if(!req.query?.operation&&consultation) {
    // Owner-confirmed period rule and an unconfirmed companion are not a new
    // quote. Existing booking/payment/service requests keep priority above.
    const routed=control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    const humanRoute=consultation.handoff||('quote_request' in routed&&routed.quote_request==='HUMANO');
    return res.status(200).json({...routed,quote_request:humanRoute?'HUMANO':'ROOM_LIST',can_collect:'NAO',confirmation_text:'',
      quote_text:consultation.answer,conversation_text:consultation.answer,matched:false,
      match_type:consultation.handoff?'package_date_consultation':'possible_companion',availability_checked:false});
  }
  // A named reply to the current photo prompt ("da hidromassagem") is
  // already expanded by prepare. Reuse only that live, current-turn photo
  // interpretation; a stale focus or a new facility question is still a FAQ.
  const photoFocusAt=earlyState?.topic_at;
  const policyNow=Date.now();
  const currentPhotoMessage=earlyState?.history?.at(-1)===serviceMessage.slice(0,500)
    &&earlyState?.topic==='extra_photos'&&Number.isFinite(photoFocusAt)
    &&photoFocusAt>0&&photoFocusAt<=policyNow&&policyNow-photoFocusAt<=30*60000
    &&extraPhotoRequest(earlyState?.resolved_message||'')&&extraCodes(earlyState?.resolved_message||'').length
    ?earlyState.resolved_message:serviceMessage;
  const confirmedAnswer=confirmedHotelAnswer(currentPhotoMessage)
    || (!earlyState?.package_context?lodgingInclusionsAnswer(currentPhotoMessage):undefined);
  if(!req.query?.operation && confirmedAnswer) {
    // A photo shoot is a policy question, not a request to browse pictures.
    const routed=control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    const handoff='quote_request' in routed && routed.quote_request==='HUMANO';
    return res.status(200).json({...routed,quote_request:handoff?'HUMANO':'ROOM_LIST',
      quote_text:confirmedAnswer,conversation_text:confirmedAnswer,can_collect:'NAO',confirmation_text:'',
      matched:false,match_type:'confirmed_hotel_policy',availability_checked:false});
  }
  if(discovery){
    // The controller owns topic reset, including direct calls without prepare.
    // Use its safe state throughout this resolver so stale dates/consent cannot
    // be reintroduced when the catalog response is remembered below.
    const routed=control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    if('quote_request' in routed&&routed.quote_request==='HUMANO'){
      const answer='answer' in routed?routed.answer:'';
      return res.status(200).json({...routed,quote_text:answer,conversation_text:answer,
        can_collect:'NAO',confirmation_text:'',matched:false,match_type:'human_handoff',availability_checked:false});
    }
    if('state' in routed&&routed.state){
      req.body={...req.body,state:routed.state};
      earlyState=JSON.parse(routed.state);
    }
  }
  const guidance=!req.query?.operation&&!discovery?multiRoomGuidanceText(earlyState,serviceMessage):undefined;
  if(guidance){
    const routed=control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    const answer='answer' in routed?routed.answer:guidance;
    // A distribution question can also contain an explicit request for multiple
    // rooms. Keep the controller's handoff paired with its handoff wording.
    const human='quote_request' in routed&&routed.quote_request==='HUMANO';
    return res.status(200).json({...routed,quote_request:human?'HUMANO':'ROOM_LIST',quote_text:answer,conversation_text:answer,
      can_collect:'NAO',confirmation_text:'',matched:false,match_type:human?'multi_room_handoff':'multi_room_guidance',availability_checked:false});
  }
  const multi=discovery?undefined:readMultiRoomHandoff(earlyState?.multi_room,earlyState);
  if(req.query?.operation==='offers' && multi)
    return res.status(200).json({quote_request:'ROOM_DONE',quote_text:'',conversation_text:'',state:JSON.stringify(earlyState),availability_checked:false});
  if(!req.query?.operation && !discovery && (multiRoomRequest(serviceMessage) || roomAlternativeComparison(serviceMessage)
    || multi && earlyState.history?.at(-1)===serviceMessage.slice(0,500))){
    const routed=control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    const answer='answer' in routed?routed.answer:'';
    const human='quote_request' in routed && routed.quote_request==='HUMANO';
    // A package group that needs two or more apartments: the cheapest
    // combination from the catalogue, and the team takes over right away
    // (audit 05/10/2026: offers left unanswered were never followed up).
    const offered='state' in routed?JSON.parse(routed.state||'{}'):undefined;
    if(!human&&!multiRoomRequest(serviceMessage)&&!roomAlternativeComparison(serviceMessage)&&offered?.multi_room?.status==='offered'){
      if(combinationSent(offered)){
        const answer=(await namedRoomCapacity(serviceMessage,offered))||teamCalledAnswer;
        return res.status(200).json({...routed,quote_request:'ROOM_LIST',quote_text:answer,conversation_text:answer,
          can_collect:'NAO',confirmation_text:'',match_type:'multi_room_team_called',matched:false,availability_checked:false,
          state:withAssistantTurn(routed.state,answer)});
      }
      const combination=await packageCombination(offered);
      if(combination)return res.status(200).json({...routed,quote_request:'HUMANO',quote_text:combination,conversation_text:combination,
        can_collect:'NAO',confirmation_text:'',match_type:'package_group_combination',matched:false,availability_checked:false,
        state:withAssistantTurn(routed.state,combination)});
    }
    return res.status(200).json({...routed,quote_request:human?'HUMANO':'ROOM_LIST',
      quote_text:answer,conversation_text:answer,match_type:'multi_room_handoff',matched:false,availability_checked:false});
  }
  const capacityQuestion=/\b(?:apartamentos?|aptos?|quartos?|suites?|loft|acomodacoes|acomodacao)\b/.test(normalize(serviceMessage))
    &&/\b(?:cabem|cabe|caber|comporta|comportam|acomoda|acomodam|dividir|divididos?|separad[oa]s?|juntos|todos|capacidade|quantas pessoas|quantos hospedes|formato)\b/.test(normalize(serviceMessage));
  const pendingPackageFamily=familyAccommodation(earlyState,earlyState?.facts?.guests||0).pending;
  if(!req.query?.operation&&!childPolicyQuestion(serviceMessage)
    &&packageOccupancyFollowup(serviceMessage,earlyState?.package_context)
    &&(capacityQuestion||pendingPackageFamily)){
    // Capacity/composition is the current question, not a request to resend
    // package advertising or prices. Keep the controller as the sole author
    // of the multi-apartment offer/acceptance and never consult the catalog.
    const routed=control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    const state='state' in routed?JSON.parse(routed.state||'{}'):earlyState;
    const multiRoom=readMultiRoomHandoff(state?.multi_room,state);
    if(multiRoom||'quote_request' in routed&&routed.quote_request==='HUMANO'){
      const human='quote_request' in routed&&routed.quote_request==='HUMANO';
      if(!human&&multiRoom?.status==='offered'&&combinationSent(state)){
        const answer=(capacityQuestion?await namedRoomCapacity(serviceMessage,state):undefined)||teamCalledAnswer;
        return res.status(200).json({quote_request:'ROOM_LIST',quote_text:answer,conversation_text:answer,
          can_collect:'NAO',confirmation_text:'',matched:false,match_type:'multi_room_team_called',availability_checked:false,
          package_id:earlyState.package_context.id,package_name:earlyState.package_context.name,
          ...('state' in routed?{state:withAssistantTurn(routed.state,answer)}:{})});
      }
      const combination=!human&&multiRoom?.status==='offered'?await packageCombination(state):undefined;
      const answer=combination||('answer' in routed?routed.answer:'');
      return res.status(200).json({...routed,quote_request:human||combination?'HUMANO':'ROOM_LIST',
        quote_text:answer,conversation_text:answer,can_collect:'NAO',confirmation_text:'',
        package_id:earlyState.package_context.id,package_name:earlyState.package_context.name,
        matched:false,match_type:combination?'package_group_combination':'package_followup',availability_checked:false,
        ...(combination&&'state' in routed?{state:withAssistantTurn(routed.state,combination)}:{})});
    }
    const guests=state?.facts?.guests||0,family=familyAccommodation(state,guests);
    // "O loft dá quantas pessoas?" names a category: answer its capacity.
    const roomCapacity=capacityQuestion&&!family.pending?await namedRoomCapacity(serviceMessage,state):undefined;
    if(roomCapacity)return res.status(200).json({quote_request:'ROOM_LIST',quote_text:roomCapacity,conversation_text:roomCapacity,
      can_collect:'NAO',confirmation_text:'',matched:false,match_type:'room_capacity',availability_checked:false,
      package_id:earlyState.package_context.id,package_name:earlyState.package_context.name,
      ...control({operation:'remember_response',state:routed.state,response_text:roomCapacity})});
    const answer=withFullPeriodNote(family.pending?familyAgeQuestionFor(state)
      :guests===5&&!family.key?'Para conferir se as 5 pessoas cabem em um apartamento, quantos são adultos e quantos são crianças? Informe a idade de cada criança; só podemos considerar a ocupação adicional com uma criança de até 6 anos.'
      :family.key&&guests<=5?familyRoomExplanation(guests,family.eligible)+' A categoria compatível e a disponibilidade ainda precisam ser conferidas; não há preço, período ou reserva confirmados por esta orientação.'
      :familyRoomRule+' A categoria compatível e a disponibilidade ainda precisam ser conferidas; esta orientação não confirma preço, período ou reserva.',
      serviceMessage,state);
    return res.status(200).json({quote_request:'ROOM_LIST',quote_text:answer,conversation_text:answer,
      can_collect:'NAO',confirmation_text:'',matched:false,match_type:'package_followup',availability_checked:false,
      package_id:earlyState.package_context.id,package_name:earlyState.package_context.name,
      ...control({operation:'remember_response',state:routed.state,response_text:answer})});
  }
  if(req.query?.operation==='offers'&&earlyState?.turns?.at(-1)?.role==='assistant'
    &&earlyState.turns.at(-1).text===incomingMessage
    &&packageOccupancyFollowup(earlyState.history?.at(-1)||'',earlyState.package_context))
    return res.status(200).json({quote_request:'ROOM_DONE',quote_text:'',conversation_text:'',
      state:JSON.stringify(earlyState),availability_checked:false});
  const restaurantHours=restaurantHoursAnswer(serviceMessage);
  if(!req.query?.operation && restaurantHours){
    const routed=control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    return res.status(200).json({...routed,quote_request:'ROOM_LIST',quote_text:restaurantHours,conversation_text:restaurantHours,
      match_type:'restaurant_hours',matched:false,availability_checked:false});
  }
  const programmingMessage = earlyState?.history?.at(-1) === serviceMessage.slice(0,500)
    ? earlyState.resolved_message || serviceMessage : serviceMessage;
  const weekdayQuestion = packageWeekdayClarification(programmingMessage, earlyState?.package_context);
  if (!req.query?.operation && !eventReply && weekdayQuestion) {
    // The final native response must retain the clarification, not replace it
    // with public dates, a stale model answer or the package catalogue.
    return res.status(200).json({quote_request:'ROOM_LIST',can_collect:'NAO',confirmation_text:'',
      quote_text:weekdayQuestion,conversation_text:weekdayQuestion,matched:false,
      match_type:'programming_clarification',availability_checked:false,
      ...control({operation:'remember_response',state:earlyState,response_text:weekdayQuestion})});
  }
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Missing Supabase configuration.' });
  }

  let userMessage = isAudioInput(incomingMessage) ? incomingMessage : safeTypedMessage(incomingMessage);
  let conversationState: any;
  try {
    const state = typeof req.body?.state === 'string' ? JSON.parse(req.body.state) : req.body?.state;
    conversationState = state;
    if (isAudioInput(userMessage)) userMessage = audioMessage(userMessage, state) || AUDIO_UNAVAILABLE;
    if (state?.version === 2 && state.history?.at(-1) === userMessage && typeof state.resolved_message === 'string') userMessage = state.resolved_message;
  } catch { /* Legacy or invalid state: use only the actual message. */ }
  if (isAudioInput(userMessage) || userMessage === AUDIO_UNAVAILABLE) {
    return res.status(200).json({quote_request:'ROOM_LIST',quote_text:AUDIO_RETRY,conversation_text:AUDIO_RETRY,matched:false,availability_checked:false});
  }
  if (!userMessage) {
    return res.status(400).json({ error: 'Missing user_message.' });
  }
  // Reuse the controller's state/privacy/TTL validation. The response must
  // belong to this actual user turn, not merely be the last assistant text
  // left over from an earlier meal, photo, quote or conversation.
  const checked = control({operation:'remember_response',state:req.body?.state});
  const safeState = 'state' in checked && checked.state ? JSON.parse(checked.state) : null;
  const sourceMessage = isAudioInput(incomingMessage)
    ? audioMessage(incomingMessage,safeState) || '' : safeTypedMessage(incomingMessage);
  const currentInput = sourceMessage.slice(0,2000);
  const currentState = safeState?.history?.at(-1) === currentInput.slice(0,500)
    && safeState?.resolved_message === userMessage.slice(0,500);
  if(req.query?.operation==='offers'&&safeState?.flexible_stay)
    return res.status(200).json({quote_request:'ROOM_DONE',quote_text:'',conversation_text:'',state:JSON.stringify(safeState),availability_checked:false});
  if(!req.query?.operation&&currentState&&safeState?.flexible_stay){
    const search=safeState.flexible_stay;
    let results;
    if(!flexibleStayQuestion(search,safeState)){
      try{
        const client=createClient(supabaseUrl,supabaseKey);
        const [{data:rooms,error:roomError},{data:packages,error:packageError}]=await Promise.all([
          client.from('room_types').select('*').eq('active',true),client.from('packages').select('*').eq('active',true)]);
        if(roomError||packageError||!Array.isArray(rooms)||!rooms.length||!Array.isArray(packages))throw Error('Unable to compare motor tariffs');
        results=compareFlexibleStays(search,safeState,rooms,packages);search.results=results;
      }catch{
        delete search.results;
        const answer='Não consegui comparar as tarifas agora. Não vou apresentar valores antigos como atuais. Podemos tentar novamente ou falar com a recepção pelo (91) 98100-0800.';
        return res.status(200).json({quote_request:'ROOM_LIST',quote_state:'',can_collect:'NAO',confirmation_text:'',
          quote_text:answer,conversation_text:answer,state:JSON.stringify(safeState),matched:false,
          match_type:'flexible_stay_unavailable',availability_checked:false,requires_human_confirmation:true});
      }
    }
    const answer=flexibleStayAnswer(search,safeState);
    return res.status(200).json({quote_request:'ROOM_LIST',quote_state:'',can_collect:'NAO',confirmation_text:'',
      quote_text:answer,conversation_text:answer,matched:false,match_type:'flexible_stay_search',availability_checked:false,requires_human_confirmation:true,
      ...control({operation:'remember_response',state:safeState,response_text:answer,flexible_results:results})});
  }
  const previous = safeState?.turns?.at(-2);
  const latest = safeState?.turns?.at(-1);
  const currentAnswer = currentState
    && (!conversationState?.guest_inquiry || safeState?.guest_inquiry)
    && (!conversationState?.stay_date_pending || safeState?.stay_date_pending)
    && previous?.role === 'user' && previous.text === currentInput.slice(0,900)
    && latest?.role === 'assistant' && latest.text?.trim()
    && !photoClarificationQuestion(latest.text) ? latest.text : '';
  const informationResult = (fallback: string, match_type: string, authoritative=false) => {
    const answer = withFullPeriodNote(authoritative ? fallback : currentAnswer || fallback, userMessage, conversationState);
    // A model answer that promises a team action becomes the actual handoff.
    return {quote_request:!authoritative&&currentAnswer&&teamPromise(currentAnswer)?'HUMANO':'ROOM_LIST',quote_text:answer,conversation_text:answer,
      matched:false,match_type,availability_checked:false,
      ...control({operation:'remember_response',state:safeState,response_text:answer})};
  };
  if(!req.query?.operation&&roomDetailInquiry(userMessage)
    &&(!namedPackageInquiry(userMessage)||packageRoomDetailFollowup(userMessage,safeState?.package_context))){
    const supabase=createClient(supabaseUrl,supabaseKey);
    const {data:rooms,error}=await supabase.from('room_types').select('*').eq('active',true);
    if(error)return res.status(500).json({error:'Unable to load room information.'});
    const focus=readPackageContext(safeState?.package_context);
    const currentRoomTopic=['room_info','room_photos'].includes(safeState?.topic)&&Number.isFinite(safeState?.topic_at)
      &&safeState.topic_at<=Date.now()&&Date.now()-safeState.topic_at<=30*60000;
    const references=focus||currentRoomTopic?[safeState?.subject||'',...(safeState?.turns||[]).slice(-8).reverse().map((turn:any)=>String(turn.text||''))]:[];
    const answer=roomDetailAnswer(userMessage,rooms||[],references)!;
    const routed=control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    return res.status(200).json({quote_request:'ROOM_LIST',quote_text:answer,conversation_text:answer,
      can_collect:'NAO',confirmation_text:'',matched:false,match_type:'room_detail',availability_checked:false,
      ...(focus?{package_id:focus.id,package_name:focus.name}:{}),
      ...control({operation:'remember_response',state:'state' in routed?routed.state:safeState,response_text:answer,
        ...(focus?{package_context:focus}:{})})});
  }
  if (!req.query?.operation) {
    if (currentState && safeState?.arrival_time) {
      const handoff=safeState.arrival_time.status==='human_review';
      return res.status(200).json({...informationResult(handoff?arrivalTimeHandoff:arrivalTimeQuestion,'arrival_time_consultation'),
        quote_request:handoff?'HUMANO':'ROOM_LIST',can_collect:'NAO',confirmation_text:''});
    }
    if (currentState && safeState?.stay_date_pending) {
      // A paid-extra mention such as "lua de mel" must not replace the
      // unresolved date question with a kit photo or a price. Candidates are
      // still not confirmed room facts, and an expired state cannot block.
      return res.status(200).json(informationResult(stayDateClarification(safeState.stay_date_pending),'stay_date_clarification',safeState.stay_date_pending.reason==='alternative_dates'));
    }
    if (currentState && safeState?.guest_inquiry) {
      const fallback = safeState.guest_inquiry.kind === 'dining'
        ? 'Pode detalhar sua dúvida sobre a refeição ou a visita ao restaurante?'
        : safeState.guest_inquiry.kind === 'day_use'
        ? 'Pode detalhar sua dúvida sobre o Day Use?'
        : safeState.guest_inquiry.kind === 'lodging_faq'
        ? locmilAnswer(userMessage) || 'Pode detalhar qual informação do hotel você deseja esclarecer?'
        : 'Pode detalhar qual informação do hotel você deseja esclarecer?';
      return res.status(200).json(informationResult(fallback,'guest_information'));
    }
    // A refusal followed by an informational question must retain the current
    // answer, not fall through to unsolicited leisure/extra media. Explicit
    // human, operational and existing-reservation requests keep their earlier
    // routes; photo requests do not establish a current assistant answer here.
    if (currentAnswer && stripNegatedHumanRequests(currentInput) !== currentInput
      && !explicitHumanRequest(currentInput)
      && !eventInquiry(currentInput) && !publicEventInquiry(currentInput)
      && !extraPhotoRequest(currentInput)) {
      return res.status(200).json(informationResult(currentAnswer,'human_refusal_information'));
    }
  }
  if (req.query?.operation === 'offers' && (safeState?.stay_date_pending || safeState?.arrival_time)
    && latest?.role === 'assistant' && latest.text === stripAssistantDisclosure(currentInput)
    && previous?.role === 'user' && safeState.history?.at(-1) === previous.text.slice(0,500)) {
    return res.status(200).json({quote_request:'ROOM_DONE',quote_text:'',conversation_text:'',
      matched:false,match_type:'stay_date_clarification',availability_checked:false,state:JSON.stringify(safeState)});
  }
  // A question about the customer's document is not a hotel photo request.
  // Leave the attachment conversation to its existing response/human flow.
  if (!req.query?.operation && documentPhotoInquiry(userMessage)) {
    return res.status(200).json(informationResult('Pode detalhar sua dúvida sobre o anexo?','document_information'));
  }

  // A retry with no recent, identified photo must ask its subject, not select
  // an old room/service or fall through to the package/hotel qualification.
  if (!req.query?.operation && photoRetryRequest(userMessage)) {
    return res.status(200).json({quote_request:'ROOM_LIST',quote_text:PHOTO_CLARIFY,conversation_text:PHOTO_CLARIFY,matched:false,availability_checked:false,...control({operation:'remember_response',state:req.body?.state,response_text:PHOTO_CLARIFY})});
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  if (!req.query?.operation && publicEventInquiry(userMessage)) {
    const answer=(conversationState?.first_turn === true ? 'Olá! Que bom receber seu contato no Hotel Solar. ☀️\n\n' : '')+publicEventAnswer(userMessage);
    return res.status(200).json({quote_request:'ROOM_LIST',quote_text:answer,conversation_text:answer,match_type:'public_programming',availability_checked:false,...control({operation:'remember_response',state:req.body?.state,response_text:answer,clear_subject:true,clear_package:true})});
  }
  const event=readEvent(conversationState?.event);
  if(!req.query?.operation && event) {
    let answer=event.answer;
    if(event.status==='ready') {
      try {const delivered=await deliverEvent(event,String(req.body?.subscriber_id||''));conversationState.event=delivered.event;answer=delivered.answer;}
      catch {answer=deliveryFailed;}
    }
    return res.status(200).json({quote_request:'ROOM_LIST',quote_text:answer,conversation_text:answer,availability_checked:false,state:JSON.stringify(conversationState)});
  }
  if (req.query?.operation === 'next' && userMessage.startsWith('SITE_ID|')) return res.status(200).json(sitePhotoResult(true,userMessage));
  if (!req.query?.operation && reservaPhotoRequest(userMessage)) {
    const result=sitePhotoResult();
    return res.status(200).json({...result,...control({operation:'remember_response',state:req.body?.state,response_text:result.conversation_text,clear_subject:true})});
  }
  if (!req.query?.operation && eventInquiry(userMessage) && !/fotos?|imagens|galeria/i.test(userMessage)) {
    return res.status(200).json({quote_request:'ROOM_LIST',quote_text:eventContactText,conversation_text:eventContactText,availability_checked:false,...control({operation:'remember_response',state:req.body?.state,response_text:eventContactText,clear_subject:true})});
  }
  if (req.query?.operation === 'next' && userMessage.startsWith('EXTRA_ID|')) {
    const {data: extras,error}=await supabase.from('extras').select('*').eq('active',true);
    if(error) return res.status(500).json({error:'Unable to load extra media.'});
    const pendingBoat = (userMessage.split('|')[2] || '').split(',').includes('BARCO');
    const included = pendingBoat && userMessage.endsWith('|INCLUDED')
      && await catalogBoatBenefit(supabase, readPackageContext(conversationState?.package_context));
    const reference = pendingBoat && !included ? userMessage.replace(/\|INCLUDED$/, '|PAID') : userMessage;
    return res.status(200).json(nextExtraMedia(reference,extras||[]));
  }
  if (req.query?.operation === 'next') {
    const {data: rooms, error} = await supabase.from('room_types').select('id,name').eq('active', true);
    if (error) return res.status(500).json({error:error.message});
    return res.status(200).json(nextRoomMedia(userMessage, rooms || []));
  }
  const offersOnly=req.query?.operation==='offers';
  const focusedPackage = !discovery&&conversationState?.topic === 'package_info' ? readPackageContext(conversationState.package_context) : undefined;
  // Inclusions such as the boat belong to the package, not to a new paid-extra
  // offer. Resolve these continuations before the proactive media/extra branch.
  if (!offersOnly && focusedPackage && (packageFollowup(userMessage)
    || focusedPackage.id === newYearCampaignPackage.id && endOfYearMention(userMessage))
    && (!namedPackageInquiry(userMessage)||focusedPackageNameReference(userMessage,focusedPackage)
      ||packageOccupancyFollowup(userMessage,focusedPackage))) {
    const [{data: packages,error: packageError},{data: rooms,error: roomError}] = await Promise.all([
      supabase.from('packages').select('*').eq('active',true),
      supabase.from('room_types').select('*').eq('active',true),
    ]);
    if (packageError || roomError) return res.status(500).json({error:'Unable to load package information.'});
    const catalogPackage = (packages || []).find((item: PackageRecord) => currentPackage(item)&&item.id === focusedPackage.id);
    if (!catalogPackage) {
      const answer = 'Esse pacote não está mais disponível no catálogo ativo. Qual período ou pacote você gostaria de consultar?';
      return res.status(200).json({quote_request:'ROOM_LIST',quote_text:answer,conversation_text:answer,availability_checked:false,...control({operation:'remember_response',state:req.body?.state,response_text:answer,clear_package:true})});
    }
    const pkg = safeBoatPackageCopy(catalogPackage);
    const facts = conversationState?.facts || {};
    const family = familyAccommodation(conversationState, facts.guests || 0);
    // Extra nights around the full package (31/12–04/01) are the same package.
    const differentDates = (facts.check_in && facts.check_in !== pkg.start_iso_date && !(facts.check_in < String(pkg.start_iso_date) && (!facts.check_out || facts.check_out >= String(pkg.end_iso_date))))
      || (facts.check_out && facts.check_out !== pkg.end_iso_date && !(facts.check_out > String(pkg.end_iso_date) && (!facts.check_in || facts.check_in <= String(pkg.start_iso_date))));
    const saleTerms = saleTermsFor(pkg);
    // 5+ people who need several apartments get the cheapest combination and
    // the team; a deposit with the balance later is the team's decision too.
    let handoff = false;
    const recommend = () => {
      const combination = packageGroupCombination(pkg,rooms || [],facts.guests,conversationState,saleTerms);
      if (combination) handoff = true;
      return combination || packageRecommendation(pkg,rooms || [],facts.guests,conversationState,saleTerms);
    };
    const reply = packageDepositQuestion(userMessage)
      ? (handoff = true, packageDepositAnswer)
      : packageAcknowledgment(userMessage)
      ? `Certo! Continuamos falando do pacote ${pkg.name}. Pode me dizer qual outra informação gostaria de esclarecer.`
      : packageGeneralInclusionQuestion(userMessage)
      ? formatPackageInclusions(pkg,facts.guests)
      : packageInclusionFollowup(userMessage,focusedPackage)
      ? packageInclusionReply(pkg,userMessage,conversationState?.history||[])
      : packageInstallmentQuestion(userMessage) && !childPolicyQuestion(userMessage)
      ? formatPackageInstallments(pkg)
      : packagePaymentQuestion(userMessage) && !childPolicyQuestion(userMessage)
      ? formatPackagePayment(pkg,facts.guests,saleTerms.siteUrl)
      : packageHowToBook(userMessage)
      ? formatPackageHowToBook(pkg,facts.guests)
      : differentDates
      ? `O pacote ${pkg.name} tem período de ${formatDate(pkg.start_iso_date)} a ${formatDate(pkg.end_iso_date)}. As datas que você informou são diferentes${pkg.full_period_required ? ', e esse pacote exige o período completo' : ''}. Você quer continuar consultando esse pacote ou deseja outra estadia? Não alterei suas datas nem confirmei uma reserva.`
      : !facts.guests && newYearStayRange(userMessage) && readNewYearStayRequest(conversationState?.full_period_extended,facts)
      ? 'Para quantas pessoas seria? Me diga quantos adultos e a idade das crianças que eu calculo o pacote completo para vocês.'
      : family.pending && !childPolicyQuestion(userMessage)
      ? familyAgeQuestionFor(conversationState)
      : childPolicyQuestion(userMessage) || childAgeFollowup(userMessage) && !family.key
      ? packageChildReply(pkg,userMessage)
      : childAgeFollowup(userMessage) && family.key
      ? recommend()
      : packageBookingRequest(userMessage)
      ? `Vamos continuar com o pacote ${pkg.name}, de ${formatDate(pkg.start_iso_date)} a ${formatDate(pkg.end_iso_date)}. ${!facts.guests ? 'Quantas pessoas vão se hospedar, contando adultos e crianças?' : facts.children_pending ? familyAgeQuestionFor(conversationState) : 'Para seguir com a opção escolhida, peça para falar com a recepção, que confere as condições e a disponibilidade.'} Ainda não há reserva confirmada.`
      : packageRecommendationInquiry(userMessage) || groupInMessage(userMessage,conversationState)
      ? recommend()
      : pkg.id === newYearCampaignPackage.id && !programmeQuestion(userMessage)
      ? facts.guests && !family.pending ? recommend() : packageOfferSummary(pkg,rooms || [],saleTerms)
      : formatPackageDetails(pkg,rooms || [],true);
    const answer=withFullPeriodNote(reply,userMessage,conversationState);
    return res.status(200).json({quote_request:handoff?'HUMANO':'ROOM_LIST',quote_text:answer,conversation_text:answer,
      package_id:pkg.id,package_name:pkg.name,match_type:handoff?'package_handoff':'package_followup',availability_checked:false,
      ...control({operation:'remember_response',state:req.body?.state,response_text:answer,
        package_context:{id:pkg.id,name:pkg.name,start_date:pkg.start_iso_date,end_date:pkg.end_iso_date}})});
  }
  const assistant=offersOnly ? userMessage : conversationState?.turns?.at(-1)?.role==='assistant' ? String(conversationState.turns.at(-1).text || '') : '';
  const codes=requestedExtraCodes(offersOnly?'':userMessage,assistant,conversationState?.extra_photo_requests||[]);
  if(codes.length) {
    const {data: extras,error}=await supabase.from('extras').select('*').eq('active',true);
    if(error) return res.status(500).json({error:'Unable to load extra media.'});
    let includedBoat = false;
    if (codes.includes('BARCO') && focusedPackage) {
      includedBoat = await catalogBoatBenefit(supabase, focusedPackage);
    }
    const result=extraMediaResult(codes,extras||[],includedBoat);
    if(!offersOnly && assistant && !extraCodes(userMessage).length && !/extras|servicos|experiencias/.test(normalizeExtra(userMessage))) {
      const safeAssistant = codes.includes('BARCO') ? safeBoatCopy(assistant, includedBoat) : assistant;
      result.conversation_text=(safeAssistant.slice(0,800)+'\n\n'+result.conversation_text).slice(0,1900);
      result.quote_text=result.conversation_text;
    }
    const remembered=control({operation:'remember_response',state:req.body?.state,response_text:result.conversation_text,extra_photo_requests:result.photo_codes});
    return res.status(200).json({...result,...remembered});
  }
  if(offersOnly) return res.status(200).json({quote_request:'ROOM_DONE',conversation_text:'',quote_text:'',...control({operation:'remember_response',state:req.body?.state})});
  const [{ data: packages, error: packageError }, { data: rooms, error: roomError }] = await Promise.all([
    supabase.from('packages').select('*').eq('active', true),
    supabase.from('room_types').select('*').eq('active', true),
  ]);

  if (roomError) return res.status(500).json({ error: roomError.message });
  const media = resolveRoomMedia(userMessage, rooms || []);
  const remember = (response_text: string, room_name = '', clear_subject = false) => control({operation:'remember_response', state:req.body?.state, response_text, room_name, clear_subject});
  if (media) {
    const gallery = ['room_gallery','room_comparison_gallery','room_comparison_information','room_gallery_information'].includes(media.match_type);
    const comparison=media.match_type.startsWith('room_comparison');
    return res.status(200).json({...media,can_collect:'NAO',confirmation_text:'',
      ...remember(gallery&&!comparison ? `Fotos solicitadas das categorias: ${('room_names' in media ? media.room_names : []).join(', ')}. Se a referência a uma delas for ambígua, pergunte qual.` : media.conversation_text, gallery ? '' : media.room_name, gallery)});
  }
  const bestPackageScore = Math.max(0, ...(packages || []).map(pkg => scorePackage(userMessage, pkg)));
  if (extraPhotoRequest(userMessage) && !isPackageIntent(userMessage, bestPackageScore)) {
    return res.status(200).json({quote_request:'ROOM_LIST',quote_text:PHOTO_CLARIFY,conversation_text:PHOTO_CLARIFY,matched:false,availability_checked:false,...remember(PHOTO_CLARIFY,'',true)});
  }
  if (packageError) return res.status(500).json({ error: packageError.message });
  if (!isPackageIntent(userMessage, bestPackageScore)) {
    return res.status(200).json(informationResult('Pode detalhar como podemos ajudar com sua dúvida sobre o hotel?','general_information'));
  }
  const today=belemClock(Date.now()).day;
  const asksNext=discovery&&/\bproxim[oa]s?\b/.test(normalize(userMessage));
  const endOfYear=discovery&&/\b(?:fim|final) (?:do|de) ano\b/.test(normalize(userMessage));
  const currentPackages=(packages||[]).filter((pkg:PackageRecord)=>currentPackage(pkg)
    &&(!endOfYear||pkg.start_iso_date!.slice(5,7)==='12'));
  let nextPackage:PackageRecord|undefined;
  if(asksNext){
    const candidates=(packages||[]).filter((pkg:PackageRecord)=>validPackagePeriod(pkg)&&pkg.start_iso_date!>=today
      &&(!namedPackageInquiry(userMessage)||scorePackage(userMessage,pkg)>=20))
      .sort((a:PackageRecord,b:PackageRecord)=>a.start_iso_date!.localeCompare(b.start_iso_date!));
    if(!candidates.length){
      const answer='Não encontrei um próximo pacote com período futuro válido entre os cadastros ativos consultados. Isso não significa que não haverá programação: a recepção pode verificar novidades. Não consultei disponibilidade de apartamentos.';
      return res.status(200).json({quote_request:'ROOM_LIST',quote_text:answer,conversation_text:answer,
        can_collect:'NAO',confirmation_text:'',matched:false,match_type:'next_package_unavailable',availability_checked:false,
        ...control({operation:'remember_response',state:req.body?.state,response_text:answer,clear_package:true})});
    }
    const first=candidates.filter((pkg:PackageRecord)=>pkg.start_iso_date===candidates[0].start_iso_date);
    if(first.length>1){
      const answer=fitWhatsApp('Os próximos pacotes cadastrados começam em '+formatDate(first[0].start_iso_date)+'. Estes são os cadastros ativos para essa data; a lista não confirma disponibilidade de apartamentos.\n\n'+formatPackageList(first,true),true);
      return res.status(200).json({quote_request:'PACKAGE_LIST',quote_text:answer,conversation_text:answer,
        can_collect:'NAO',confirmation_text:'',matched:true,match_type:'next_package_list',availability_checked:false,
        ...control({operation:'remember_response',state:req.body?.state,response_text:answer,clear_package:true})});
    }
    nextPackage=first[0];
  }
  if (!currentPackages.length) {
    return res.status(200).json({
      quote_request: 'NO_PACKAGE',
      quote_text: 'No momento não há pacotes ativos cadastrados no motor de reservas.',
      conversation_text: 'No momento não há pacotes ativos cadastrados no motor de reservas. Posso ajudar com uma simulação de diárias: para quantas pessoas será a estadia?',
      matched: false,
      ...control({operation:'remember_response',state:req.body?.state,clear_package:true}),
    });
  }

  const ranked = (currentPackages as PackageRecord[])
    .map(pkg => ({ pkg, score: scorePackage(userMessage, pkg) }))
    .sort((a, b) => b.score - a.score);
  // A Réveillon campaign lead asking for "o pacote de final de ano" means the
  // campaign package, not the list of December packages (audit 05/10/2026).
  const campaignPackage=!nextPackage&&endOfYearMention(userMessage)&&newYearCampaignFocus(conversationState?.campaign,conversationState?.facts)
    ?(currentPackages as PackageRecord[]).find(pkg=>pkg.id===newYearCampaignPackage.id):undefined;
  const best = nextPackage?{pkg:nextPackage,score:scorePackage(userMessage,nextPackage)}
    :campaignPackage?{pkg:campaignPackage,score:100}:ranked[0];

  if (best.score < 20&&!nextPackage) {
    return res.status(200).json({
      quote_request: 'PACKAGE_LIST',
      quote_text: formatPackageList(currentPackages as PackageRecord[]),
      conversation_text: formatPackageList(currentPackages as PackageRecord[], true),
      matched: true,
      match_type: 'list',
      availability_checked:false,
      ...control({operation:'remember_response',state:req.body?.state,response_text:formatPackageList(currentPackages as PackageRecord[], true),clear_package:true}),
    });
  }

  const pkg = safeBoatPackageCopy(best.pkg);
  if (childPolicyQuestion(userMessage)) {
    const answer=packageChildReply(pkg,userMessage);
    return res.status(200).json({quote_request:'ROOM_LIST',quote_text:answer,conversation_text:answer,
      package_id:pkg.id,package_name:pkg.name,matched:true,match_type:'package_child_information',availability_checked:false,
      ...control({operation:'remember_response',state:req.body?.state,response_text:answer,
        package_context:{id:pkg.id,name:pkg.name,start_date:pkg.start_iso_date,end_date:pkg.end_iso_date}})});
  }
  if(packageDepositQuestion(userMessage)||packagePaymentQuestion(userMessage)){
    const deposit=packageDepositQuestion(userMessage);
    const answer=deposit?packageDepositAnswer:formatPackagePayment(pkg,conversationState?.facts?.guests,saleTermsFor(pkg).siteUrl);
    return res.status(200).json({quote_request:deposit?'HUMANO':'ROOM_LIST',quote_text:answer,conversation_text:answer,
      package_id:pkg.id,package_name:pkg.name||'',matched:true,match_type:'package_payment',can_collect:'NAO',confirmation_text:'',availability_checked:false,
      ...control({operation:'remember_response',state:req.body?.state,response_text:answer,
        package_context:{id:pkg.id,name:pkg.name,start_date:pkg.start_iso_date,end_date:pkg.end_iso_date}})});
  }
  // A group stated with the question ("Qual valor do Réveillon para 4
  // pessoas?") goes straight to the card for that group.
  const statedGroup=!nextPackage?groupInMessage(userMessage,conversationState):0;
  if(statedGroup&&!familyAccommodation(conversationState,statedGroup).pending){
    const terms=saleTermsFor(pkg);
    const combination=packageGroupCombination(pkg,(rooms||[]) as RoomRecord[],statedGroup,conversationState,terms);
    const answer=combination||packageRecommendation(pkg,(rooms||[]) as RoomRecord[],statedGroup,conversationState,terms);
    return res.status(200).json({quote_request:combination?'HUMANO':'ROOM_LIST',quote_text:answer,conversation_text:answer,
      package_id:pkg.id,package_name:pkg.name||'',matched:true,match_type:combination?'package_group_combination':'package_recommendation',
      can_collect:'NAO',confirmation_text:'',availability_checked:false,
      ...control({operation:'remember_response',state:req.body?.state,response_text:answer,
        package_context:{id:pkg.id,name:pkg.name,start_date:pkg.start_iso_date,end_date:pkg.end_iso_date}})});
  }
  const reference = `PACKAGE_ID|${pkg.id}`;
  const nextNotice=nextPackage?'Entre os pacotes ativos consultados, este é o próximo pacote cadastrado a começar. As datas abaixo são do pacote, não uma escolha de estadia ou confirmação de disponibilidade.\n\n':'';
  // Réveillon: starting prices by group size and the question for the group
  // (audit 05/10/2026: 75% stopped after the full table led by the LOFT).
  const offer=!nextPackage&&pkg.id===newYearCampaignPackage.id&&!programmeQuestion(userMessage)
    ?packageOfferSummary(pkg,(rooms||[]) as RoomRecord[],saleTermsFor(pkg)):undefined;
  const conversationalDetails=offer||fitWhatsApp(nextNotice+formatPackageDetails(pkg,(rooms||[]) as RoomRecord[],true),true);
  return res.status(200).json({
    quote_request: reference,
    quote_text: offer||fitWhatsApp(nextNotice+formatPackageDetails(pkg, (rooms || []) as RoomRecord[])),
    conversation_text: conversationalDetails,
    package_image_url: pkg.image_url
      ? `https://reservas.hotelsolar.tur.br/api/package-image?code=${encodeURIComponent(reference)}`
      : '',
    package_id: pkg.id,
    package_name: pkg.name || '',
    matched: true,
    match_type: nextPackage?'next_package':'specific',
    availability_checked:false,
    score: best.score,
    ...control({operation:'remember_response',state:req.body?.state,response_text:conversationalDetails,
      package_context:{id:pkg.id,name:pkg.name,start_date:pkg.start_iso_date,end_date:pkg.end_iso_date}}),
  });
}
