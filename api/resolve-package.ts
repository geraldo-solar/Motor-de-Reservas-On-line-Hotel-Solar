import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { resolveRoomMedia, nextRoomMedia } from '../utils/roomMedia.js';
import { control } from './conversation-control.js';
import { PHOTO_CLARIFY, documentPhotoInquiry, photoClarificationQuestion, photoRetryRequest } from '../utils/photoIntent.js';
import { requestedExtraCodes, extraCodes, extraPhotoRequest, extraMediaResult, nextExtraMedia, normalizeExtra } from '../utils/extraMedia.js';
import { eventInquiry, eventContactText, reservaPhotoRequest, sitePhotoResult } from '../utils/hotelInfo.js';
import { readEvent } from '../utils/eventInquiry.js';
import { deliverEvent, deliveryFailed, acceptEventReceipt } from '../utils/eventDelivery.js';
import { publicEventInquiry, publicEventAnswer } from '../utils/publicEvents.js';
import { isAudioInput } from '../utils/audioTranscription.js';
import { AUDIO_RETRY, AUDIO_UNAVAILABLE, audioMessage } from '../utils/audioInput.js';
import { isAttachmentInput } from '../utils/attachmentAnalysis.js';
import { attachmentReceivedMessage } from '../utils/attachmentInput.js';
import { namedPackageInquiry, packageFollowup, packageBookingRequest, packageRecommendationInquiry, readPackageContext } from '../utils/packageContext.js';
import { packagePrices, packageRecommendation } from '../utils/packageReply.js';
import { childPolicyQuestion, childAgeFollowup, packageChildReply } from '../utils/packageChildInquiry.js';
import { stayDateClarification } from '../utils/stayDuration.js';
import { guestServiceRequest } from '../utils/guestService.js';
import { hotelPhoneInquiry, hotelContactAnswer } from '../utils/hotelContact.js';

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
  if(req.query?.operation==='event-receipt') {const r=await acceptEventReceipt(req.body);return res.status(r.code).json({status:r.status});}
  const incomingMessage = String(req.body?.user_message || req.body?.message || '').trim();
  if (isAttachmentInput(incomingMessage)) {
    const routed = control({operation:'route', user_message:incomingMessage, state:req.body?.state});
    const kind = 'attachment_kind' in routed ? routed.attachment_kind! : 'unreadable';
    const message = attachmentReceivedMessage(kind);
    return res.status(200).json({...routed, answer:message, quote_text:message, conversation_text:message,
      matched:false, match_type:'attachment', availability_checked:false});
  }
  let serviceMessage = incomingMessage;
  if (isAudioInput(incomingMessage)) {
    try {
      const state = typeof req.body?.state === 'string' ? JSON.parse(req.body.state) : req.body?.state;
      serviceMessage = audioMessage(incomingMessage, state) || '';
    } catch { serviceMessage = ''; }
  }
  if (!req.query?.operation && hotelPhoneInquiry(serviceMessage)) {
    const routed = control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    return res.status(200).json({...routed,quote_request:'ROOM_LIST',
      quote_text:hotelContactAnswer,conversation_text:hotelContactAnswer,
      matched:false,match_type:'hotel_contact',availability_checked:false});
  }
  if (!req.query?.operation && guestServiceRequest(serviceMessage)) {
    // Use the same existing handoff code even when invoked directly. No
    // catalog, private-event delivery, document issuance or service order runs.
    const routed = control({operation:'route',user_message:incomingMessage,state:req.body?.state});
    const answer = 'answer' in routed ? routed.answer : '';
    return res.status(200).json({...routed,quote_text:answer,conversation_text:answer,
      matched:false,match_type:'guest_service',availability_checked:false});
  }
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Missing Supabase configuration.' });
  }

  let userMessage = incomingMessage;
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
    ? audioMessage(incomingMessage,safeState) || '' : incomingMessage;
  const currentInput = sourceMessage.slice(0,2000);
  const currentState = safeState?.history?.at(-1) === currentInput.slice(0,500)
    && safeState?.resolved_message === userMessage.slice(0,500);
  const previous = safeState?.turns?.at(-2);
  const latest = safeState?.turns?.at(-1);
  const currentAnswer = currentState
    && (!conversationState?.guest_inquiry || safeState?.guest_inquiry)
    && (!conversationState?.stay_date_pending || safeState?.stay_date_pending)
    && previous?.role === 'user' && previous.text === currentInput.slice(0,900)
    && latest?.role === 'assistant' && latest.text?.trim()
    && !photoClarificationQuestion(latest.text) ? latest.text : '';
  const informationResult = (fallback: string, match_type: string) => {
    const answer = currentAnswer || fallback;
    return {quote_request:'ROOM_LIST',quote_text:answer,conversation_text:answer,
      matched:false,match_type,availability_checked:false,
      ...control({operation:'remember_response',state:safeState,response_text:answer})};
  };
  if (!req.query?.operation) {
    if (currentState && safeState?.stay_date_pending) {
      // A paid-extra mention such as "lua de mel" must not replace the
      // unresolved date question with a kit photo or a price. Candidates are
      // still not confirmed room facts, and an expired state cannot block.
      return res.status(200).json(informationResult(stayDateClarification(safeState.stay_date_pending),'stay_date_clarification'));
    }
    if (currentState && safeState?.guest_inquiry) {
      const fallback = safeState.guest_inquiry.kind === 'dining'
        ? 'Pode detalhar sua dúvida sobre a refeição ou a visita ao restaurante?'
        : safeState.guest_inquiry.kind === 'day_use'
        ? 'Pode detalhar sua dúvida sobre o Day Use?'
        : 'Pode detalhar qual informação do hotel você deseja esclarecer?';
      return res.status(200).json(informationResult(fallback,'guest_information'));
    }
  }
  if (req.query?.operation === 'offers' && safeState?.stay_date_pending
    && latest?.role === 'assistant' && latest.text === currentInput
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
    return res.status(200).json({quote_request:'ROOM_LIST',quote_text:answer,conversation_text:answer,match_type:'public_programming',availability_checked:false,...control({operation:'remember_response',state:req.body?.state,response_text:answer,clear_subject:true})});
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
    return res.status(200).json(nextExtraMedia(userMessage,extras||[]));
  }
  if (req.query?.operation === 'next') {
    const {data: rooms, error} = await supabase.from('room_types').select('id,name').eq('active', true);
    if (error) return res.status(500).json({error:error.message});
    return res.status(200).json(nextRoomMedia(userMessage, rooms || []));
  }
  const offersOnly=req.query?.operation==='offers';
  const focusedPackage = conversationState?.topic === 'package_info' ? readPackageContext(conversationState.package_context) : undefined;
  // Inclusions such as the boat belong to the package, not to a new paid-extra
  // offer. Resolve these continuations before the proactive media/extra branch.
  if (!offersOnly && focusedPackage && packageFollowup(userMessage) && !namedPackageInquiry(userMessage)) {
    const [{data: packages,error: packageError},{data: rooms,error: roomError}] = await Promise.all([
      supabase.from('packages').select('*').eq('active',true),
      supabase.from('room_types').select('*').eq('active',true),
    ]);
    if (packageError || roomError) return res.status(500).json({error:'Unable to load package information.'});
    const pkg = (packages || []).find((item: PackageRecord) => item.id === focusedPackage.id);
    if (!pkg) {
      const answer = 'Esse pacote não está mais disponível no catálogo ativo. Qual período ou pacote você gostaria de consultar?';
      return res.status(200).json({quote_request:'ROOM_LIST',quote_text:answer,conversation_text:answer,availability_checked:false,...control({operation:'remember_response',state:req.body?.state,response_text:answer,clear_package:true})});
    }
    const facts = conversationState?.facts || {};
    const differentDates = (facts.check_in && facts.check_in !== pkg.start_iso_date) || (facts.check_out && facts.check_out !== pkg.end_iso_date);
    const answer = differentDates
      ? `O pacote ${pkg.name} tem período de ${formatDate(pkg.start_iso_date)} a ${formatDate(pkg.end_iso_date)}. As datas que você informou são diferentes${pkg.full_period_required ? ', e esse pacote exige o período completo' : ''}. Você quer continuar consultando esse pacote ou deseja outra estadia? Não alterei suas datas nem confirmei uma reserva.`
      : childPolicyQuestion(userMessage) || childAgeFollowup(userMessage)
      ? packageChildReply(pkg,userMessage)
      : packageBookingRequest(userMessage)
      ? `Vamos continuar com o pacote ${pkg.name}, de ${formatDate(pkg.start_iso_date)} a ${formatDate(pkg.end_iso_date)}. ${!facts.guests ? 'Quantas pessoas vão se hospedar, contando adultos e crianças?' : facts.children_pending ? 'Quais são as idades das crianças?' : 'Para seguir com a opção escolhida, peça para falar com a recepção, que confere as condições e a disponibilidade.'} Ainda não há reserva confirmada.`
      : packageRecommendationInquiry(userMessage)
      ? packageRecommendation(pkg,rooms || [],conversationState?.facts?.guests)
      : formatPackageDetails(pkg,rooms || [],true);
    return res.status(200).json({quote_request:'ROOM_LIST',quote_text:answer,conversation_text:answer,
      package_id:pkg.id,package_name:pkg.name,match_type:'package_followup',availability_checked:false,
      ...control({operation:'remember_response',state:req.body?.state,response_text:answer,
        package_context:{id:pkg.id,name:pkg.name,start_date:pkg.start_iso_date,end_date:pkg.end_iso_date}})});
  }
  const assistant=offersOnly ? userMessage : conversationState?.turns?.at(-1)?.role==='assistant' ? String(conversationState.turns.at(-1).text || '') : '';
  const codes=requestedExtraCodes(offersOnly?'':userMessage,assistant,conversationState?.extra_photo_requests||[]);
  if(codes.length) {
    const {data: extras,error}=await supabase.from('extras').select('*').eq('active',true);
    if(error) return res.status(500).json({error:'Unable to load extra media.'});
    const includedBoat=/barco[^\n]{0,60}(ja incluido|sem cobranca adicional)/.test(normalizeExtra(assistant));
    const result=extraMediaResult(codes,extras||[],includedBoat);
    if(!offersOnly && assistant && !extraCodes(userMessage).length && !/extras|servicos|experiencias/.test(normalizeExtra(userMessage))) {
      result.conversation_text=(assistant.slice(0,800)+'\n\n'+result.conversation_text).slice(0,1900);
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
    const gallery = media.match_type === 'room_gallery';
    return res.status(200).json({...media, ...remember(gallery ? `Fotos solicitadas das categorias: ${('room_names' in media ? media.room_names : []).join(', ')}. Se a referência a uma delas for ambígua, pergunte qual.` : media.conversation_text, gallery ? '' : media.room_name, gallery)});
  }
  const bestPackageScore = Math.max(0, ...(packages || []).map(pkg => scorePackage(userMessage, pkg)));
  if (extraPhotoRequest(userMessage) && !isPackageIntent(userMessage, bestPackageScore)) {
    return res.status(200).json({quote_request:'ROOM_LIST',quote_text:PHOTO_CLARIFY,conversation_text:PHOTO_CLARIFY,matched:false,availability_checked:false,...remember(PHOTO_CLARIFY,'',true)});
  }
  if (packageError) return res.status(500).json({ error: packageError.message });
  if (!isPackageIntent(userMessage, bestPackageScore)) {
    return res.status(200).json(informationResult('Pode detalhar como podemos ajudar com sua dúvida sobre o hotel?','general_information'));
  }
  if (!packages?.length) {
    return res.status(200).json({
      quote_request: 'NO_PACKAGE',
      quote_text: 'No momento não há pacotes ativos cadastrados no motor de reservas.',
      conversation_text: 'No momento não há pacotes ativos cadastrados no motor de reservas. Posso ajudar com uma simulação de diárias: para quantas pessoas será a estadia?',
      matched: false,
      ...control({operation:'remember_response',state:req.body?.state,clear_package:true}),
    });
  }

  const ranked = (packages as PackageRecord[])
    .map(pkg => ({ pkg, score: scorePackage(userMessage, pkg) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];

  if (best.score < 20) {
    return res.status(200).json({
      quote_request: 'PACKAGE_LIST',
      quote_text: formatPackageList(packages as PackageRecord[]),
      conversation_text: formatPackageList(packages as PackageRecord[], true),
      matched: true,
      match_type: 'list',
      ...control({operation:'remember_response',state:req.body?.state,response_text:formatPackageList(packages as PackageRecord[], true),clear_package:true}),
    });
  }

  const pkg = best.pkg;
  if (childPolicyQuestion(userMessage)) {
    const answer=packageChildReply(pkg,userMessage);
    return res.status(200).json({quote_request:'ROOM_LIST',quote_text:answer,conversation_text:answer,
      package_id:pkg.id,package_name:pkg.name,matched:true,match_type:'package_child_information',availability_checked:false,
      ...control({operation:'remember_response',state:req.body?.state,response_text:answer,
        package_context:{id:pkg.id,name:pkg.name,start_date:pkg.start_iso_date,end_date:pkg.end_iso_date}})});
  }
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
    ...control({operation:'remember_response',state:req.body?.state,response_text:formatPackageDetails(pkg, (rooms || []) as RoomRecord[], true),
      package_context:{id:pkg.id,name:pkg.name,start_date:pkg.start_iso_date,end_date:pkg.end_iso_date}}),
  });
}
