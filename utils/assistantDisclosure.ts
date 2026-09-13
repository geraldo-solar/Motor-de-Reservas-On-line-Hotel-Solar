// `show` is fixed for a prepared user turn. `rendered` is acknowledged only
// after a non-empty public response; internal retries retain the same decision.
export type AssistantDisclosure = { version: 1; show: boolean; rendered?: true };
export const ASSISTANT_DISCLOSURE = 'Sou a assistente virtual do Hotel Solar. ☀️ Se preferir atendimento humano, toque em “Falar com a recepção”, escreva “recepção” ou ligue para (91) 98100-0800.';
export const ASSISTANT_DISCLOSURE_COMPACT = 'Sou a assistente virtual do Hotel Solar. Recepção: botão abaixo ou (91) 98100-0800.';
const PUBLIC_TEXT_LIMIT = 2000;

export function readAssistantDisclosure(value: unknown): AssistantDisclosure | undefined {
  if (!value || typeof value !== 'object') return;
  const marker = value as Record<string, unknown>;
  if (marker.version !== 1 || typeof marker.show !== 'boolean') return;
  return { version: 1, show: marker.show, ...(marker.rendered === true ? {rendered: true as const} : {}) };
}

/** Call only once per new prepare, reading the incoming state rather than the
 * outgoing state. It never mutates state, guesses from greeting/history, or
 * consumes a presentation before a public response exists. */
export function prepareDisclosure(sourceState: unknown): AssistantDisclosure {
  let source: any = sourceState;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch { source = undefined; }
  }
  const previous = readAssistantDisclosure(source?.assistant_disclosure);
  return { version: 1, show: !previous || previous.show && !previous.rendered,
    ...(previous?.rendered ? {rendered: true as const} : {}) };
}

function leadingGreeting(text: string): {prefix: string; body: string} {
  const trimmed = text.trim();
  // An emoji starting the next paragraph belongs to the actual answer.
  const greeting = /^(?:(?:olá|oi|bom dia|boa tarde|boa noite)(?=[\s!,.—–-]|$)[\t !,.—–-]*(?:[☀🌞🌙😊👋️]+[\t ]*)?)+/iu.exec(trimmed)?.[0] || '';
  return {prefix: greeting.trim(), body: trimmed.slice(greeting.length).trim()};
}

function stripCanonicalPrefix(text: string): string {
  let body = text.trim();
  for (let canonical = [ASSISTANT_DISCLOSURE, ASSISTANT_DISCLOSURE_COMPACT].find(value => body.startsWith(value)); canonical;
    canonical = [ASSISTANT_DISCLOSURE, ASSISTANT_DISCLOSURE_COMPACT].find(value => body.startsWith(value))) {
    body = body.slice(canonical.length).trim();
  }
  return body;
}

/** Remove only the exact backend presentation, optionally after a greeting.
 * Leave arbitrary phone numbers, quoted text and the response itself intact. */
export function stripAssistantDisclosure(text: string): string {
  const {prefix, body} = leadingGreeting(text);
  const clean = stripCanonicalPrefix(body);
  return clean === body ? text : [prefix, clean].filter(Boolean).join('\n\n');
}

export function assistantDisclosureText(text: string, value: unknown): string {
  const marker = readAssistantDisclosure(value);
  if (!marker || !text.trim()) return text;
  const clean = stripAssistantDisclosure(text);
  if (!marker.show) return clean;
  const {prefix, body} = leadingGreeting(clean);
  for (const presentation of [ASSISTANT_DISCLOSURE, ASSISTANT_DISCLOSURE_COMPACT]) {
    const output = [prefix, presentation, body].filter(Boolean).join('\n\n');
    if (output.length <= PUBLIC_TEXT_LIMIT) return output;
  }
  // Never cut a price, condition or required notice to fit the presentation.
  // The renderer leaves the marker unconsumed, so a later short turn can show it.
  return clean;
}
