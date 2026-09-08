const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.!?,]/g, ' ').replace(/\s+/g, ' ').trim();

export const PHOTO_LOOKUP = 'Vou consultar as fotos solicitadas no acervo do hotel.';
export const PHOTO_CLARIFY = 'De qual espaço do hotel você gostaria de ver fotos?';

// Only our explicit clarification prompts open a photo-selection turn. Do not
// infer that pending question from arbitrary prose or old conversation history.
export function photoClarificationQuestion(value: string) {
  return [PHOTO_CLARIFY, 'Pode me dizer de qual espaço do hotel você gostaria de ver fotos?'].some(question => normalize(value) === normalize(question));
}

export function documentPhotoInquiry(value: string) {
  const s = normalize(value);
  return /\b(?:foto|fotos|imagem|imagens)\b/.test(s) && /\b(?:comprovante|comprovantes|documento|documentos|pdf|anexo|anexos)\b/.test(s);
}

// A report about a missing receipt/payment must never retry hotel photographs.
// Match the whole short message, not any sentence containing "não chegou".
export function photoRetryRequest(value: string) {
  const s = normalize(value).replace(/^(?:por favor|pfv)\s+|\s+(?:por favor|pfv)$/g, '');
  const photo = '(?:(?:a|as|essa|essas|esta|estas|sua|suas) )?(?:foto|fotos|imagem|imagens)';
  return new RegExp(`^(?:${photo} (?:ainda )?nao (?:chegou|chegaram|apareceu|apareceram|veio|vieram|carregou|carregaram)|(?:ainda )?nao (?:recebi|chegou|chegaram|apareceu|apareceram|vejo|consigo ver) ${photo}|(?:pode |poderia )?(?:me )?(?:reenviar|reenvie|reenvi[ae]r?|mandar|mande|manda|enviar|envie) ${photo}(?: (?:de novo|novamente|outra vez))?)$`).test(s);
}

// Only meaningful with a live photo topic; never revive stale conversation.
export function shortPhotoRetry(value: string) {
  return /^(?:(?:pode|poderia) )?(?:me )?(?:reenviar|reenvie|reenvia|manda de novo|mande de novo|envie novamente)(?: por favor| pfv)?$/.test(normalize(value));
}

// Model prose is not a media receipt. This is a final guard in addition to
// routing explicit photo requests through the real media selector.
export function photoDeliveryClaim(value: string) {
  const s = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
  const photo = '\\b(?:foto|fotos|fotografia|fotografias|imagem|imagens|galeria|album)\\b';
  const delivery = '\\b(?:enviei|enviamos|encaminhei|encaminhamos|mandei|mandamos|reenviei|reenviamos|(?:estou|estamos) (?:enviando|encaminhando|reenviando)|(?:vou|vamos) (?:(?:te|lhe) )?(?:enviar|encaminhar|mandar|reenviar)|aqui est(?:a|ao)|seguem?)\\b';
  if (new RegExp(`${delivery}[^.;!?]{0,180}${photo}|${photo}[^.;!?]{0,180}${delivery}`).test(s)) return true;
  // "A foto pode ser enviada" is upload guidance, and "enviada por você"
  // describes the customer's attachment, not an outbound send by the bot.
  return s.split(/[.;!?]/).some(sentence => !/\b(?:por voce|por voces|pelo cliente|pela cliente)\b/.test(sentence)
    && new RegExp(`${photo}[^.;!?]{0,80}\\b(?:foi|foram|esta|estao) (?:ja )?(?:enviad[ao]s?|encaminhad[ao]s?|anexad[ao]s?)\\b`).test(sentence));
}
