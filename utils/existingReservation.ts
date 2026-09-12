const normalize = (value: string) => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// These are routing descriptions, not a verified booking/payment status.
// Persist only this generic context, never a name, amount or payment link.
export const existingReservationContext = 'Quero conferir com a recepção uma solicitação de reserva já feita.';
export const existingReservationAnswer = 'Vou chamar a recepção para localizar sua solicitação, conferir a situação e orientar como prosseguir.';

/** Recognizes an existing request needing staff, not a new booking or proof
 * that a reservation exists/is active. The caller owns the context's TTL and
 * must execute the native human route before claiming an actual handoff. */
export function existingReservationInquiry(message: string, contextual = false): boolean {
  const s = normalize(message);
  if (!s) return false;
  if (s === normalize(existingReservationContext)) return true;
  // Exclude other services and explicitly unrelated purchases. The restaurant
  // name alone must never become a lodging reservation.
  if (/\b(?:reserva solar|restaurantes?|mesas?|almoco|jantar|day[ -]?use|ingressos?|eventos?|casamento|aniversario|outro hotel|supermercado|taxi|uber)\b/.test(s)) return false;
  if (/\b(?:se|caso|quando) (?:eu |nos )?(?:tiver|tivermos|fizer|fizermos|solicitar|solicitarmos|esquecer|esquecermos|perder|perdermos|nao pagar|nao pagarmos)\b/.test(s)
    || /\b(?:suponha|hipoteticamente|por exemplo)\b/.test(s)) return false;
  if (/\b(?:nao|nunca) (?:tenho|temos|tive|tivemos|fiz|fizemos|solicitei|solicitamos|pedi|pedimos)\b.{0,35}\breserva\b/.test(s)) return false;
  if (/\b(?:nao|nunca) (?:esqueci|esquecemos|perdi|perdemos)\b/.test(s)) return false;
  const newRequest = /\b(?:quero|queremos|gostaria(?:mos)?(?: de)?|preciso|precisamos|vou|vamos|pretendo|pretendemos|podemos|pode) (?:fazer |solicitar |pedir )?(?:uma |a |outra |nova |uma nova )?reserva\b|\b(?:quero|queremos|vou|vamos|pretendo|pretendemos|gostaria(?: de)?) reservar\b/;
  if (newRequest.test(s)) return false;

  const payment = '(?:pagamento|sinal|saldo|boleto|pix|transferencia|deposito)';
  const paymentArticle = '(?:(?:o|a|meu|minha|nosso|nossa|um|uma) )*';
  const missedPayment = new RegExp(`\\b(?:esqueci|esquecemos|acabei esquecendo|acabamos esquecendo) (?:de )?(?:(?:fazer|realizar|efetuar) ${paymentArticle}${payment}|pagar(?: ${paymentArticle}${payment})?)\\b`);
  const notCompleted = new RegExp(`\\b(?:acabei|acabamos) (?:nao (?:fazendo|realizando|efetuando) ${paymentArticle}${payment}|(?:nao pagando|sem pagar))\\b`);
  const lostDeadline = new RegExp(`\\b(?:perdi|perdemos|perdeu|passou|venceu|expirou) ${paymentArticle}prazo (?:do |de |para (?:o )?)?(?:pagamento|pagar)\\b|\\b(?:prazo (?:do |de |para (?:o )?)?(?:pagamento|pagar)|link de pagamento|boleto) (?:ja )?(?:venceu|expirou|passou|vencido|expirado|esta vencido|esta expirado)\\b`);
  if (missedPayment.test(s) || notCompleted.test(s) || lostDeadline.test(s)) return true;

  // An actual request to locate/check the booking remains operational even
  // when the same message also asks for a photo or a hotel facility.
  const existingStatus = /\b(?:minha|nossa|essa|esta) (?:solicitacao de )?reserva\b.{0,60}\b(?:situacao|status|confirmada|ativa|valida|cancelada|vencida|localizar|conferir|verificar|pendente)\b/.test(s)
    || /\b(?:localizar|conferir|verificar|consultar) (?:a )?(?:minha|nossa) (?:solicitacao de )?reserva\b/.test(s)
    || /\b(?:situacao|status|localizacao) (?:atual )?(?:da|de) (?:minha|nossa|essa|esta) reserva\b/.test(s);
  if (existingStatus) return true;
  // A known reservation may be mentioned in an ordinary FAQ. That remains
  // informational; merely mentioning it does not authorize a new handoff.
  const faq = /\b(?:horarios?|que horas|check[ -]?in|check[ -]?out|cafe|wifi|wi[ -]?fi|senha|piscinas?|pets?|estacionamento|precos?|valores?|tarifas?|quanto custa|quanto fica|quanto e|formas de pagamento|meios de pagamento|parcelas?|parcelamento|parcelar|aceita(?:m)? pix|posso pagar (?:com|por|via|no|em) (?:pix|cartao)|como (?:e|funciona) (?:o )?pagamento)\b/;
  const hotelInformation = /\b(?:fotos?|fotografias?|imagens?|videos?|galeria|album|cachorr[oa]s?|gatos?|animais|bercos?|passeios?|barcos?|quadriciclos?)\b/
    .test(s) || /\b(?:endereco|localizacao) (?:do|de) (?:hotel|solar)\b|\bonde (?:fica|e) (?:o )?hotel\b/.test(s);
  if (faq.test(s) || hotelInformation) return false;
  const requestMade = /\b(?:solicitei|solicitamos|pedi|pedimos|fiz|fizemos|tinha feito|havia feito|ja tenho|ja temos|tenho|temos|estou com|estamos com) (?:uma |a |minha |nossa |essa |esta |solicitacao de )*reserva\b/;
  if (requestMade.test(s)) return true;

  if (!contextual || s.length > 160) return false;
  // Only short operational follow-ups to the fresh request. Never use a
  // remembered request to absorb a new FAQ or arbitrary customer content.
  return /^(?:(?:e|mas|agora|entao|eu)\s+)*(?:(?:ainda |ja )?nao (?:paguei|pagamos)|(?:o |meu |esse )*link (?:ja )?(?:expirou|venceu|esta vencido|esta expirado)|(?:o )?prazo (?:ja )?(?:passou|venceu)|perdi o prazo|(?:e )?agora|como (?:posso )?(?:prosseguir|continuar)|qual (?:e )?o proximo passo|posso (?:pagar agora|usar (?:o )?(?:mesmo|esse) link)|(?:ainda )?(?:posso|consigo) pagar)[?.!]*$/.test(s);
}
