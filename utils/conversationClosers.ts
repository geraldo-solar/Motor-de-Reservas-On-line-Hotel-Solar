// Short reactions that close a turn ("ok", "obrigado", "👍", "nenhuma") and
// messages sent by the customer's own WhatsApp Business app. The audit of
// 02/10/2026 found five long AI answers in a row to "Ok"/"🤝👍" and a package
// list sent in reply to an away message.

const norm = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\s+/g, ' ').trim();
const words = (value: string) => norm(value).replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

export const closingAnswer = 'Combinado! 😊 Se surgir qualquer dúvida, é só me chamar por aqui.';
export const thanksAnswer = 'Por nada! 😊 Se surgir qualquer dúvida, é só me chamar por aqui.';

/** Away/greeting messages of the customer's WhatsApp Business app. */
export function automaticReply(message: string): boolean {
  const s = norm(message);
  if (!s || s.length > 700) return false;
  return /\b(?:esta e uma )?(?:mensagem|resposta) automatica\b/.test(s)
    || /\b(?:nao estamos|nao estou) disponive(?:l|is) (?:no momento|agora)\b/.test(s)
    || /\b(?:estamos|estou) (?:ausentes?|fora do (?:escritorio|expediente))\b/.test(s)
    || /\bagradecemos (?:o |a |pelo |pela )?(?:seu |sua )?(?:contato|mensagem)\b/.test(s)
      && /\b(?:responderemos|retornaremos|em breve|assim que possivel|no momento|horario)\b/.test(s)
    || /\bfora do (?:nosso )?horario de (?:atendimento|expediente|funcionamento)\b/.test(s)
      && /\b(?:responderemos|retornaremos|em breve|assim que)\b/.test(s);
}

/** "ok", "obrigado", "👍": a reaction, not a request or an answer with data. */
export function acknowledgment(message: string): boolean {
  const raw = message.trim();
  if (!raw || raw.length > 60) return false;
  if (!/[\p{L}\p{N}]/u.test(raw)) return true; // only emojis or punctuation
  const s = words(raw);
  return /^(?:(?:ok|okay|oks|okk|blz|beleza|certo|ta|ta bom|ta certo|ta otimo|tudo bem|tudo certo|entendi|entendido|perfeito|otimo|show|legal|joia|combinado|obrigad[oa]|muito obrigad[oa]|obg|brigad[oa]|valeu|vlw|grat[oa]|gratidao|amem|amen|tmj|top|massa|kkk+|rs+|hum+|ah|ahh|aham|uhum)\s*)+$/.test(s);
}

/** "Nenhuma", "não, obrigado": no more questions. "nenhuma dúvida" closes
 * even after a question; a bare "não" may answer it, so it is "soft". */
export function declined(message: string): 'firm' | 'soft' | undefined {
  const raw = message.trim();
  if (!raw || raw.length > 60 || raw.includes('?')) return;
  const s = words(raw);
  const tail = '(?: (?:obrigad[oa]|valeu|por enquanto|mesmo))*$';
  if (new RegExp(`^(?:nenhuma|nenhum|nenhuma duvida|sem duvidas?|nada|so isso|e so isso|era so isso|tudo esclarecido|ja esta tudo certo|esta tudo certo)${tail}`).test(s)) return 'firm';
  if (new RegExp(`^(?:nao|nao obrigad[oa]|nao precisa|nao por enquanto|por enquanto nao|no momento nao)${tail}`).test(s)) return 'soft';
  return;
}

// The previous assistant turn already said goodbye (our closing or the
// hesitation answer): a further "ok" or emoji needs no answer.
const farewell = (text: string) => /(?:é só me chamar(?: por aqui| aqui)?|me chame quando quiser)[^?]*$/.test(text.trim());

export const stayThanksAnswer = 'Nós que agradecemos! 😊 Foi um prazer receber você no Hotel Solar. Se precisar de algo, é só chamar por aqui.';

/** "Agradeço a estadia, maravilhoso o atendimento", "Obrigada pela
 * hospedagem, amamos tudo" (audit 26/10/2026: got "Para quantas pessoas?"). */
export function stayThanks(message: string): boolean {
  const raw = message.trim();
  if (!raw || raw.length > 400 || raw.includes('?')) return false;
  const s = words(raw);
  if (/\b(?:valor|valores|preco|quanto|reservar|disponibilidade|vaga|vagas|cotacao|orcamento|datas?|diarias?|pacote|proxima vez que|quero voltar em|esqueci|esquecemos|perdi|reclamacao|problema|cobranca|cobrado|estorno|reembolso)\b/.test(s)) return false;
  const thanks = /\b(?:agradec\w*|obrigad[oa]s?|grat[oa]s?|gratidao|valeu)\b/.test(s);
  const stay = /\b(?:estadia|hospedagem|acolhida|recepcao|atendimento|carinho|hospitalidade|tudo|dias|temporada|feriado|fim de semana)\b/.test(s);
  const praise = /\b(?:maravilhos[oa]|otim[oa]|excelente|perfeit[oa]|incrivel|adorei|adoramos|amei|amamos|gostei|gostamos|voltaremos|voltarei|voltar sempre|chegamos bem|cheguei bem)\b/.test(s);
  return thanks && (stay || praise) || praise && /\b(?:estadia|hospedagem|hotel|atendimento)\b/.test(s);
}

export type ClosingTurn = {kind: 'automatic_reply' | 'silent' | 'closing'; answer: string};

/** Deterministic reply for a closing reaction, or undefined to answer normally.
 * An "ok" right after a question (in the closing lines) may be its answer, so it is left alone. */
export function closingTurn(message: string, lastAssistant = '', resumed = false): ClosingTurn | undefined {
  if (automaticReply(message)) return {kind: 'automatic_reply', answer: ''};
  if (stayThanks(message)) return {kind: 'closing', answer: stayThanksAnswer};
  // A question left on another day is not what "Tudo certo" answers now
  // (audit 26/10/2026: a guest's reply to the check-in welcome went to the team).
  if (resumed) lastAssistant = '';
  const ack = acknowledgment(message), decline = declined(message);
  if (!ack && !decline) return;
  const last = lastAssistant.replace(/https?:\/\/\S+/g, 'link').trim();
  if (farewell(last)) return {kind: 'silent', answer: ''};
  // A thank-you never answers the question ("Obrigada!" after the price
  // summary got "Continuamos falando do pacote", audit 07/10/2026).
  const thanks = /\b(?:obrigad|brigad|obg|valeu|vlw|grat)/.test(words(message));
  // Turns are stored up to 900 characters: a cut text may end in a question.
  if (decline !== 'firm' && !(ack && thanks) && (lastAssistant.length >= 880 || /\?[^?]{0,140}$/.test(last))) return;
  return {kind: 'closing', answer: thanks ? thanksAnswer : closingAnswer};
}

/** The assistant turn just before the customer's current message. */
export function assistantBefore(state: any, message: string): string {
  const turns = Array.isArray(state?.turns) ? state.turns : [];
  const text = String(message || '').slice(0, 900);
  let index = turns.length - 1;
  while (index >= 0 && !(turns[index]?.role === 'user' && turns[index]?.text === text)) index--;
  for (let previous = index - 1; previous >= 0; previous--)
    if (turns[previous]?.role === 'assistant') return String(turns[previous].text || '');
  return '';
}
