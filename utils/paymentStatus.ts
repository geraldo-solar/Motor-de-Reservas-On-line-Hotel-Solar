const normalize = (value: string) => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// This is a request for human verification, NEVER a verified financial fact.
// Store no amount, account, payment date, document or customer identity.
export const paymentStatusContext = 'Quero conferir a situação do meu pagamento com a recepção.';
export const paymentStatusAnswer = 'Vou chamar a recepção para conferir o pagamento. Somente a equipe pode confirmar o recebimento e dar entrada na reserva; por aqui, ainda não há confirmação financeira.';

/** Text-only reports/checks of an existing payment. General payment policy,
 * future intentions and unrelated purchases must keep their own routes. */
export function paymentStatusInquiry(message: string, previousMessage = ''): boolean {
  const s = normalize(message);
  if (!s) return false;
  if (s === normalize(paymentStatusContext)) return true;
  if (normalize(previousMessage) === normalize(paymentStatusContext)
    && /^(?:(?:e|mas|agora|entao)\s+)*(?:ja (?:caiu|receberam|recebeu|confirmou|confirmaram)|deu certo|esta (?:certo|confirmado|quitado)|foi (?:recebido|confirmado))[?.!]*$/.test(s)) return true;
  const payment = /\b(?:pagamentos?|pix|transferencias?|depositos?|comprovantes?|boletos?)\b/;
  const booking = /\b(?:reservas?|hospedagem|estadia|diarias?)\b/;
  const paymentObject = '(?:pagamento|pix|transferencia|deposito|sinal|saldo|comprovante|boleto)';
  const completedObject = new RegExp(`\\b(?:fiz|fizemos|fez|fizeram|efetuei|efetuamos|realizei|realizamos|enviei|enviamos|transferi|transferimos|depositei|depositamos) (?:hoje |ontem |agora )?(?:(?:o|a|um|uma|meu|minha|nosso|nossa) )*${paymentObject}\\b`);
  for (const part of s.split(/[;!?\n]|\.(?!\d)|\b(?:mas|porem)\b/)) {
    const clause = part.trim();
    if (!clause) continue;
    // "Sinal" can describe connectivity, not a deposit. An explicitly
    // unrelated purchase must not become a hotel-payment verification.
    const financialReference = payment.test(clause) || /\b(?:sinal|saldo)\b/.test(clause)
      && !/\b(?:internet|wi[ -]?fi|celular|telefone|televisao|tv|antena|operadora)\b/.test(clause);
    if (/\b(?:taxi|uber|outro hotel|outro restaurante|supermercado)\b/.test(clause)) continue;
    // Hypothetical/future procedures are not evidence of a payment made.
    if (/\b(?:se|quando|caso) (?:eu |nos )?(?:pagar|pagarmos|fizer|fizermos|efetuar|efetuarmos|enviar|enviarmos|tiver pago|tivermos pago)\b/.test(clause)
      || /\bnao (?:paguei|pagamos|fiz|fizemos|efetuei|efetuamos|realizei|realizamos|enviei|enviamos|transferi|transferimos|depositei|depositamos|quitei|quitamos)\b/.test(clause)) continue;
    if (/^(?:eu |nos )?(?:ja )?(?:paguei|pagamos|quitei|quitamos)(?: (?:tudo|sim|ontem|hoje|agora|ha pouco|agora mesmo|mais cedo))?(?: (?:no|com o|pelo|via|por|em) (?:cartao(?: de (?:credito|debito))?|credito|debito|dinheiro|pix))?(?: (?:ontem|hoje|agora))?$/.test(clause)) return true;
    if (/^(?:eu |nos )?(?:ja )?(?:acabei|acabamos) de (?:pagar|quitar)(?: agora)?$/.test(clause)) return true;
    if ((financialReference || booking.test(clause))
      && /\b(?:paguei|pagamos|pagou|pagaram|quitei|quitamos|quitou|quitaram|(?:acabei|acabamos|acabou|acabaram) de (?:pagar|quitar))\b/.test(clause)) return true;
    // Bind past verbs to the financial object: "fiz minha reserva, como faço
    // o pagamento?" reports a booking, not a completed payment.
    if (financialReference && completedObject.test(clause)) return true;
    // Actual reports above remain valid even if they also mention a future
    // balance. Policy/future-only questions below must not trigger a handoff.
    if (/\b(?:vou|vamos|vai|vao|irei|iremos|pretendo|pretendemos|quero|queremos|preciso|precisamos|gostaria)(?: de)? (?:pagar|quitar|fazer|efetuar|realizar|enviar)\b/.test(clause)
      || /\b(?:pode|podem|poderia|poderiam|deve|devem|precisa|precisam|sera|serao)(?: ser| estar)? (?:pag[oa]s?|quitad[oa]s?|enviad[oa]s?|feit[oa]s?|efetuad[oa]s?|realizad[oa]s?|confirmad[oa]s?|compensad[oa]s?)\b/.test(clause)
      || /\b(?:parcelas?|parcelamento|formas de pagamento|meios de pagamento)\b/.test(clause)
      || /\b(?:como (?:e|eh|sera) (?:feito|realizado|efetuado)|(?:e|eh) (?:pago|paga) (?:antecipadamente|antes|depois|no check.?in|na chegada)|(?:para )?qual (?:chave|conta))\b/.test(clause)
      || new RegExp(`\\bcomo (?:(?:o|a) )?${paymentObject} (?:e|eh|sera) (?:confirmado|conferido|verificado|processado|feito|realizado|efetuado)\\b`).test(clause)) continue;
    if (financialReference
      && /\b(?:receberam|recebeu|recebid[oa]s?|caiu|consta|localizaram|localizou|conferir|conferiram|conferiu|confiram|verificar|verificaram|verifiquem|confirmar|confirmaram|confirmou|confirmem|confirmad[oa]s?|compensou|compensad[oa]s?|quitad[oa]s?|baixou|dar baixa|deu baixa|situacao|status)\b/.test(clause)
      && !/\b(?:como funciona|formas de|prazo (?:de|para)|quanto tempo|demora|costuma|normalmente)\b/.test(clause)) return true;
    const performed = /\b(?:ja foi|ja esta|foi|esta|foram|estao) (?:pag[oa]s?|feit[oa]s?|efetuad[oa]s?|realizad[oa]s?|enviad[oa]s?)\b/.test(clause)
      || new RegExp(`^(?:(?:o|a|meu|minha) )?${paymentObject} (?:ja )?(?:pago|feito|efetuado|realizado|enviado)(?: (?:hoje|ontem|agora))?$`).test(clause);
    if (financialReference && performed
      && !/\b(?:nao|ainda nao) (?:foi|foram|esta|estao)\b/.test(clause)) return true;
    if (booking.test(clause) && /\b(?:minha|nossa)\b/.test(clause)
      && /\b(?:paga|pago|quitada|quitado)\b/.test(clause)) return true;
    if (/\b(?:quanto (?:eu )?ja paguei|quanto falta (?:eu )?pagar)\b/.test(clause)) return true;
  }
  return false;
}
