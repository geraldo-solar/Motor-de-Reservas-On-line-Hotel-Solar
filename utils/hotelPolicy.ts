import { photoSessionInquiry, photoSessionAnswer } from './photoSession.js';
import { explicitHumanRequest } from './humanIntent.js';
import { massagePolicy, massageInquiry } from './massageService.js';

/** Business facts explicitly confirmed by the hotel owner on 2026-09-11.
 * This informs the assistant; it does not change tariffs, stock or bookings.
 */
export const confirmedHotelPolicy = {
  confirmed_at: '2026-09-11',
  source: 'Confirmações explícitas do responsável durante a revisão do atendimento',
  check_in: {
    normal_from: '14:00',
    early: 'Mediante disponibilidade: antes das 06h, uma diária inteira; das 06h até antes das 14h, R$250.',
    waiting: 'Quem tem reserva pode usar as áreas comuns antes das 14h sem taxa de acesso enquanto aguarda o apartamento. Não inclui refeições, bebidas, outros consumos nem liberação antecipada do quarto.',
  },
  check_out: {
    normal_until: '12:00',
    late: 'Mediante disponibilidade: após as 12h e até as 18h, R$250; depois das 18h, uma diária inteira. Preservar benefícios expressamente incluídos no pacote contratado.',
  },
  ordinary_installments: 'Reservas comuns: até 3 vezes sem juros, sem valor mínimo por parcela. Condições específicas do pacote prevalecem. Não inferir desconto à vista nem modificar sinal ou saldo.',
  boat: 'Passeio terceirizado, disponível sob consulta. Não informar preço fixo, duração ou horário garantidos. Valores, horários e disponibilidade devem ser consultados com a recepção. Preservar passeio expressamente incluído no pacote, conforme suas condições.',
  quad_bike: {
    provider: 'LocMil Turismo',
    phone: '(91) 98765-7501',
    whatsapp: 'https://wa.me/5591987657501',
    source_url: 'https://grupolocmil.com.br/',
    checked_at: '2026-09-11',
    scope: 'Passeio de quadriciclo terceirizado. Valores, horários, disponibilidade e contratação diretamente com a LocMil. Número divulgado no site oficial; não houve contato para testar atendimento. Não substituir a recepção no assunto passeio de barco.',
  },
  room_food_delivery: {
    opens: '08:00', closes: '22:00', delivery_fee_brl: 0,
    limits: 'Entrega de refeições nos apartamentos sem taxa adicional de entrega. Consumo e demais cobranças aplicáveis não são gratuitos. Cardápio e oferta de cada item ao longo do horário devem ser consultados. Pedido efetivo segue à equipe, sem afirmar aceite, prazo ou entrega executados. Não altera o horário geral dos restaurantes.',
  },
  accessibility: {
    ground_floor_rooms: 'Há apartamentos no térreo indicados para pessoas em cadeira de rodas, com percurso sem degraus, por piso plano ou rampas, desde a recepção. Os banheiros NÃO são adaptados; não chamar os apartamentos de totalmente adaptados.',
    common_areas: 'Acesso sem degraus às demais áreas do hotel, incluindo Solar 73, áreas das piscinas, playground e capela. Reserva Solar é a exceção: não possui acesso sem degraus.',
    limits: 'Necessidades específicas devem ser conferidas com a equipe antes da escolha. Não inferir dimensões de portas/box, barras, equipamento para entrar nas piscinas, assistência, solução alternativa no Reserva Solar ou compatibilidade com toda cadeira de rodas.',
  },
  hydromassage: {
    confirmed_at: '2026-09-13',
    pools: 2,
    use: 'As duas piscinas de hidromassagem são compartilhadas pelos hóspedes, não privativas nem exclusivas de um apartamento.',
    heating_confirmed: false,
    limits: 'Não afirmar aquecimento, temperatura, reserva exclusiva, horário ou disponibilidade não confirmados.',
  },
  photo_sessions: {
    confirmed_at: '2026-09-13',
    prior_reception_consultation_required: true,
    applies_to: 'Ensaios e sessões de fotos de hóspedes, inclusive nas áreas comuns e com fotógrafo externo.',
    limits: 'Hospedar-se não concede automaticamente autorização para o ensaio. Consultar previamente a recepção não confirma permissão, agendamento, áreas específicas, preço ou exclusividade.',
  },
  // Owner correction of 27/10/2026: the model said the hair dryer was in the bathroom.
  room_amenities: {
    confirmed_at: '2026-10-27',
    hair_dryer: 'Os apartamentos NÃO têm secador de cabelo. Ele é emprestado pela recepção, a pedido do hóspede.',
    iron: 'Os apartamentos NÃO têm ferro de passar roupa. Ele é emprestado pela recepção, a pedido do hóspede.',
    limits: 'Não afirmar que secador ou ferro ficam no banheiro ou no apartamento. Empréstimo sujeito à disponibilidade no momento; não reservar o item.',
  },
  guest_guide: 'https://www.hotelsolar.tur.br/guia',
  massages: massagePolicy,
  limits: 'Políticas confirmadas prevalecem sobre mensagens antigas. Não representam disponibilidade em tempo real, contratação, agendamento, reserva de item nem execução de serviço. Não ampliar benefícios a outros serviços.',
} as const;

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// New confirmed information must not be mistaken for room occupancy/dates.
// Callers retain their existing human, photo, event and booking precedence.
export function hotelPolicyInquiry(message: string): boolean {
  const s = normalize(message);
  return photoSessionInquiry(message) || hydromassageInquiry(message) || massageInquiry(message)
    || /\b(?:quadriciclos?|loc\s?mil|room service|servico de quarto)\b/.test(s)
    || /\bguia\b/.test(s) && /\b(?:hotel|hospede|hospedes|solar)\b/.test(s)
    || /\b(?:cadeira de rodas|rampas?|degraus?|banheiros? adaptados?)\b/.test(s)
    || /\b(?:camas? extras?|camas? separadas|duas camas de solteiro)\b/.test(s)
    || borrowedAmenityInquiry(message);
}

export function hydromassageInquiry(message: string): boolean {
  const s = normalize(message);
  return /\b(?:hidromassagem|hidromassagens|hidros?|jacuzzis?)\b/.test(s)
    && !/\b(?:fotos?|fotografias?|imagem|imagens|videos?|galeria|album|quebrad[oa]|defeito|manutencao|nao funciona)\b/.test(s);
}

/** Only current owner-confirmed policies; callers still retain explicit
 * human, operational, attachment and actual media-request priority. */
export const borrowedAmenitiesAnswer = 'Os apartamentos não têm secador de cabelo nem ferro de passar roupa. Os dois são emprestados pela recepção: é só pedir, conforme a disponibilidade no momento.';
const amenityWords = /\b(?:secador(?:es)?(?: de cabelo)?|secadores|ferro(?:s)? de passar|ferro(?:s)? de roupa|tabua de passar)\b/;
export function borrowedAmenityInquiry(message: string): boolean {
  return amenityWords.test(normalize(message));
}
/** The model placing the hair dryer or the iron in the room (27/10/2026):
 * those sentences are replaced by the confirmed rule. */
export function correctBorrowedAmenities(answer: string): string {
  if (!amenityWords.test(normalize(answer))) return answer;
  if (/recepcao/.test(normalize(answer)) && !/\b(?:no banheiro|nos banheiros|no quarto|nos quartos|no apartamento|nos apartamentos|disponive(?:l|is) (?:no|nos|em todos))\b/.test(normalize(answer))) return answer;
  const kept = answer.split(/(?<=[.!?])\s+|\n+/).filter(part => !amenityWords.test(normalize(part)));
  return [...kept, borrowedAmenitiesAnswer].join(' ').replace(/\s{2,}/g, ' ').trim();
}

export function confirmedHotelAnswer(message: string): string | undefined {
  if (explicitHumanRequest(message)) return;
  if (photoSessionInquiry(message)) return photoSessionAnswer;
  if (borrowedAmenityInquiry(message)) return borrowedAmenitiesAnswer;
  if (!hydromassageInquiry(message)) return;
  const answer = 'Temos duas piscinas de hidromassagem, de uso compartilhado dos hóspedes. Elas não são privativas nem exclusivas de um apartamento.';
  return /\b(?:aquecid[oa]s?|aquecimento|quentes?|temperatura|esquenta)\b/.test(normalize(message))
    ? answer + ' Sobre aquecimento e temperatura, consulte a recepção para confirmar.' : answer;
}

export function locmilAnswer(message: string): string | undefined {
  if (!/\b(?:quadriciclos?|loc\s?mil)\b/.test(normalize(message))) return;
  return 'Para passeios de quadriciclo, indicamos a LocMil Turismo, uma empresa terceirizada. WhatsApp: (91) 98765-7501 — https://wa.me/5591987657501. Valores, horários, disponibilidade e contratação são tratados diretamente com eles.';
}
