import { isPrivateEventRequest, publicEventInquiry } from './publicEvents.js';
import { reservaRestaurantMessage } from './restaurantIntent.js';

// Latest explicit owner confirmation supersedes older seasonal Day Use copy.
// A calendar holiday or vacation period is NOT authorization to charge entry.
export const confirmedDiningPolicy = {
  confirmed_at: '2026-09-11',
  confirmed_by: 'Geraldo Barros, responsável pelo Hotel Solar',
  source: 'Confirmação explícita do responsável no atendimento de configuração da IA.',
  hours: {
    solar_73: { name: 'Solar 73', opens: '11:00', closes: '23:00' },
    reserva_solar: {
      name: 'Reserva Solar',
      low_season: {
        weekdays: ['sexta-feira', 'sábado', 'domingo'],
        opens: '10:00', closes: '18:00', approximate: true,
      },
    },
    special_date_hours_confirmed: false,
  },
  reserva_solar_admission: {
    default: 'free',
    default_description: 'A entrada no Reserva Solar é gratuita como regra.',
    charge_requires_owner_authorized_date: true,
    authorization_rule: 'Cobrança somente em datas de grande movimento previamente informadas por Geraldo Barros.',
    infer_charge_from_holiday_or_vacation: false,
    default_paid_amount: null,
    authorized_charge_dates: [] as ReadonlyArray<{ date: string; amount?: number; description?: string }>,
  },
  breakfast_visitors: {
    available: true,
    age_basis: 'Idade em anos completos.',
    prices_brl_by_age: [
      { min_age_years: 0, max_age_years: 6, price_brl_per_person: 0 },
      { min_age_years: 7, max_age_years: 12, price_brl_per_person: 35 },
      { min_age_years: 13, max_age_years: null, price_brl_per_person: 75 },
    ],
    price_note: 'Até 6 anos: cortesia; de 7 a 12 anos: R$35; a partir de 13 anos: R$75. Os mesmos valores se aplicam ao buffet e ao à la carte.',
    hours: { opens: '07:00', closes: '10:00' },
    service_note: 'Durante a semana, conforme o movimento, o serviço pode ser à la carte. Não garantir buffet para uma data sem confirmação.',
    weekday_booking: {
      required: true,
      channel: 'recepção',
      applies_to: ['buffet', 'à la carte'],
      note: 'Para não hóspedes, é necessário agendar previamente com a recepção durante a semana, inclusive quando o serviço é à la carte. Orientar a consulta não confirma agendamento, disponibilidade ou funcionamento na data.',
    },
    visitor_children_price_confirmed: true,
    source: 'Confirmação explícita do responsável em 11/09/2026: preços por idade, mesmos valores no buffet e no à la carte e agendamento prévio durante a semana. Horário da base vigente.',
    confirmed_at: '2026-09-11',
  },
  restaurant_visits: {
    ordinary_seating: 'Por ordem de chegada; não prometer reserva de mesa no atendimento comum.',
    scope: 'Visitas comuns ao restaurante. O café avulso para não hóspedes durante a semana exige agendamento prévio com a recepção. Eventos, Mesa Posta e outras experiências agendadas mantêm confirmação própria com a equipe.',
    source: 'Resposta da equipe no atendimento geral em 08/09/2026 a uma pergunta sobre necessidade de reserva para visitar o restaurante.',
    observed_at: '2026-09-08',
  },
  limits: [
    'Não aplicar automaticamente R$40 nem outra tarifa de entrada.',
    'Não deduzir cobrança apenas porque é feriado, férias ou fim de semana.',
    'Sem programação autorizada cadastrada, prevalece a regra de entrada gratuita.',
    'Esta regra de entrada não informa preço de refeições, café da manhã, consumo, couvert ou eventos.',
    'A tabela infantil confirmada do café avulso vale somente para esse serviço, no buffet ou à la carte. Não aplicar esses valores a diárias, ceias ou outros serviços; a entrada gratuita no Reserva Solar é uma regra separada.',
    'Agendamento do café avulso durante a semana deve ser consultado com a recepção. Não afirmar agendamento executado, vaga garantida ou funcionamento em tempo real.',
    'Os horários gerais não comprovam funcionamento em tempo real nem horários especiais de uma data.',
  ],
} as const;

const normalize = (message: string) => String(message || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Narrow admission FAQ; menus, meals, events and media retain their own routes. */
export function diningPolicyAnswer(message: string): string | undefined {
  message = reservaRestaurantMessage(message);
  const text = normalize(message);
  if (!/\breserva\s+solar\b/.test(text)) return;
  if (isPrivateEventRequest(message) || publicEventInquiry(message)) return;
  if (/\b(fotos?|fotografias?|imagem|imagens|videos?|galeria|album|cardapio|menu|pdf|pratos?|comida|bebidas?|drinks?|cafe|almoco|almocar|jantar|refeicoes|refeicao|buffet|couvert|consumo|consumir|camarao|peixes?|ostras?|carnes?|casamentos?|festas?|eventos?|aniversarios?|confraternizacao|cerimonia)\b/.test(text)) return;
  if (/\b(hospedagem|diarias?|quartos?|apartamentos?|loft|suites?|check.?in|check.?out)\b/.test(text)) return;
  if (/\b(paguei|cobrado|cobrada|reembolso|devolucao|estorno|errado|errada|atendente|humano|reclamacao)\b/.test(text)) return;
  // "Entrada de camarão", for example, is a menu item, not an admission fee.
  if (/\bentradas?\s+(?:de|com)\s+(?!r\$|\d|graca\b)/.test(text)) return;

  const admissionSubject = /\b(entrada|ingressos?|day[ -]?use|entrar|acessar|acesso)\b/.test(text);
  const admissionCharge = /\b(cobra|cobram|cobranca|paga|pagam|pagar|pago|gratuito|gratuita|gratis|graca|custa|custo|valor|preco|taxa|quanto|qual)\b/.test(text)
    || /\br\$\s*\d|\b\d+(?:[.,]\d{1,2})?\s*reais\b/.test(text);
  const venueChargeQuestion = /\breserva solar\s+(?:e|eh)\s+(?:pago|paga|gratuito|gratuita|gratis)\b/.test(text)
    || /\b(?:paga|pagar)\s+para\s+(?:ir|visitar)\b/.test(text);
  if (!(admissionSubject && admissionCharge) && !venueChargeQuestion) return;

  return 'A entrada no Reserva Solar é gratuita como regra. Cobrança só ocorre em datas de grande movimento previamente informadas pelo hotel; não é automática por ser feriado ou férias.';
}

/** General hours are not a real-time open/closed or table-availability check. */
export function reservaHoursAnswer(message: string, now=Date.now()): string | undefined {
  const s=normalize(reservaRestaurantMessage(message));
  if (!/\breserva solar\b/.test(s) || !/\b(?:funciona\w*|aberto|abrir|abre|fech\w*|horarios?)\b/.test(s)
    || isPrivateEventRequest(s) || publicEventInquiry(s)
    || /\b(?:cardapio|menu|fotos?|imagens?|videos?|hospedagem|diarias?|quartos?|pagamento|paguei|atendente|humano)\b/.test(s)) return;
  const h=confirmedDiningPolicy.hours.reserva_solar.low_season;
  const general=`O Restaurante Reserva Solar funciona habitualmente de sexta a domingo, das ${h.opens.replace(':00','h')} às ${h.closes.replace(':00','h')}, na baixa temporada.`;
  if (!/\b(?:hj|hoje)\b/.test(s)) return general+' Horários especiais e alterações de funcionamento precisam ser conferidos com a recepção.';
  const weekday=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Belem',weekday:'long'}).format(new Date(now));
  return general+` Hoje é ${weekday}${(h.weekdays as readonly string[]).includes(weekday) ? ', um dos dias habituais de funcionamento' : ', fora desses dias habituais'}. Não tenho confirmação de alterações para hoje; a recepção pode conferir.`;
}
