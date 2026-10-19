// Instagram direct messages through ManyChat (19/10/2026).
//
// The WhatsApp automation chains several external requests and message steps
// (route → prices/offers or resolve → photo loop → button). An Instagram
// message step cannot reuse those WhatsApp steps, so this turn runs the same
// chain in one call and returns a compact list of messages. ManyChat stores it
// in a custom field (ig_payload) and a Dynamic block renders it with
// `instagramContent`. Text follows the Instagram limit of 1000 characters.

export const INSTAGRAM_TEXT_LIMIT = 1000;
const INSTAGRAM_MAX_MESSAGES = 10;
const MAX_PHOTOS = 3;
const PHONE = '(91) 98100-0800';
export const INSTAGRAM_FALLBACK = `Não consegui concluir essa resposta agora. Pode repetir sua última mensagem? Se preferir atendimento humano, escreva “recepção” ou ligue para ${PHONE}.`;
export const INSTAGRAM_PHOTO_QUESTION = 'Pode me dizer de qual espaço do hotel você gostaria de ver fotos?';
export const INSTAGRAM_FOOTER = `Se preferir atendimento humano, toque abaixo ou ligue para ${PHONE}.`;
export const INSTAGRAM_QUOTE_FALLBACK = 'Não consegui concluir essa simulação agora. Ainda não há um orçamento válido para esta solicitação. Podemos tentar novamente ou, se preferir, chamar a recepção para continuar por aqui.';
const IMAGE_BASE = 'https://reservas.hotelsolar.tur.br/api/package-image?code=';

export type InstagramAction = 'RESPOSTA' | 'HUMANO' | 'ANEXO' | 'VAZIO';
export type InstagramMessage = {t: 'text'; v: string} | {t: 'image'; v: string} | {t: 'footer'};
type Call = (query: Record<string, string>, body: any) => Promise<any>;
export type InstagramDependencies = {route: (body: any) => Promise<any>; prices: Call; resolve: Call};

const media = (code: string) => /^(PACKAGE_ID|ROOM_ID|EXTRA_ID|SITE_ID)\|/.test(code);
const list = (code: string) => /PACKAGE_LIST|ROOM_LIST/.test(code);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const lower = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** WhatsApp wording that points to a button Instagram does not show at that spot. */
export function instagramText(value: string): string {
  return String(value || '')
    .replace(/toque em “Falar com a recepção”,\s*escreva/g, 'escreva')
    .replace(/toque em “Falar com a recepção” ou escreva/g, 'escreva')
    .replace(/Recepção: botão abaixo ou/g, 'Recepção: escreva “recepção” ou ligue')
    .replace(/toque abaixo ou\b/g, 'escreva “recepção” ou')
    .replace(/ pelo botão abaixo\b/g, ' escrevendo “recepção”')
    // The confirmation card's button does not exist here: the team continues.
    .replace(/\s*Para solicitar que a recepção verifique as vagas e continue por aqui, toque em “Confirmar opção”\. Só então pediremos nome completo, e-mail e CPF\./, '')
    // WhatsApp bold/italic markers are shown literally on Instagram.
    .replace(/\*([^*\n]{1,200})\*/g, '$1')
    .replace(/(^|[\s(])_([^_\n]{1,200})_(?=[\s.,!?)]|$)/g, '$1$2')
    .trim();
}

function cut(value: string, limit: number): number {
  const window = value.slice(0, limit + 1);
  for (const separator of ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' ']) {
    const at = window.lastIndexOf(separator);
    if (at >= limit * 0.4) return at + (separator.trim() ? separator.trimEnd().length : 0);
  }
  return limit;
}

/** Parts of at most 1000 characters, split at paragraphs, lines or sentences. */
export function splitInstagramText(value: string, limit = INSTAGRAM_TEXT_LIMIT): string[] {
  const parts: string[] = [];
  let rest = String(value || '').trim();
  while (rest.length > limit) {
    const at = cut(rest, limit);
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts.filter(Boolean);
}

const imageUrl = (code: string) => IMAGE_BASE + encodeURIComponent(code);

export type InstagramTurn = {
  ig_acao: InstagramAction;
  ig_payload: string;
  ig_botao_exibido: 'SIM' | 'NAO';
  state?: string;
  quote_state?: string;
};

export async function instagramTurn(body: any, deps: InstagramDependencies): Promise<InstagramTurn> {
  const message = text(body?.user_message);
  const buttonShown = text(body?.ig_botao_exibido) === 'SIM';
  let state = body?.state;
  let quoteState = body?.quote_state;
  const messages: InstagramMessage[] = [];
  let action: InstagramAction = 'RESPOSTA';
  let footer: 'SEMPRE' | 'UMA_VEZ' | 'NAO' = 'NAO';
  const say = (value: unknown) => { const v = instagramText(text(value)); if (v) for (const part of splitInstagramText(v)) messages.push({t: 'text', v: part}); };
  const photos = async (first: any) => {
    let current = first;
    for (let shown = 0; current && media(text(current.quote_request)); shown++) {
      const code = text(current.quote_request);
      if (shown >= MAX_PHOTOS) break;
      say(text(current.conversation_text) || text(current.quote_text) || '📷');
      messages.push({t: 'image', v: imageUrl(code)});
      try { current = await deps.resolve({operation: 'next'}, {user_message: code, state}); }
      catch { current = undefined; }
    }
  };

  try {
    const routed = await deps.route({operation: 'route', user_message: message, state, quote_state: quoteState, ai_response: text(body?.ai_response)});
    if (!routed || routed.error) throw Error('route failed');
    if (typeof routed.state === 'string') state = routed.state;
    const decision = text(routed.quote_request) || 'NOQUOTE';
    const answer = text(routed.answer);
    if (decision === 'COLETAR') {
      // No card button or data collection here: the team continues the booking.
      say(text(routed.confirmation_text) || answer);
      action = 'HUMANO';
    } else if (decision === 'HUMANO') {
      say(answer);
      action = 'HUMANO';
    } else if (decision.startsWith('ANEXO_')) {
      say(answer);
      action = 'ANEXO';
      footer = 'SEMPRE';
    } else if (decision.startsWith('QUOTE|')) {
      let quoteText = INSTAGRAM_QUOTE_FALLBACK;
      try {
        const priced = await deps.prices({}, {quote_request: decision, state});
        if (text(priced?.conversation_text)) quoteText = text(priced.conversation_text);
        if (typeof priced?.quote_state === 'string') quoteState = priced.quote_state;
      } catch { quoteState = '{}'; }
      say(quoteText);
      footer = 'SEMPRE';
      try {
        const offers = await deps.resolve({operation: 'offers'}, {user_message: quoteText, state});
        if (typeof offers?.state === 'string') state = offers.state;
        if (offers && media(text(offers.quote_request))) await photos(offers);
      } catch { /* The quote itself was already delivered. */ }
    } else {
      const resolved = await deps.resolve({}, {subscriber_id: text(body?.subscriber_id), user_message: message, state});
      if (!resolved || resolved.error) throw Error('resolve failed');
      if (typeof resolved.state === 'string') state = resolved.state;
      const code = text(resolved.quote_request);
      if (code === 'ROOM_DONE') action = 'VAZIO';
      else if (code === 'HUMANO') { say(resolved.conversation_text || resolved.quote_text); action = 'HUMANO'; }
      else if (media(code)) { await photos(resolved); footer = 'SEMPRE'; }
      else if (list(code)) { say(resolved.conversation_text || resolved.quote_text); footer = 'UMA_VEZ'; }
      else {
        const input = lower(message);
        if (!/barco|bike|bici|mesa posta|lua de mel|praia/.test(input) && /foto|imagem/.test(input)) say(INSTAGRAM_PHOTO_QUESTION);
        else { say(answer); footer = /barco|bike|bici|mesa posta|lua de mel|praia/.test(input) ? 'NAO' : 'UMA_VEZ'; }
      }
    }
  } catch {
    messages.length = 0;
    say(INSTAGRAM_FALLBACK);
    action = 'RESPOSTA';
    footer = 'NAO';
  }
  if (action !== 'HUMANO' && !messages.length && action !== 'VAZIO') { say(INSTAGRAM_FALLBACK); footer = 'NAO'; }
  const withFooter = footer === 'SEMPRE' || footer === 'UMA_VEZ' && !buttonShown;
  if (withFooter && action !== 'HUMANO' && messages.length) messages.push({t: 'footer'});
  // Keep the Dynamic block within its message limit, preserving the footer.
  const footerItem = messages.at(-1)?.t === 'footer' ? messages.pop() : undefined;
  const capped = messages.slice(0, INSTAGRAM_MAX_MESSAGES - (footerItem ? 1 : 0));
  if (footerItem) capped.push(footerItem);
  return {
    ig_acao: action !== 'HUMANO' && !capped.length ? 'VAZIO' : action,
    ig_payload: JSON.stringify({v: 1, m: capped}),
    ig_botao_exibido: buttonShown || withFooter && action !== 'HUMANO' ? 'SIM' : 'NAO',
    ...(typeof state === 'string' ? {state} : {}),
    ...(typeof quoteState === 'string' ? {quote_state: quoteState} : {}),
  };
}

/** ManyChat Dynamic block (v2) for Instagram, rendered from ig_payload. */
export function instagramContent(payload: unknown, handoffFlow = '') {
  let items: InstagramMessage[] = [];
  try {
    const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (parsed?.v === 1 && Array.isArray(parsed.m)) items = parsed.m;
  } catch { /* Rendered as the fallback below. */ }
  const messages: any[] = [];
  for (const item of items.slice(0, INSTAGRAM_MAX_MESSAGES)) {
    if (item?.t === 'text' && typeof item.v === 'string' && item.v.trim()) messages.push({type: 'text', text: item.v.slice(0, INSTAGRAM_TEXT_LIMIT)});
    else if (item?.t === 'image' && typeof item.v === 'string' && item.v.startsWith(IMAGE_BASE)) messages.push({type: 'image', url: item.v});
    else if (item?.t === 'footer') messages.push(/^content\d{14}_\d{6}$/.test(handoffFlow)
      ? {type: 'text', text: INSTAGRAM_FOOTER, buttons: [{type: 'flow', caption: 'Falar com a recepção', target: handoffFlow}]}
      : {type: 'text', text: instagramText(INSTAGRAM_FOOTER)});
  }
  return {version: 'v2', content: {type: 'instagram', messages, actions: [], quick_replies: []}};
}
