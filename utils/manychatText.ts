// Optional transport for ManyChat response mappings: an empty text custom
// field cannot be mapped reliably. Keep the original API fields unchanged and
// map this nonempty JSON string plus presence flags instead. Only the matching
// UI branch extracts a public text; never map optional text unconditionally.
export const MANYCHAT_TEXT_TRANSPORT = 'manychat-v1';
export const MANYCHAT_TEXT_LIMIT = 2000;
export const MANYCHAT_ENVELOPE_LIMIT = 32768;
export const MANYCHAT_ENVELOPE_TTL_MS = 5 * 60 * 1000;
const keys = ['conversation_text', 'confirmation_text'] as const;
type TextKey = typeof keys[number];
type TextEnvelope = { version: 1; created_at: number; texts: Partial<Record<TextKey, string>> };

function usableText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MANYCHAT_TEXT_LIMIT
    && value.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim().length > 0;
}

export function withManyChatTextEnvelope<T extends Record<string, any>>(result: T, now = Date.now()) {
  const texts: TextEnvelope['texts'] = {};
  // ROOM_DONE is a silent terminator, even if a future caller accidentally
  // carries a previous caption. An API error is never a deliverable message.
  if (!result.error && result.quote_request !== 'ROOM_DONE') {
    for (const key of keys) if (usableText(result[key])) texts[key] = result[key];
  }
  const envelope: TextEnvelope = { version: 1, created_at: now, texts };
  return { ...result,
    manychat_payload: JSON.stringify(envelope),
    has_conversation_text: texts.conversation_text ? 'SIM' : 'NAO',
    has_confirmation_text: texts.confirmation_text ? 'SIM' : 'NAO',
  };
}

// Content extraction only. can_send describes a valid text, NOT permission to
// collect guest data, confirm a booking, charge, hand off or send a message.
// No state is accepted or returned, no authorization is consumed or replayed.
export function extractManyChatText(input: unknown, key: unknown, now = Date.now()): {can_send: 'SIM'; text: string} | {can_send: 'NAO'} {
  const denied = { can_send: 'NAO' as const };
  if (!keys.includes(key as TextKey)) return denied;
  try {
    const serialized = typeof input === 'string' ? input : JSON.stringify(input);
    if (!serialized || serialized.length > MANYCHAT_ENVELOPE_LIMIT) return denied;
    const envelope = JSON.parse(serialized);
    if (!envelope || Array.isArray(envelope) || envelope.version !== 1
      || Object.keys(envelope).some(k => !['version', 'created_at', 'texts'].includes(k))
      || !Number.isFinite(envelope.created_at) || envelope.created_at <= 0
      || envelope.created_at > now || now - envelope.created_at > MANYCHAT_ENVELOPE_TTL_MS
      || !envelope.texts || typeof envelope.texts !== 'object' || Array.isArray(envelope.texts)
      || Object.keys(envelope.texts).some(k => !keys.includes(k as TextKey))) return denied;
    const text = envelope.texts[key as TextKey];
    return usableText(text) ? { can_send: 'SIM', text } : denied;
  } catch { return denied; }
}
