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
  guest_guide: 'https://www.hotelsolar.tur.br/guia',
  limits: 'Políticas confirmadas prevalecem sobre mensagens antigas. Não representam disponibilidade em tempo real, contratação, agendamento, reserva de item nem execução de serviço. Não ampliar benefícios a outros serviços.',
} as const;

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// New confirmed information must not be mistaken for room occupancy/dates.
// Callers retain their existing human, photo, event and booking precedence.
export function hotelPolicyInquiry(message: string): boolean {
  const s = normalize(message);
  return /\b(?:quadriciclos?|loc\s?mil|room service|servico de quarto)\b/.test(s)
    || /\bguia\b/.test(s) && /\b(?:hotel|hospede|hospedes|solar)\b/.test(s)
    || /\b(?:cadeira de rodas|rampas?|degraus?|banheiros? adaptados?)\b/.test(s)
    || /\b(?:camas? extras?|camas? separadas|duas camas de solteiro)\b/.test(s);
}

export function locmilAnswer(message: string): string | undefined {
  if (!/\b(?:quadriciclos?|loc\s?mil)\b/.test(normalize(message))) return;
  return 'Para passeios de quadriciclo, indicamos a LocMil Turismo, uma empresa terceirizada. WhatsApp: (91) 98765-7501 — https://wa.me/5591987657501. Valores, horários, disponibilidade e contratação são tratados diretamente com eles.';
}
