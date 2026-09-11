import type { VercelRequest, VercelResponse } from '@vercel/node';
import { belemClock, readDailyGreeting, parseGreetingState, withDailyGreeting } from '../utils/dailyGreeting.js';
import { EXTRA_MEDIA_CODES, extraCodes, extraPhotoRequest } from '../utils/extraMedia.js';
import { PHOTO_CLARIFY, PHOTO_LOOKUP, documentPhotoInquiry, photoClarificationQuestion, photoDeliveryClaim, photoRetryRequest, shortPhotoRetry } from '../utils/photoIntent.js';
import { eventInquiry, eventContactText } from '../utils/hotelInfo.js';
import { advanceEvent, readEvent, eventFieldReply, type EventState } from '../utils/eventInquiry.js';
import { publicEventInquiry, publicEventFollowup, publicEventContext, publicEventAnswer } from '../utils/publicEvents.js';
import { isAudioInput, transcribeAudio } from '../utils/audioTranscription.js';
import { AUDIO_RETRY, AUDIO_UNAVAILABLE, audioMessage, audioSourceHash, readAudioTurn, type AudioTurn } from '../utils/audioInput.js';
import { isAttachmentInput, analyzeAttachment, type AttachmentKind } from '../utils/attachmentAnalysis.js';
import { attachmentAnswer, attachmentContextMessage, attachmentDecision, attachmentForMessage, attachmentSourceHash, readAttachmentTurn, type AttachmentTurn } from '../utils/attachmentInput.js';
import { packageInquiry, packageFollowup, packageBookingRequest, newTripRequest, readPackageContext, type PackageContext } from '../utils/packageContext.js';
import { guestInquiry, explicitLodgingRequest, type GuestInquiry } from '../utils/guestInquiry.js';
import { confirmedDiningPolicy, diningPolicyAnswer } from '../utils/diningPolicy.js';
import { childPolicyQuestion, childAgeFollowup } from '../utils/packageChildInquiry.js';
import { multiRoomRequest } from '../utils/lodgingScope.js';
import { guestServiceRequest, guestServiceContext, guestServiceAnswer } from '../utils/guestService.js';
import { hotelPhoneInquiry, hotelContactAnswer } from '../utils/hotelContact.js';
import { confirmedGuestFacilitiesPolicy, guestFacilityInquiry, guestFacilityAnswer } from '../utils/guestFacilities.js';
import { readFamilyParty, updateFamilyParty, type FamilyParty, type FamilyPartyResult } from '../utils/familyParty.js';
import { readStayDuration, readStayDatePending, stayDurationRequest, conflictingStayDuration, stayDateClarification, relativeStayDateMention, unparsedStayDateDeclaration, calendarDateMention, explicitStayEntry, explicitStayExit, type StayDuration, type StayDatePending } from '../utils/stayDuration.js';

// No bookings, stock queries or outbound messages. The HTTP adapter interprets
// audio/attachments; the conversation controller remains deterministic.
// User facts and conversational turns are separate. Assistant text NEVER updates facts.
type Facts = { check_in?: string; check_out?: string; guests?: number; extras: string[]; children_pending?: boolean };
type Quote = { version: number; id: string; created_at: number; check_in: string; check_out: string; guests: number; extras: string[]; options: { name: string; capacity: number; total: number }[] };
type GuestInquiryState = { kind: GuestInquiry; at: number };
type FamilyState = { family_party?: FamilyParty; family_clarification?: FamilyPartyResult['clarification'] };
type State = FamilyState & { version: 2; history: string[]; facts: Facts; greeted: boolean; first_turn?: boolean; changed?: boolean; pending?: { quote_id: string; option: string }; turns?: {role: 'user' | 'assistant'; text: string}[]; topic?: 'room_photos' | 'extra_photos' | 'extra_info' | 'photo_clarification' | 'public_events' | 'package_info'; package_context?: PackageContext; guest_inquiry?: GuestInquiryState; duration_request?: StayDuration; stay_date_pending?: StayDatePending; topic_at?: number; subject?: string; extra_photo_subjects?: string[]; resolved_message?: string; awaiting?: 'guests' | 'dates'; extra_photo_requests?: string[]; event?: EventState; audio?: AudioTurn; attachment?: AttachmentTurn };
const norm = (s: unknown) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s?/,.-]/g, ' ').replace(/\s+/g, ' ').trim();
const json = (v: unknown): any => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };
const months = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const numbers: Record<string, number> = { uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
const count = (s: string) => numbers[s] || Number(s);
const numberPattern = '(\\d{1,2}|uma|um|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez)';
// "Reserva Solar" is the proper name of the beach restaurant. Its word
// "reserva" must never start the lodging funnel, even if an upstream AI
// classifier proposes a quote. Restaurant/table questions stay informational.
const restaurantInquiry = (s: string) => !explicitLodgingRequest(s) && (/\breserva solar\b/.test(s) || /\b(cardapio|menu|restaurante|solar 73|avuado)\b/.test(s));
const lodging = (s: string) => !restaurantInquiry(s) && /\b(vaga|vagas|disponibilidade|hospedagem|estadia|diaria|diarias|reservar|reserva|quarto|quartos|apto|apartamento|loft|suite|cotacao|orcamento|pessoas|hospedes|casal|adultos)\b/.test(s);
const recommendation = (s: string) => /\b(indica|indicam|indicado|recomenda|recomendam|melhor|sugere|sugestao)\b/.test(s);
const question = (s: string) => s.includes('?') || /\b(qual|quais|quanto|quantos|como|onde|quando|indica|recomenda|poderia|pode me|gostaria de saber|tem vaga|tem disponibilidade|inclui|incluido)\b/.test(s);
// Explicit billing disputes require a person. General payment policies and
// ordinary comparisons between simulated room prices remain informational.
const paymentDispute = (s: string) => /\b(?:fui|foi|me|estou sendo|estao me)\s+cobrad[oa]\s+(?:duas|2)\s+vezes\b|\b(?:pagamento|cobranca)\s+(?:duplicad[oa]|em duplicidade)\b/.test(s)
  || /\b(?:link de pagamento|pagamento|cobranca|cobrando|cobrado|cobrada|boleto)\b/.test(s)
    && /\bvalor\b.{0,75}\b(?:errad[oa]|incorret[oa]|indevid[oa]|divergente|diferente do (?:combinado|acordado|orcamento|informado))\b/.test(s);
// Detect a request to stop promotional contact, not an inquiry about a hotel
// promotion. This routes to a human; it never changes subscription settings.
function marketingOptOut(s: string): boolean {
  const promotion = '(?:marketing|propagandas?|publicidade|promocao|promocoes|promocional|promocionais|publicitari[ao]s?|campanhas|newsletter|ofertas|lista de transmissao)';
  const object = `(?:(?:o|a|os|as|mais|nenhum|nenhuma|qualquer)\\s+)*(?:(?:envio|recebimento|disparo)\\s+(?:de|das|dos)\\s+)?(?:(?:mensagem|mensagens|comunicacao|comunicacoes)\\s+(?:(?:de|das|dos)\\s+)?)?${promotion}\\b`;
  // The refused object must be promotional contact itself, not a payment or
  // a room quote in one clause followed by a request for offers in another.
  if (new RegExp(`\\b(?:nao (?:autorizo|aceito|permito)|(?:nao (?:quero|desejo)|prefiro nao)\\s+(?:mais\\s+)?receber)\\s+${object}`).test(s)) return true;
  // Negated commands such as "não cancele" do not request removal.
  const request = s.replace(/\bnao\s+(?:pare|para|parem|remova|removam|retire|retirem|exclua|excluam|cancele|cancela|cancelem|suspenda|interrompa|descadastre)\b/g, '');
  return new RegExp(`\\b(?:pare|para|parem)\\s+de\\s+(?:me\\s+)?(?:mandar|enviar)\\s+${object}`).test(request)
    || new RegExp(`\\b(?:remova|removam|retire|retirem|exclua|excluam|tire|tirem|descadastre)\\s+(?:me|meu (?:numero|contato)|(?:este|esse) numero)\\s+(?:d[aeo]s?|dest[ae]s?|dess[ae]s?)\\s+(?:(?:lista|base)\\s+(?:de\\s+)?)?${promotion}\\b`).test(request)
    || new RegExp(`\\b(?:cancele|cancela|cancelem|suspenda|interrompa)\\s+${object}`).test(request);
}
const reservationChange = (s: string) => !/\bnao (?:vamos|vou|quero|preciso|desejo)\s+(?:mais )?(?:reagendar|remarcar|alterar|mudar|trocar)\b/.test(s)
  && (/\b(?:reagendar|remarcar)\b/.test(s) && /\b(?:quero|preciso|gostaria|podemos|posso|pode|conseguimos|consigo|minha|nossa)\b/.test(s)
    || /\b(?:alterar|mudar|trocar)\b.{0,65}\b(?:minha|nossa) reserva\b/.test(s));
const human = (s: string) => marketingOptOut(s) || paymentDispute(s) || reservationChange(s) || multiRoomRequest(s) || /\b(atendente|falar com (uma pessoa|alguem|a recepcao|um humano)|(?:chama|chame|chamar|encaminhar)(?:r?\s+(?:para|a|o))?\s+(?:recepcao|atendente)|atendimento humano|reclamacao|quero reclamar|cancelar minha reserva|reembolso|nao quero informar|prefiro nao informar)\b/.test(s) || s === 'recepcao';
const greeting = (s: string) => /^(oi|ola|bom dia|boa tarde|boa noite|tudo bem)([ ,.!?]*(tudo bem|bom dia|boa tarde|boa noite))?[ ,.!?]*$/.test(s);
// Asking to see something is informational, even with "quero" and a room name.
const mediaRequest = (s: string) => /\b(fotos?|fotografias?|imagem|imagens|videos?|galeria|album)\b/.test(s);
const personal = (s: string) => /@|\b(?:\d[.\s-]*){11,}\b|\b(cpf|meu nome|me chamo)\b/i.test(s);
const knownMediaCode = (code: unknown): code is string => typeof code === 'string' && EXTRA_MEDIA_CODES.some(known => known === code);
const photoSubjectLabels: Record<string, string> = {BARCO: 'barco', MESA: 'mesa posta', LUA: 'kit lua de mel', BIKE: 'bicicletas', PARQUE: 'parque infantil', PISCINA: 'piscinas', HIDRO: 'piscinas de hidromassagem'};

function readGuestInquiry(value: any, now: number): GuestInquiryState | undefined {
  if (!value || !['lodging_faq', 'day_use', 'dining'].includes(value.kind)
    || !Number.isFinite(value.at) || value.at <= 0 || value.at > now || now - value.at > 30 * 60000) return;
  return { kind: value.kind, at: value.at };
}

// A meal/day visit can also require people and a date. Preserve only short,
// recognizable answers in that context; an unrelated new subject must not be
// swallowed by the informational guard. These details never become room facts.
function guestInquiryFollowup(message: string): boolean {
  const s = norm(message);
  if (!s || s.length > 200) return false;
  if (/^(?:sim|nao|ok|certo|entendi|obrigad[oa]|por favor|pode ser)[.!?]*$/.test(s)) return true;
  const stripped = s
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/(?:20)?\d{2})?\b|\b20\d{2}-\d{2}-\d{2}\b/g, '@')
    .replace(new RegExp(`\\b\\d{1,2}(?:\\s*(?:a|ate|ao|-)\\s*\\d{1,2})?\\s+(?:de\\s+)?(?:${months.join('|')})(?:\\s+(?:de\\s+)?20\\d{2})?\\b`, 'g'), '@')
    .replace(/\b(?:hoje|depois de amanha|amanha|(?:este|esse|proximo|neste|nesse) (?:fim|final) de semana|(?:segunda|terca|quarta|quinta|sexta)(?:[ -]feira)?|sabado|domingo)\b/g, '@')
    .replace(new RegExp(`\\b${numberPattern}\\s*(?:pessoas|adult[oa]s?|criancas?|bebes?|casais|hospedes)(?:\\s+de\\s+\\d{1,2}\\s*(?:anos?|meses?))?\\b`, 'g'), '@')
    .replace(/\b(?:um )?casal\b|\b\d{1,2}(?:\s*(?:e|,)\s*\d{1,2})*\s*(?:anos?|meses?)\b/g, '@')
    .replace(/\baniversario (?:d[oa] (?:meu|minha|nosso|nossa) (?:pai|mae|filh[oa]|marido|esposa|irma[oa]|avo)|meu|nosso)\b/g, '@')
    .replace(new RegExp(`^${numberPattern}[.!?]*$`), '@');
  return stripped.includes('@') && /^(?:(?:e|mas|entao|seria|sera|seriam|serao|somos|seremos|vamos|vai|ser|para|apenas|somente|so|agora|o|a|um|uma|no|na|nos|nas|em|dia|dias|de|do|da|com|mais|tambem|por|favor|pfv)|@|[\s,.!?-])+$/.test(stripped);
}

function currentGuestInquiry(state: State, raw: string): GuestInquiry | undefined {
  const s = norm(raw);
  const direct = guestInquiry(raw);
  if (human(s) || mediaRequest(s) || explicitLodgingRequest(raw) || eventInquiry(raw)
    || publicEventInquiry(raw) || packageInquiry(raw) && !direct || extraCodes(raw).length) return;
  if (direct) return direct;
  return state.guest_inquiry && state.guest_inquiry.kind !== 'lodging_faq' && guestInquiryFollowup(raw)
    ? state.guest_inquiry.kind : undefined;
}

// Audio must carry a safe version of the current request through later HTTP
// steps, which receive the media URL again instead of the spoken words.
function safeAudioText(value: string): string {
  let text = value
    .replace(/[^\s@,;!?<>]+@[^\s@,;!?<>]+/g, '[Dado pessoal omitido]')
    .replace(/\+?\b\d(?:[\s().-]*\d){10,}\b/g, '[Dado pessoal omitido]');
  if (marketingOptOut(norm(text))) return 'Não quero receber mensagens promocionais';
  const service = guestServiceRequest(text);
  if (service) return guestServiceContext(service);
  if (human(norm(text))) return 'Quero falar com a recepção';
  const nameClause = /\b(?:meu nome(?: completo)?(?:\s+[ée])?|me chamo)\s*[:,-]?\s*/i;
  // A name may contain several words or commas. Keep only a recognizable
  // request after it; when there is no clear boundary, omit the entire tail.
  const requestStart = /\b(?:quero|gostaria|queria|preciso|pode(?:ria)?|qual|quais|quanto|quantos|como|onde|quando|tem|manda|mande|posso|somos|seremos|me (?:mande|manda|passe|passa|envie|envia))\b/i;
  for (let clause = nameClause.exec(text); clause; clause = nameClause.exec(text)) {
    const tail = text.slice(clause.index + clause[0].length);
    const nextRequest = requestStart.exec(tail);
    text = text.slice(0, clause.index) + (nextRequest ? tail.slice(nextRequest.index) : '');
  }
  // Asking about this document is not itself personal data. Spell out its
  // name so the existing typed-message privacy filter does not erase the query.
  text = text.replace(/\bcpf\b/gi, 'Cadastro de Pessoas Físicas').replace(/\s+/g, ' ').trim();
  return text && !personal(text) ? text.slice(0, 2000) : '[Dado pessoal omitido]';
}

function loadState(value: unknown, now = Date.now()): State {
  const parsed = json(value);
  if (parsed?.version !== 2 || !Array.isArray(parsed.history) || !parsed.facts) {
    return { version: 2, history: [], facts: { extras: [] }, greeted: false };
  }
  const f = parsed.facts;
  const facts: Facts = { extras: Array.isArray(f.extras) ? f.extras.filter((x: unknown) => ['BARCO', 'MESA', 'LUA'].includes(String(x))) : [] };
  if (typeof f.check_in === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(f.check_in)) facts.check_in = f.check_in;
  if (typeof f.check_out === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(f.check_out)) facts.check_out = f.check_out;
  if (Number.isInteger(f.guests) && f.guests > 0 && f.guests <= 60) facts.guests = f.guests;
  // Legacy test state may have treated event participants as room occupants.
  const lastMessage = String(parsed.history.at(-1) || '');
  if (eventInquiry(lastMessage) && new RegExp(`\\b${facts.guests}\\s*(pessoas|convidados|participantes)\\b`).test(norm(lastMessage))) delete facts.guests;
  if (typeof f.children_pending === 'boolean') facts.children_pending = f.children_pending;
  const stayDatePending = readStayDatePending(parsed.stay_date_pending, now);
  // Expiry must not restore a checkout that was deliberately left unconfirmed.
  if (parsed.stay_date_pending) delete facts.check_out;
  if (['relative_dates', 'unparsed_dates'].includes(parsed.stay_date_pending?.reason)) delete facts.check_in;
  return { version: 2, history: parsed.history.filter((s: unknown) => typeof s === 'string' && !personal(s as string)).slice(-12).map((s: string) => s.slice(0, 500)), facts, greeted: parsed.greeted === true, first_turn: parsed.first_turn === true, changed: parsed.changed === true, ...(typeof parsed.pending?.quote_id === 'string' && typeof parsed.pending?.option === 'string' ? { pending: parsed.pending } : {}),
    ...(readDailyGreeting(parsed.daily_greeting) ? {daily_greeting: readDailyGreeting(parsed.daily_greeting)} : {}),
    turns: Array.isArray(parsed.turns) ? parsed.turns.filter((t: any) => ['user', 'assistant'].includes(t?.role) && typeof t.text === 'string' && !personal(t.text)).slice(-16).map((t: any) => ({role:t.role, text:t.text.slice(0,900)})) : [],
    extra_photo_requests: Array.isArray(parsed.extra_photo_requests) ? [...new Set<string>(parsed.extra_photo_requests.filter(knownMediaCode))] : [],
    ...(Array.isArray(parsed.extra_photo_subjects) ? {extra_photo_subjects: [...new Set<string>(parsed.extra_photo_subjects.filter(knownMediaCode))]} : {}),
    ...(readEvent(parsed.event) ? {event:readEvent(parsed.event)} : {}),
    ...(readFamilyParty(parsed.family_party, now) ? {family_party:readFamilyParty(parsed.family_party, now),
      ...(['party_composition','child_ages','age_reference'].includes(parsed.family_clarification) ? {family_clarification:parsed.family_clarification} : {})} : {}),
    ...(['room_photos', 'extra_photos', 'extra_info', 'photo_clarification', 'public_events', 'package_info'].includes(parsed.topic) ? {topic: parsed.topic, topic_at: Number(parsed.topic_at) || 0} : {}),
    ...(readPackageContext(parsed.package_context, now) ? {package_context:readPackageContext(parsed.package_context, now)} : {}),
    ...(readGuestInquiry(parsed.guest_inquiry, now) ? {guest_inquiry:readGuestInquiry(parsed.guest_inquiry, now)} : {}),
    ...(readStayDuration(parsed.duration_request, now) ? {duration_request:readStayDuration(parsed.duration_request, now)} : {}),
    ...(stayDatePending ? {stay_date_pending:stayDatePending} : {}),
    ...(typeof parsed.subject === 'string' && !personal(parsed.subject) ? {subject: parsed.subject.slice(0,100)} : {}),
    ...(['guests','dates'].includes(parsed.awaiting) ? {awaiting: parsed.awaiting} : {}),
    ...(typeof parsed.resolved_message === 'string' && !personal(parsed.resolved_message) ? {resolved_message: parsed.resolved_message.slice(0,500)} : {}),
    ...(readAudioTurn(parsed.audio, now) ? {audio: readAudioTurn(parsed.audio, now)} : {}),
    ...(readAttachmentTurn(parsed.attachment, now) ? {attachment: readAttachmentTurn(parsed.attachment, now)} : {}),
  };
}

function remember(state: State, role: 'user' | 'assistant', text: string, replace = false) {
  if (!text || personal(text)) return;
  const turns = state.turns || [];
  if (replace && turns.at(-1)?.role === 'assistant') turns.pop();
  state.turns = [...turns, {role, text: text.slice(0,900)}].slice(-16);
}

function awaitPhotoSubject(state: State, response: string, now: number) {
  if (!photoClarificationQuestion(response)) return;
  state.topic = 'photo_clarification';
  state.topic_at = now;
  delete state.subject;
  delete state.extra_photo_subjects;
}

// Resolve short follow-ups only within an explicit, recent photo conversation.
// New topics and booking choices must not inherit the previous photo intent.
function resolveFollowup(state: State, raw: string, now: number): string {
  const s = norm(raw);
  const hadTopic = !!state.topic;
  const recentTopic = Number.isFinite(state.topic_at) && state.topic_at! > 0 && now >= state.topic_at! && now - state.topic_at! <= 30 * 60000;
  if (hadTopic && !recentTopic) { delete state.topic; delete state.topic_at; delete state.subject; delete state.extra_photo_subjects; }
  if (human(s)) { delete state.topic; delete state.topic_at; delete state.subject; delete state.extra_photo_subjects; return raw; }
  const roomWords = /\b(aptos?|apartamentos?|quartos?|acomodacoes|acomodacao|suites?|loft|varanda|terreo|quadruplo|triplo|sacada|casal)\b/;
  const shortPhotoChoice = (value: string) => /^(?:(?:e|agora|a|o|da|do|das|dos|de|suite|me mande|me manda|mande|manda|quero ver|quero|por favor|pfv)\s+)*(?:todos|todas|loft|casal|triplo|quadruplo|varanda terreo|sacada vista mar)(?:\s+(?:os|as|aptos|apartamentos|quartos|suites|acomodacoes|pfv|por favor))*[.!?]*$/.test(value.replace(/,/g, ' ').replace(/\s+/g, ' ').trim());
  const previous = norm([...state.history].slice(-4).reverse().find(message => !shortPhotoChoice(norm(message))) || '');
  // Migrate the existing user-only state once, without importing any bot facts.
  // An expired/malformed topic must not be revived by this legacy migration.
  const activeRooms = state.topic === 'room_photos' || (!hadTopic && !state.turns?.length && mediaRequest(previous) && roomWords.test(previous));
  const clarifying = state.topic === 'photo_clarification';
  const active = activeRooms || state.topic === 'extra_photos' || clarifying;
  const shortChoice = shortPhotoChoice(s);
  const directExtras = extraCodes(s);
  // Restrict implicit requests to a list of subjects/connectors. Price, rules,
  // availability, booking and ordinary facility questions are not photo intent.
  // "Tem da..." points to another photo, while "Tem hidromassagem?" is an
  // ordinary facility question, even after a photo. Require the preposition.
  const photoChoiceText = active ? s.replace(/^(?:e )?(?:(?:voce|voces) )?tem (d[ao]s?)\b/, '$1') : s;
  const shortExtraChoice = directExtras.length > 0 && /^(?:(?:e|agora|tambem|a|o|as|os|da|do|das|dos|de|duas|dois|tres|2|3|todas|todos|me|mande|manda|envie|envia|quero|ver|por favor|pfv|hotel solar|@)[\s,/.!?-]*)+$/.test(photoChoiceText.replace(/\b((?:piscinas?\s+(?:(?:de|com)\s+)?)?(?:hidromassagem|hidromassagens|hidros?)|parque infantil|parquinhos?|playgrounds?|piscinas?(?:\s+(?:principal|principais))?|bicicletas?|bikes?|barcos?|catamara|mesa posta|lua de mel|kit celebracao|kit romantico)\b/g, '@'));
  // A clarification has no previous subject: "todas" alone cannot choose a
  // gallery. A named room or facility can answer the question directly.
  let resolved = active && !mediaRequest(s) && ((shortChoice && (!clarifying || roomWords.test(s))) || shortExtraChoice) ? `Fotos de ${raw}` : raw;
  if (active && (photoRetryRequest(raw) || shortPhotoRetry(raw))) {
    if (state.topic === 'extra_photos' && state.extra_photo_subjects?.length) resolved = `Fotos de ${state.extra_photo_subjects.map(code => photoSubjectLabels[code]).join(' e ')}`;
    else if (activeRooms && state.subject) resolved = `Fotos de ${state.subject}`;
  }
  if (state.topic === 'extra_photos' && state.extra_photo_subjects?.length && shortChoice && /\btod[oa]s\b/.test(s) && !roomWords.test(s)) resolved = `Fotos de ${state.extra_photo_subjects.map(code => photoSubjectLabels[code]).join(' e ')}`;
  const genericPhotos = extraPhotoRequest(s) && /^(?:(?:e|agora|tambem|tem|voces|voce|ha|pode|podem|poderia|poderiam|me|mande|manda|mandar|enviar|envie|envia|mostrar|quero|gostaria|queria|ver|de|a|as|o|os|um|uma|umas|uns|alguma|algumas|algum|alguns|mais|todos|todas|dess[ae]s?|dest[ae]s?|del[ae]s?|por favor|pfv|fotos?|fotografias?|imagem|imagens|galeria|album)[\s,/.!?-]*)+$/.test(s);
  if (extraPhotoRequest(s) && !directExtras.length && (genericPhotos || /\b(dess[ae]s?|dest[ae]s?|del[ae]s?)\b/.test(s))) {
    if ((state.topic === 'extra_photos' || state.topic === 'extra_info') && state.extra_photo_subjects?.length && genericPhotos) resolved = `Fotos de ${state.extra_photo_subjects.map(code => photoSubjectLabels[code]).join(' e ')}`;
    else if (state.subject && !restaurantInquiry(s)) resolved = `Fotos de ${state.subject}`;
  }
  const resolvedExtras = extraCodes(resolved);
  if (extraPhotoRequest(resolved) && resolvedExtras.length) {
    state.topic = 'extra_photos'; state.topic_at = now; state.extra_photo_subjects = resolvedExtras;
    delete state.subject; // Pools and bicycles never become the room in focus.
  } else if (mediaRequest(norm(resolved)) && (roomWords.test(norm(resolved)) || (activeRooms && /\btod[oa]s\b/.test(s)))) {
    state.topic = 'room_photos'; state.topic_at = now;
    delete state.extra_photo_subjects;
    if (/\btod[oa]s\b/.test(s)) resolved = 'Fotos de todos os apartamentos';
  } else if (directExtras.length && !mediaRequest(s) && !lodging(s) && !restaurantInquiry(s) && (question(s) || shortExtraChoice)) {
    // Remember the facility mentioned by the customer, not something offered
    // by the assistant. This is informational until they explicitly ask photos.
    state.topic = 'extra_info'; state.topic_at = now; state.extra_photo_subjects = directExtras;
    delete state.subject;
  } else { delete state.topic; delete state.topic_at; delete state.subject; delete state.extra_photo_subjects; }
  return resolved;
}

function iso(day: number, month: number, year: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : undefined;
}

function parseDates(s: string, now: number): string[] {
  const today = new Date(now - 3 * 3600000).toISOString().slice(0, 10);
  const currentYear = Number(today.slice(0, 4));
  const full = [...s.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)].map(m => iso(+m[3], +m[2], +m[1]));
  if (full.length) return full.filter(Boolean) as string[];
  const numeric = [...s.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/g)].map(m => {
    let result = iso(+m[1], +m[2], Number(m[3] || currentYear));
    if (!m[3] && result && result < today) result = iso(+m[1], +m[2], currentYear + 1);
    return result;
  });
  if (numeric.length) return numeric.filter(Boolean) as string[];
  const range = s.match(new RegExp(`\\b(\\d{1,2})(?:\\s+de)?\\s*(?:a|ate|ao|-)\\s*(\\d{1,2})\\s*(?:de\\s+)?(${months.join('|')})(?:\\s+(?:de\\s+)?(20\\d{2}))?\\b`));
  if (range) {
    const month = months.indexOf(range[3]) + 1;
    let year = Number(range[4] || currentYear);
    if (!range[4] && (iso(+range[1], month, year) || '') < today) year++;
    return [iso(+range[1], month, year), iso(+range[2], month, year)].filter(Boolean) as string[];
  }
  const written = [...s.matchAll(new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?(${months.join('|')})(?:\\s+(?:de\\s+)?(20\\d{2}))?\\b`, 'g'))].map(m => {
    const month = months.indexOf(m[2]) + 1;
    let year = Number(m[3] || currentYear);
    if (!m[3] && (iso(+m[1], month, year) || '') < today) year++;
    return iso(+m[1], month, year);
  });
  if (written.length) return written.filter(Boolean) as string[];
  if (/\b(esse|este|proximo|neste|nesse)?\s*(final de semana|fim de semana)\b/.test(s)) {
    const friday = new Date(`${today}T12:00:00Z`);
    let days = (5 - friday.getUTCDay() + 7) % 7;
    if (/proximo/.test(s) && days === 0) days = 7;
    friday.setUTCDate(friday.getUTCDate() + days);
    const sunday = new Date(friday); sunday.setUTCDate(sunday.getUTCDate() + 2);
    return [friday.toISOString().slice(0, 10), sunday.toISOString().slice(0, 10)];
  }
  return [];
}

function clearStayDuration(state: State) {
  delete state.duration_request;
  delete state.stay_date_pending;
}

function updateStayDates(state: State, s: string, now: number) {
  const dates = parseDates(s, now);
  const packageScope = state.topic === 'package_info';
  const requested = packageScope ? undefined : stayDurationRequest(s, now);
  const previousPending = state.stay_date_pending;
  if (packageScope) clearStayDuration(state);
  const entryMention = explicitStayEntry(s) || /\b(?:entrar|a partir de|desde)\b/.test(s);
  const exitMention = explicitStayExit(s) || /\bsair\b/.test(s);
  const newEntry = entryMention || !exitMention && (explicitLodgingRequest(s)
    || /\b(?:nova|outra) (?:hospedagem|estadia|viagem|cotacao)\b/.test(s));
  const unparsed = !dates.length && (unparsedStayDateDeclaration(s)
    || newEntry && /\b\d{1,2}[-/]\d{1,2}(?:[-/](?:20)?\d{2})?\b/.test(s))
    || dates.length === 1 && entryMention && exitMention;
  if (!packageScope && (unparsed || dates.length < 2 && relativeStayDateMention(s)
    && (lodging(s) || requested || previousPending || state.awaiting === 'dates' || /^(?:de )?(?:hoje|amanha|depois de amanha)(?:\s|[.!?]|$)/.test(s)))) {
    // Relative-date parsing is intentionally not expanded here. Never reuse
    // a prior trip when the customer has just supplied a new relative period.
    delete state.facts.check_in; delete state.facts.check_out;
    state.stay_date_pending = { at: now, reason: unparsed ? 'unparsed_dates' : 'relative_dates' };
    if (requested) state.duration_request = requested;
    delete state.pending;
    return;
  }
  if (requested) {
    state.duration_request = requested;
    // A new requested duration without dates cannot silently use an older
    // checkout. Keep only the entry already explicitly supplied by the user.
    if (!dates.length) delete state.facts.check_out;
  }
  if (previousPending && dates.length) {
    const suppliedExit = dates.length === 1 && !newEntry && !!state.facts.check_in;
    // A calendar date, not "option 2"/"yes", settles the question. A fresh
    // pair replaces the earlier duration interpretation without adding a day.
    if (dates.length >= 2 || suppliedExit) {
      delete state.stay_date_pending;
      if (!requested) delete state.duration_request;
    } else if (previousPending.reason !== 'duration_conflict' || newEntry) {
      delete state.stay_date_pending;
      delete state.facts.check_out;
    } else return;
  }
  if (dates.length >= 2) { state.facts.check_in = dates[0]; state.facts.check_out = dates[1]; }
  else if (dates.length === 1) {
    if (explicitStayExit(s) || /\bate\b/.test(s)) state.facts.check_out = dates[0];
    else if (newEntry) {
      state.facts.check_in = dates[0];
      // A newly specified entry cannot inherit the checkout of an older
      // simulation. Ask for the missing exit even without a duration conflict.
      delete state.facts.check_out;
    } else if (state.facts.check_in && !state.facts.check_out) state.facts.check_out = dates[0];
    else if (!state.facts.check_in) state.facts.check_in = dates[0];
  }
  const duration = state.duration_request;
  if (!packageScope && duration && dates.length && state.facts.check_in && state.facts.check_out) {
    const conflict = conflictingStayDuration(duration, state.facts.check_in, state.facts.check_out, s, now);
    if (conflict) {
      state.stay_date_pending = conflict;
      delete state.facts.check_out;
      // A default weekend is a candidate, not an explicitly declared entry.
      if (!calendarDateMention(s)) delete state.facts.check_in;
      delete state.pending;
    } else clearStayDuration(state);
  }
}

function updateFacts(state: State, message: string, now: number) {
  const before = JSON.stringify(state.facts);
  const s = norm(message);
  if (human(s) || mediaRequest(s) || eventInquiry(s) || publicEventInquiry(s) || restaurantInquiry(s) || childPolicyQuestion(s)) { state.changed = false; return; }
  if (extraCodes(s).length && question(s) && !/\b(diarias?|hospedagem|reservar|reserva|cotacao|aptos?|loft|suite)\b/.test(s)) { state.changed=false; return; }
  const family = updateFamilyParty(message, state.family_party, now);
  const group = s.match(new RegExp(`\\b(?:somos|seremos|vamos em|agora somos)\\s+${numberPattern}\\b`));
  const shortCount = s.match(new RegExp(`^(?:para\\s+)?${numberPattern}[.!]?$`));
  if (family.handled) {
    state.family_party = family.party;
    state.family_clarification = family.clarification;
    if (family.guests) state.facts.guests = family.guests;
    else if (family.clarification === 'party_composition' || family.party?.children !== undefined) delete state.facts.guests;
    if (family.party?.children !== undefined || state.facts.children_pending !== undefined || family.clarification)
      state.facts.children_pending = !!family.children_pending || !!family.clarification;
  } else {
    if (group || shortCount && !state.facts.children_pending && (!state.facts.guests || state.awaiting === 'guests')) {
      state.facts.guests = count((group || shortCount)![1]);
      delete state.family_party; delete state.family_clarification;
    }
    // Legacy states may only say that children are present. A lone age does
    // not prove all ages were supplied, so it cannot clear that uncertainty.
    if (/crianca|bebe/.test(s) && !question(s) && !/\b(paga|gratuidade|gratis|cortesia|politica|regra)\b/.test(s)) state.facts.children_pending = true;
    if (/sem crianca|so adultos|apenas adultos/.test(s)) state.facts.children_pending = false;
  }
  updateStayDates(state, s, now);
  for (const [term, code] of [['barco', 'BARCO'], ['mesa', 'MESA'], ['lua de mel', 'LUA']]) {
    if (!s.includes(term)) continue;
    if (/retir|remov|sem |nao quero|exclu/.test(s)) state.facts.extras = state.facts.extras.filter(x => x !== code);
    else if (!question(s) && /quero|inclu|adicion|coloca|acrescenta/.test(s) && !state.facts.extras.includes(code)) state.facts.extras.push(code);
  }
  state.changed = before !== JSON.stringify(state.facts);
  if (state.changed) delete state.pending;
}

function validQuote(value: unknown, state: State, now: number): Quote | null {
  if (state.stay_date_pending) return null;
  const q = json(value);
  const f = state.facts;
  if (state.topic === 'package_info' && state.package_context && (q?.check_in !== state.package_context.start_date || q?.check_out !== state.package_context.end_date)) return null;
  if (q?.version !== 1 || typeof q.id !== 'string' || !Number.isFinite(q.created_at) || now - q.created_at < 0 || now - q.created_at > 30 * 60000 || !Array.isArray(q.options) || !q.options.length || !Array.isArray(q.extras)) return null;
  if (q.check_in !== f.check_in || q.check_out !== f.check_out || q.guests !== f.guests || f.children_pending || JSON.stringify([...q.extras || []].sort()) !== JSON.stringify([...f.extras].sort())) return null;
  if (!q.options.every((o: any) => o && typeof o.name === 'string' && Number.isFinite(o.capacity) && o.capacity >= q.guests && Number.isFinite(o.total) && o.total > 0)) return null;
  return q;
}

function selection(s: string, quote: Quote): Quote['options'][number] | undefined {
  const matches = quote.options.filter(option => {
    const name = norm(option.name);
    if (s.includes(name)) return true;
    const unique = name.replace(/\bsuite\b/g, '').trim();
    return unique.length > 3 && s.includes(unique);
  });
  if (matches.length === 1) return matches[0];
  if (/\b(primeira opcao|opcao 1|recomendacao premium)\b/.test(s)) return quote.options[0];
  return undefined;
}

const dateLabel = (s: string) => s.split('-').reverse().join('/');
const amount = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function confirmation(q: Quote, name: string) {
  const option = q.options.find(o => o.name === name)!;
  return `Confira sua escolha:\n\n${option.name}\n${dateLabel(q.check_in)} a ${dateLabel(q.check_out)} · ${q.guests} hóspedes\nTotal da simulação: ${amount(option.total)}${q.extras.length ? ' (com os extras escolhidos)' : ''}.\n\nAinda não confirma disponibilidade nem reserva. Para solicitar que a recepção verifique as vagas e continue por aqui, toque em “Confirmar opção”. Só então pediremos nome completo, e-mail e CPF.`;
}

function controlTurn(body: any, now = Date.now()) {
  const state = loadState(body.state, now);
  const input = String(body.user_message || '').trim();
  const attachment = isAttachmentInput(input);
  // Intercept documents before fact extraction, event advancement and all
  // booking/confirmation branches. A missing prepare must still fail safely.
  if (attachment && ['prepare', 'route', 'confirm'].includes(body.operation)) {
    const current = attachmentForMessage(input, state, now) || { source_hash: attachmentSourceHash(input), kind: 'unreadable' as const, created_at: now };
    state.attachment = current;
    state.changed = false;
    clearStayDuration(state);
    delete state.pending; delete state.awaiting; delete state.topic; delete state.topic_at; delete state.package_context; delete state.guest_inquiry;
    delete state.subject; delete state.extra_photo_subjects; delete state.event; delete state.audio;
    state.resolved_message = attachmentContextMessage(current.kind);
    if (body.operation === 'prepare') {
      state.first_turn = !state.greeted;
      state.greeted = true;
      state.history = [...state.history, state.resolved_message].slice(-12);
      remember(state, 'user', state.resolved_message);
      const context = JSON.stringify({
        primeira_resposta: state.first_turn, tipo_entrada: 'attachment', tipo_anexo: current.kind,
        fatos_informados_pelo_cliente: state.facts, mensagens_do_cliente: state.history,
        conversa_recente: state.turns, assunto_ativo: '', acomodacao_em_foco: '',
        ultima_mensagem: state.resolved_message, interpretacao_da_ultima_mensagem: state.resolved_message,
        cotacao_valida_para_estes_dados: null, anexo_pendente_encaminhamento: true,
        data_atual: new Date(now - 3 * 3600000).toISOString().slice(0, 10),
        regra: 'A mensagem atual é um anexo, não um pedido de cotação nem consentimento de reserva. Não extrair datas, valores, hóspedes ou dados pessoais do anexo para a hospedagem. Possível comprovante não comprova autenticidade nem dinheiro recebido. Não confirmar pagamento ou reserva. O fluxo nativo ainda precisa encaminhar o atendimento ao setor responsável; não afirmar que já encaminhou. Não pedir dados pessoais nem prosseguir em eventos, pacotes ou fotos anteriores. A resposta final será definida pelo roteamento seguro do anexo.',
      });
      return { state: JSON.stringify(state), context, can_collect: 'NAO', quote_request: 'NOQUOTE', input_type: 'attachment', attachment_kind: current.kind };
    }
    // No assistant turn is remembered: a response template is not proof that
    // the external ManyChat assignment or notification actually ran.
    return { state: JSON.stringify(state), resolved_message: state.resolved_message,
      quote_request: attachmentDecision(current.kind), can_collect: 'NAO', confirmation_text: '',
      answer: attachmentAnswer(current.kind), input_type: 'attachment', attachment_kind: current.kind };
  }
  if (input && !attachment) delete state.attachment;
  const audio = isAudioInput(input);
  const raw = (audio ? audioMessage(input, state, now) || AUDIO_UNAVAILABLE : input).slice(0, 2000);
  const s = norm(raw);
  if (hotelPhoneInquiry(raw) && ['prepare', 'route', 'confirm'].includes(body.operation)) {
    // A direct request for the public phone is not a booking, consent or
    // handoff. Ignore stale quote/package/media choices and model proposals.
    state.changed = false;
    clearStayDuration(state);
    delete state.pending; delete state.awaiting; delete state.topic; delete state.topic_at;
    delete state.package_context; delete state.guest_inquiry; delete state.subject;
    delete state.extra_photo_subjects; delete state.event;
    const safeMessage = personal(raw) ? 'Qual o telefone do Hotel Solar?' : raw;
    state.resolved_message = safeMessage;
    if (body.operation === 'prepare') {
      delete state.audio;
      state.first_turn = !state.greeted;
      state.greeted = true;
      state.history = [...state.history, safeMessage.slice(0,500)].slice(-12);
      remember(state, 'user', safeMessage);
      return {state: JSON.stringify(state), can_collect:'NAO', quote_request:'NOQUOTE',
        context: JSON.stringify({primeira_resposta:state.first_turn, ultima_mensagem:safeMessage,
          contato_publico_solicitado:true, cotacao_valida_para_estes_dados:null,
          regra:'O cliente pediu explicitamente o telefone público do hotel. A regra de não desviar reservas para outro canal não proíbe responder esse pedido. Não consultar pacotes, encaminhar, ligar ou coletar dados. Responda: '+hotelContactAnswer})};
    }
    remember(state, 'assistant', hotelContactAnswer);
    return {state:JSON.stringify(state),resolved_message:safeMessage,quote_request:'NOQUOTE',
      can_collect:'NAO',confirmation_text:'',answer:hotelContactAnswer};
  }
  const continuingEvent = eventFieldReply(state.event,raw,now);
  const service = continuingEvent ? undefined : guestServiceRequest(raw);
  if (service && ['prepare', 'route', 'confirm'].includes(body.operation)) {
    // An active guest request must not enter new-stay qualification or turn
    // a group's pending document into a new private-event lead.
    const safeMessage = guestServiceContext(service);
    state.changed = false;
    clearStayDuration(state);
    delete state.pending; delete state.awaiting; delete state.topic; delete state.topic_at;
    delete state.package_context; delete state.guest_inquiry; delete state.subject;
    delete state.extra_photo_subjects; delete state.event;
    state.resolved_message = safeMessage;
    if (body.operation === 'prepare') {
      delete state.audio;
      state.first_turn = !state.greeted;
      state.greeted = true;
      state.history = [...state.history, safeMessage].slice(-12);
      remember(state, 'user', safeMessage);
      return {state: JSON.stringify(state), can_collect: 'NAO', quote_request: 'NOQUOTE',
        context: JSON.stringify({
          primeira_resposta: state.first_turn, fatos_informados_pelo_cliente: state.facts,
          mensagens_do_cliente: state.history, conversa_recente: state.turns,
          ultima_mensagem: safeMessage, interpretacao_da_ultima_mensagem: safeMessage,
          solicitacao_operacional: service, cotacao_valida_para_estes_dados: null,
          assunto_ativo: '', acomodacao_em_foco: '',
          regra: 'O cliente faz uma solicitação operacional efetiva. Chame a recepção pelo fluxo humano existente, sem iniciar cotação, fotos, eventos, coleta de dados pessoais ou emissão de documentos. Não alterar os fatos da hospedagem. Não afirmar entrega de itens, pedido de comida realizado, manutenção acionada, documento emitido, objeto encontrado/guardado/enviado ou encaminhamento concluído: essas ações não foram executadas. Não inventar política de responsabilidade por objetos. Responda somente: ' + guestServiceAnswer,
        })};
    }
    return {state: JSON.stringify(state), resolved_message: safeMessage,
      quote_request: 'HUMANO', can_collect: 'NAO', confirmation_text: '', answer: guestServiceAnswer};
  }
  let decision = 'NOQUOTE';
  let answer = String(body.ai_response || '').slice(0, 1800);
  let ready = 'NAO';
  let confirmationText = '';
  if (body.operation === 'prepare') {
    // The adapter supplies a fresh transcription for this turn. Older audio
    // must not be used if the user changes subject or sends another recording.
    delete state.audio;
    state.first_turn = !state.greeted;
    state.greeted = true;
    delete state.pending; // Any new typed message invalidates an older confirmation card.
    const wasPublic = state.topic === 'public_events';
    const publicFollowup = wasPublic && Number.isFinite(state.topic_at) && now >= state.topic_at! && now - state.topic_at! <= 30 * 60000 && publicEventFollowup(raw);
    const directInquiry = guestInquiry(raw);
    const packageQuery = !human(s) && !restaurantInquiry(s) && !eventInquiry(raw) && !publicEventInquiry(raw) && directInquiry !== 'lodging_faq' && packageInquiry(raw);
    const packageContinuation = !human(s) && !eventInquiry(raw) && !publicEventInquiry(raw) && !guestFacilityInquiry(raw) && directInquiry !== 'dining' && directInquiry !== 'day_use' && state.topic === 'package_info' && !!state.package_context && packageFollowup(raw);
    if (newTripRequest(raw)) {
      delete state.facts.check_in; delete state.facts.check_out; state.facts.extras = [];
      clearStayDuration(state);
    }
    if (!packageQuery && !packageContinuation) delete state.package_context;
    if (raw === AUDIO_UNAVAILABLE) {
      clearStayDuration(state);
      state.resolved_message = AUDIO_UNAVAILABLE;
      state.changed = false;
      delete state.topic; delete state.topic_at; delete state.subject; delete state.extra_photo_subjects; delete state.guest_inquiry;
    } else if (!human(s) && continuingEvent) {
      const event=advanceEvent(state.event,raw,String(body.subscriber_id||state.event?.source||''),now);
      if(event) state.event=event;
      clearStayDuration(state);
      state.resolved_message=personal(raw)?'[Dado pessoal omitido]':raw;
      state.changed=false;
      delete state.awaiting;delete state.topic;delete state.topic_at;delete state.package_context;
      delete state.subject;delete state.extra_photo_subjects;delete state.guest_inquiry;
    } else if (!human(s) && (publicEventInquiry(raw) || publicFollowup)) {
      clearStayDuration(state);
      state.resolved_message = personal(raw) ? 'Programação musical de Heraldo Ramos no Reserva Solar' : publicFollowup && !publicEventInquiry(raw) ? `Programação musical de Heraldo Ramos no Reserva Solar: ${raw}` : raw;
      state.topic = 'public_events'; state.topic_at = now; state.changed = false;
      delete state.awaiting; delete state.subject; delete state.extra_photo_subjects; delete state.guest_inquiry;
      // A public show is not an answer/consent to a private-event lead in progress.
    } else if (packageQuery || packageContinuation) {
      clearStayDuration(state);
      state.resolved_message = personal(raw) ? '[Dado pessoal omitido]' : raw;
      state.topic = 'package_info'; state.topic_at = now;
      delete state.subject; delete state.extra_photo_subjects; delete state.event; delete state.guest_inquiry;
      updateFacts(state, state.resolved_message, now);
    } else {
      state.resolved_message = personal(raw) ? '[Dado pessoal omitido]' : resolveFollowup(state, raw, now);
      const inquiry = currentGuestInquiry(state, state.resolved_message);
      const extraSelection = extraCodes(s).some(code => ['BARCO', 'MESA', 'LUA'].includes(code))
        && !question(s) && /\b(?:quero|incluir|adicionar|colocar|acrescentar|retirar|remover|excluir)\b/.test(s);
      if (inquiry || human(s) || mediaRequest(norm(state.resolved_message)) || eventInquiry(raw)
        || childPolicyQuestion(raw) || !extraSelection && !lodging(s) && !calendarDateMention(raw)
          && !guestInquiryFollowup(raw) && !stayDurationRequest(raw, now)
          && !relativeStayDateMention(raw)) clearStayDuration(state);
      if (inquiry) {
        // Only this client turn establishes/renews the focus. Neither an AI
        // question about people nor a catalog response can create lodging facts.
        state.guest_inquiry = { kind: inquiry, at: now };
        state.changed = false;
        delete state.event; delete state.awaiting;
      } else {
        delete state.guest_inquiry;
        const event = human(s) || mediaRequest(norm(state.resolved_message)) || (wasPublic && !eventInquiry(raw)) ? undefined : advanceEvent(state.event,raw,String(body.subscriber_id||state.event?.source||''),now);
        if(event) {state.event=event;state.changed=false;delete state.awaiting;delete state.topic;}
        else {delete state.event;updateFacts(state, state.resolved_message, now);}
      }
    }
    if (raw !== AUDIO_UNAVAILABLE) {
      if (raw && !personal(raw)) state.history = [...state.history, raw.slice(0, 500)].slice(-12);
      remember(state, 'user', raw);
    }
    const currentQuote = state.guest_inquiry || marketingOptOut(s) ? null : validQuote(body.quote_state, state, now);
    const context = JSON.stringify({
      primeira_resposta: state.first_turn, fatos_informados_pelo_cliente: state.facts,
      composicao_familiar_informada: state.family_party ? { adultos:state.family_party.adults, criancas:state.family_party.children, total:state.family_party.total, idades_em_meses:state.family_party.ages_months } : null,
      pendencia_composicao_familiar: state.family_clarification || null,
      regra_composicao_familiar: 'Conte todos os ocupantes, inclusive bebês, sem deduzir pagantes ou descontos. Idades são somente declarações do cliente; uma idade não completa várias crianças. Se a composição estiver inconsistente, confirme quantos adultos e crianças são ao todo antes de cotar. Não deduza necessidade de acessibilidade ou saúde pelas idades.',
      mensagens_do_cliente: state.history, conversa_recente: state.turns,
      marketing_recusa: marketingOptOut(s),
      solicitacao_varios_apartamentos: multiRoomRequest(s),
      ...(multiRoomRequest(s) ? { regra_varios_apartamentos: 'A simulação automática atual contempla uma acomodação por vez. Um pedido explícito de vários apartamentos deve chamar a recepção para conferir o conjunto, sem substituir pelo preço de um único quarto, somar valores inventados, confirmar disponibilidade ou alterar a reserva. Não afirmar encaminhamento concluído antes da ação nativa.' } : {}),
      ...(marketingOptOut(s) ? { regra_marketing_recusa: 'A mensagem atual solicita parar o recebimento de mensagens promocionais. Acolha o pedido e chame a equipe pelo fluxo humano existente, sem ofertar, cotar ou pedir dados de hospedagem. Não afirmar descadastro, bloqueio de campanhas, cancelamento de pesquisas ou encaminhamento concluído: nenhuma dessas ações foi comprovada por este controlador. Esta sinalização descreve somente o pedido atual; não é uma alteração das permissões de contato.' } : {}),
      assunto_ativo: state.topic || '', acomodacao_em_foco: state.subject || '',
      atendimento_informativo_em_foco: state.guest_inquiry || null,
      duracao_informada_pelo_cliente: state.duration_request || null,
      datas_da_estadia_pendentes: state.stay_date_pending || null,
      regra_duracao_estadia: 'Duração e datas são somente declarações do cliente. Quando há pendência, não cotar nem coletar dados pessoais: esclarecer as datas de entrada e saída. Datas candidatas da pendência não são fatos confirmados. Nunca adicionar um dia ao checkout por interpretação inclusiva. Um número isolado ou sim não escolhe a saída. Datas relativas ainda não convertidas não autorizam reaproveitar datas antigas. Respostas do assistente não resolvem a pendência.',
      regra_atendimento_informativo: 'O foco informativo vem somente do cliente. Dúvidas sobre café da manhã para visitantes, refeições e Day Use não são hospedagem. Mantenha respostas curtas de quantidade de pessoas, data, idade ou ocasião familiar no mesmo assunto, sem convertê-las em hóspedes, check-in, check-out ou evento privado. Uma menção ao aniversário do pai não solicita festa ou orçamento de evento. Perguntas sobre regras, inclusão de café, pets, pagamento ou horário do quarto devem receber a informação disponível, sem iniciar cotação nem pedir dados da estadia. Não invente preços, políticas, disponibilidade, agendamento, confirmação de mesa ou encaminhamento. Para cotar hospedagem, o cliente precisa pedir hospedagem; o foco informativo não é escolha nem consentimento de reserva.',
      politica_gastronomia_confirmada: confirmedDiningPolicy,
      politica_instalacoes_confirmada: confirmedGuestFacilitiesPolicy,
      regra_instalacoes: 'A copa baby e seu micro-ondas são de uso dos hóspedes para aquecer alimentos, sem horário específico. Isso não confirma equipamento dentro de quartos, acesso de visitantes, outros eletrodomésticos ou serviço prestado por funcionários. Não transformar uma dúvida sobre comida de bebê em nova criança na ocupação. Pedido efetivo para a equipe aquecer ou entregar deve seguir ao humano, sem afirmar execução.',
      regra_politica_gastronomia: 'A política de gastronomia confirmada mais recentemente pelo responsável prevalece sobre respostas antigas do histórico ou instruções sazonais anteriores. Não aplicar cobrança de entrada automaticamente em feriados, férias ou datas de grande movimento: somente datas previamente autorizadas e informadas pelo responsável podem ter cobrança. Não inventar tarifa nem converter preço de entrada em preço de café, refeições ou couvert. Os horários gerais não comprovam funcionamento em tempo real.',
      lazer_em_foco: state.extra_photo_subjects || [],
      fotos_lazer_solicitadas: state.topic === 'extra_photos' ? state.extra_photo_subjects || [] : [],
      pacote_em_foco: state.topic === 'package_info' && !packageQuery ? state.package_context || null : null,
      regra_pacote: 'Pacote em foco é somente o assunto consultado, não aceite de reserva. Responda continuações sobre hóspedes, acomodações, valores e inclusões no mesmo pacote. O próximo passo consulta os dados atuais do catálogo. Não reaproveite datas, preços ou extras de outra viagem nem confirme disponibilidade. As datas do catálogo não são datas declaradas pelo cliente.',
      interpretacao_da_ultima_mensagem: personal(raw) ? '[Dado pessoal omitido]' : state.resolved_message,
      ultima_mensagem: personal(raw) ? '[Dado pessoal omitido; não repetir nem guardar]' : raw,
      cotacao_valida_para_estes_dados: currentQuote,
      data_atual: new Date(now - 3 * 3600000).toISOString().slice(0, 10),
      programacao_musical_confirmada: publicEventContext(now),
      regra: 'Reserva Solar é o nome próprio do restaurante pé na areia, nunca um pedido de reserva de hospedagem. Cardápio, menu, pratos, horários, mesa e informações do Reserva Solar ficam no atendimento de gastronomia e não iniciam cotação. Datas e ocupação só valem se estão nos fatos do cliente. Oferta de pacote não é escolha do cliente. Histórico do atendimento serve para entender referências, nunca comprova aceite ou entrega de mídia. Nunca pedir dados pessoais: isso pertence à confirmação por botão. Nunca afirmar encaminhamento sem ação real. Programação musical pública não é pedido de orçamento privado para Luiza nem escolha de datas de hospedagem. Respeite as datas, situação temporal e limites da programação confirmada; não deduza couvert, entrada ou duração pelas regras gerais do restaurante. Pedidos de fotos de lazer e serviços são resolvidos pelo acervo de mídia do hotel no próximo passo; não afirmar que não há fotos nem que já foram enviadas. Lazer em foco não é escolha de hospedagem, inclusão de extra pago nem informação sobre crianças da reserva.',
    });
    return { state: JSON.stringify(state), context, can_collect: 'NAO', quote_request: 'NOQUOTE' };
  }
  if (body.operation === 'remember_response') {
    remember(state, 'assistant', String(body.response_text || ''), true);
    if(Array.isArray(body.extra_photo_requests)) state.extra_photo_requests=[...new Set([...(state.extra_photo_requests||[]),...body.extra_photo_requests.filter(knownMediaCode)])];
    if (body.clear_subject === true) delete state.subject;
    if (typeof body.room_name === 'string' && body.room_name) state.subject = body.room_name.slice(0,100);
    awaitPhotoSubject(state, String(body.response_text || ''), now);
    if (body.clear_package === true) {
      delete state.package_context;
      if (state.topic === 'package_info') { delete state.topic; delete state.topic_at; }
    }
    const catalog = readPackageContext({...body.package_context, updated_at: now}, now);
    if (catalog && !state.guest_inquiry && !state.stay_date_pending) {
      if (state.package_context?.id !== catalog.id) {
        // New inquiry invalidates a previous trip, but preserves facts the
        // customer explicitly supplied in THIS turn. Catalog dates are not facts.
        const current = state.history.at(-1) || '';
        const fresh: State = {version:2, history:[], facts:{extras:[]}, greeted:true, topic:'package_info'};
        updateFacts(fresh, current, now);
        delete state.facts.check_in; delete state.facts.check_out;
        if (fresh.facts.check_in) state.facts.check_in = fresh.facts.check_in;
        if (fresh.facts.check_out) state.facts.check_out = fresh.facts.check_out;
        state.facts.extras = fresh.facts.extras;
        delete state.pending; delete state.awaiting;
        state.changed = false;
      }
      state.package_context = catalog; state.topic = 'package_info'; state.topic_at = now;
      delete state.subject; delete state.extra_photo_subjects;
    }
    if (state.guest_inquiry) delete state.awaiting;
    else if (/quantas pessoas/i.test(String(body.response_text || ''))) state.awaiting = 'guests';
    return {state: JSON.stringify(state)};
  }
  const quote = validQuote(body.quote_state, state, now);
  if (body.operation === 'confirm') {
    if (!state.attachment && !state.guest_inquiry && quote && state.pending?.quote_id === quote.id && quote.options.some(o => o.name === state.pending?.option)) {
      ready = 'SIM';
      confirmationText = confirmation(quote, state.pending.option);
      delete state.pending; // A confirmation is consumed once, not reusable.
    } else answer = 'Essa escolha precisa ser conferida novamente. Me diga as datas e a acomodação desejada para atualizarmos a simulação antes de pedir seus dados.';
    return { state: JSON.stringify(state), can_collect: ready, confirmation_text: confirmationText, answer };
  }
  if (body.operation !== 'route') return { error: 'Invalid operation' };
  const proposed = String(body.proposed || '').trim();
  const publicMessage = state.history.at(-1) === raw ? state.resolved_message || raw : raw;
  const inquiry = currentGuestInquiry(state, publicMessage);
  const diningAnswer = diningPolicyAnswer(publicMessage);
  const facilityAnswer = inquiry === 'lodging_faq' ? guestFacilityAnswer(publicMessage) : undefined;
  if (raw === AUDIO_UNAVAILABLE) {
    answer = AUDIO_RETRY;
    state.resolved_message = AUDIO_UNAVAILABLE;
    state.changed = false;
    delete state.pending;
    delete state.topic; delete state.topic_at; delete state.subject; delete state.extra_photo_subjects; delete state.guest_inquiry;
  }
  else if (human(s)) {
    decision = 'HUMANO';
    delete state.pending;
    if (reservationChange(s)) answer = 'Vou chamar a recepção para conferir a possibilidade de alteração da sua reserva. Nenhuma data ou condição foi alterada por aqui.';
    if (multiRoomRequest(s)) answer = 'A recepção precisa conferir os vários apartamentos juntos para preparar o orçamento correto. Vou chamar a equipe para ajudar por aqui, sem confirmar valores ou disponibilidade.';
    if (marketingOptOut(s)) {
      answer = 'Entendi seu pedido de não receber mensagens promocionais. Vou chamar a equipe para providenciar isso.';
      delete state.pending;
    } else if (paymentDispute(s)) answer = 'Essa cobrança precisa ser conferida pela equipe. Vou chamar um atendente para verificar com você, sem confirmar ou alterar o pagamento por aqui.';
  }
  else if (continuingEvent && state.event) {answer=state.event.answer;delete state.pending;}
  else if (facilityAnswer) {
    answer = facilityAnswer;
    delete state.pending;
  }
  else if ((!restaurantInquiry(s) && !eventInquiry(publicMessage) && !publicEventInquiry(publicMessage) && inquiry !== 'lodging_faq' && packageInquiry(publicMessage))
    || (state.topic === 'package_info' && state.package_context && inquiry !== 'dining' && inquiry !== 'day_use' && packageFollowup(publicMessage)
      && !(quote && packageBookingRequest(publicMessage)))) {
    answer = 'Vou consultar as informações e as opções do pacote para continuar com você.';
    delete state.pending;
  }
  else if (extraPhotoRequest(publicMessage) && extraCodes(publicMessage).length) {
    // The native media branch resolves available photos and replaces this
    // transition. Do not repeat an unsupported AI denial or claim media sent.
    answer = PHOTO_LOOKUP;
    delete state.pending;
  }
  else if (publicEventInquiry(publicMessage)) {answer=publicEventAnswer(publicMessage,now);delete state.pending;}
  else if (state.event) {answer=state.event.answer;delete state.pending;}
  else if (eventInquiry(s) && !mediaRequest(s)) {
    delete state.pending;
    answer = eventContactText;
  }
  else if (diningAnswer) {
    answer = diningAnswer;
    delete state.pending;
  }
  else if (greeting(s)) answer = state.first_turn ? 'Olá! Que bom receber seu contato no Hotel Solar. ☀️ Como posso ajudar?' : 'Estou por aqui! Como posso ajudar?';
  else if (restaurantInquiry(s)) {
    // Keep the ChatGPT factual answer. This explicit branch also neutralizes a
    // mistaken QUOTE proposal caused by the word "reserva" in the venue name.
    delete state.pending;
  }
  else if (mediaRequest(s) || mediaRequest(norm(publicMessage)) && (state.topic === 'room_photos' || state.topic === 'extra_photos')) {
    // Continue to ManyChat's media branch; do not quote, select or collect data.
    delete state.pending;
  }
  else if ((extraCodes(s).length || /\b(extras|servicos adicionais|servicos extras|experiencias)\b/.test(s)) && !state.changed) {
    delete state.pending; // Informational extra offers are not room recommendations or acceptance.
  }
  else if (inquiry) {
    // Ignore an upstream QUOTE proposal for a factual question or a meal/day
    // visit follow-up. Preserve the answer without promising any new policy.
    delete state.pending;
  }
  else if (state.stay_date_pending) {
    answer = stayDateClarification(state.stay_date_pending);
    delete state.pending;
  }
  else {
    const selected = quote ? selection(s, quote) : undefined;
    const selecting = /\b(quero|prefiro|escolho|escolhi|aceito|pode ser|fico com|vou ficar|vou querer)\b/.test(s);
    if (quote && selected && selecting && !question(s) && !/\b(nao|talvez|pensar|depois|ainda)\b/.test(s)) {
      state.pending = { quote_id: quote.id, option: selected.name };
      confirmationText = confirmation(quote, selected.name);
      decision = 'COLETAR'; // Routes only to the confirmation card, NEVER directly to data collection.
    } else if (quote && state.pending?.quote_id === quote.id && /^(sim|confirmo|pode prosseguir|quero prosseguir)[.!]?$/.test(s)) {
      confirmationText = confirmation(quote, state.pending.option);
      decision = 'COLETAR';
    } else if (recommendation(s) && state.facts.guests && state.facts.guests <= 4) {
      const premium = quote?.options[0];
      answer = premium
        ? `Minha primeira indicação é ${premium.name}, por ${amount(premium.total)} no período informado${quote!.extras.length ? ', com os extras escolhidos' : ''}. Se preferir uma opção mais econômica, também podemos comparar as demais acomodações da simulação. Qual combina melhor com sua viagem?`
        : 'Minha primeira indicação é o Loft: tem cama King, sala integrada e sacada com vista para o mar, para quem busca mais espaço e conforto. Se preferirem algo mais econômico, podemos comparar com outra suíte. Quais são as datas de entrada e saída?';
    } else if (lodging(s) || /^QUOTE\|/.test(proposed) || state.changed
      || state.facts.children_pending && (childAgeFollowup(raw) || /^\d{1,2}[.!]?$/.test(s))) {
      const f = state.facts;
      if (state.family_clarification === 'party_composition') answer = 'Para conferir a ocupação, quantos adultos e quantas crianças vão se hospedar ao todo?';
      else if (!f.guests) answer = 'Para quantas pessoas será a estadia?';
      else if (f.children_pending) answer = 'Quais são as idades das crianças? Assim consigo considerar a ocupação corretamente.';
      else if (!f.check_in || !f.check_out) answer = 'Quais são as datas de entrada e saída? Pode informar no formato dia/mês.';
      else if (f.check_out <= f.check_in || (Date.parse(`${f.check_out}T12:00:00Z`) - Date.parse(`${f.check_in}T12:00:00Z`)) / 86400000 > 30) answer = 'Preciso conferir as datas: a saída deve ser depois da entrada, e esta simulação aceita até 30 diárias. Quais datas deseja?';
      else if (!quote || state.changed || /^QUOTE\|/.test(proposed)) decision = `QUOTE|${f.check_in}|${f.check_out}|${f.guests}|${f.extras.join(',') || 'NONE'}`;
      else if (selecting || /reservar|prosseguir|aceito|confirmo/.test(s)) answer = 'Qual acomodação da simulação você prefere? Depois mostro um resumo para você confirmar a escolha antes de informar seus dados.';
    }
  }
  if (question(s)) delete state.pending;
  if (decision === 'NOQUOTE' && photoRetryRequest(publicMessage)) answer = PHOTO_CLARIFY;
  else if (decision === 'NOQUOTE' && photoDeliveryClaim(answer)) answer = mediaRequest(norm(publicMessage)) ? PHOTO_LOOKUP : PHOTO_CLARIFY;
  if (decision === 'NOQUOTE') awaitPhotoSubject(state, answer, now);
  if (decision !== 'COLETAR') confirmationText = '';
  if (state.first_turn && decision === 'NOQUOTE' && answer && !/^(olá|oi|bom dia|boa tarde|boa noite)/i.test(answer)) answer = 'Olá! Que bom receber seu contato no Hotel Solar. ☀️\n\n' + answer;
  delete state.awaiting;
  if (decision === 'NOQUOTE' && (!mediaRequest(norm(state.resolved_message || raw)) || documentPhotoInquiry(state.resolved_message || raw))) {
    remember(state, 'assistant', answer);
    if (!inquiry && /quantas pessoas/.test(answer)) state.awaiting = 'guests';
    else if (!inquiry && /datas de entrada e sa[ií]da/.test(answer)) state.awaiting = 'dates';
  }
  return { state: JSON.stringify(state), resolved_message: state.resolved_message || raw, quote_request: decision, can_collect: 'NAO', confirmation_text: confirmationText, answer };
}

export function control(body: any, now = Date.now()) {
  const result = controlTurn(body, now);
  if (body.operation === 'prepare' && 'state' in result && result.state && 'context' in result) {
    const state = parseGreetingState(result.state);
    const previous = readDailyGreeting(parseGreetingState(body.state)?.daily_greeting);
    const clock = belemClock(now);
    state.daily_greeting = {day: clock.day, first: previous?.day !== clock.day};
    const context = parseGreetingState(result.context);
    context.primeira_resposta_do_dia = state.daily_greeting.first;
    context.saudacao_do_horario = clock.greeting;
    context.fuso_horario = 'America/Belem';
    context.regra_saudacao = 'Na primeira resposta do dia, cumprimente com a saudação do horário informada e continue o assunto normalmente. Nas demais respostas do mesmo dia, não repita saudações nem boas-vindas. Isso não reinicia a conversa, não apaga fatos e não autoriza ações.';
    return {...result, state:JSON.stringify(state), context:JSON.stringify(context)};
  }
  return body.operation === 'route' ? withDailyGreeting(result, body.state, now) : result;
}

export async function handleConversation(body: any, authorization = '', transcribe = transcribeAudio, now = Date.now(), analyze = analyzeAttachment) {
  const input = String(body?.user_message || '').trim();
  if (body?.operation === 'prepare' && isAttachmentInput(input)) {
    let kind: AttachmentKind = 'unreadable';
    try {
      const analysis = await analyze(input, authorization);
      if (['payment_receipt', 'other', 'unreadable'].includes(analysis?.kind)) kind = analysis.kind;
      // Deliberately ignore every summary/content field from the provider.
    } catch { /* Unreadable files still go to a human; never reuse prior intent. */ }
    const state = loadState(body.state, now);
    state.attachment = {source_hash: attachmentSourceHash(input), kind, created_at: now};
    return control({...body, state}, now);
  }
  if (body?.operation !== 'prepare' || !isAudioInput(input)) return control(body || {}, now);
  let text = AUDIO_UNAVAILABLE;
  let status: AudioTurn['status'] = 'error';
  try {
    // Credentials travel only to the transcription provider, never to media URLs.
    text = (await transcribe(input, authorization)).trim().slice(0, 2000);
    if (text) status = 'ok';
    else text = AUDIO_UNAVAILABLE;
  } catch { /* Return a usable, non-technical fallback within ManyChat's timeout. */ }
  if (status === 'ok') text = safeAudioText(text);
  const result = control({...body, user_message: text}, now);
  if (!('context' in result) || !result.state) return result;
  const state = json(result.state);
  state.audio = {source_hash: audioSourceHash(input), text, status, created_at: now};
  const context = json(result.context);
  context.tipo_entrada = 'audio';
  context.audio_transcrito = status === 'ok';
  if (status === 'error') {
    context.ultima_mensagem = '[Não foi possível transcrever o áudio recebido.]';
    context.interpretacao_da_ultima_mensagem = context.ultima_mensagem;
    context.regra = `O áudio atual não foi compreendido. Responda somente: ${AUDIO_RETRY}`;
    context.cotacao_valida_para_estes_dados = null;
  }
  return {...result, state: JSON.stringify(state), context: JSON.stringify(context), input_type: 'audio', transcription_status: status};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const result = await handleConversation(req.body || {}, req.headers?.authorization || '');
  return res.status('error' in result ? 400 : 200).json(result);
}
