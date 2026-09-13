// Per-contact conversational state; never use a process-global greeting flag.
// A prepared turn carries the same decision through routing and final media /
// package rendering. Only the next user turn resets it, not an internal HTTP step.
import { assistantDisclosureText, readAssistantDisclosure, stripAssistantDisclosure } from './assistantDisclosure.js';
export type DailyGreeting = { day: string; first: boolean };
export function belemClock(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Belem', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  const hour = Number(part('hour'));
  return { day: `${part('year')}-${part('month')}-${part('day')}`,
    greeting: hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite' };
}
export function readDailyGreeting(value: any): DailyGreeting | undefined {
  if (value && typeof value.day === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value.day)
    && typeof value.first === 'boolean') return { day: value.day, first: value.first };
}
export function parseGreetingState(value: any): any {
  try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return undefined; }
}
export function stripLeadingGreeting(text: string): string {
  // Normalize only a leading salutation, never words inside the actual answer.
  // The exact backend disclosure is decoration too, not the photo question or
  // an assistant turn to persist (its public phone would trigger PII guards).
  return stripAssistantDisclosure(text).trim()
    .replace(/^(?:(?:olá|oi|bom dia|boa tarde|boa noite)(?=[\s!,.—–-]|$)[\t !,.—–-]*(?:[☀🌞🌙😊👋️]+[\t ]*)?)+/iu, '')
    .replace(/^Que bom receber seu contato no Hotel Solar\.\s*☀️?\s*/iu, '').trim();
}
export function dailyGreetingText(text: string, value: any, now = Date.now()): string {
  const daily = readDailyGreeting(value);
  if (!daily || daily.day !== belemClock(now).day || !text.trim()) return text;
  const body = stripLeadingGreeting(text);
  return daily.first ? `${belemClock(now).greeting}!${body ? '\n\n' + body : ''}` : body;
}

// Decorate only public response fields. Routing tokens, facts, event signatures,
// quote values, consent and photo URLs are left byte-for-byte untouched.
export function withDailyGreeting<T extends Record<string, any>>(result: T, sourceState: any, now = Date.now()): T {
  if (result.error) return result;
  const state = parseGreetingState(result.state);
  const source = parseGreetingState(sourceState);
  const daily = readDailyGreeting(state?.daily_greeting ?? source?.daily_greeting);
  const disclosure = readAssistantDisclosure(state?.assistant_disclosure) ?? readAssistantDisclosure(source?.assistant_disclosure);
  if (!daily && !disclosure) return result;
  const output = { ...result };
  const replacements = new Map<string, string>();
  const publicTexts = new Map<string, string>();
  for (const key of ['answer', 'confirmation_text', 'quote_text', 'conversation_text']) {
    if (typeof result[key] !== 'string' || !result[key].trim()) continue;
    const greeted = dailyGreetingText(result[key], daily, now);
    const memory = disclosure ? stripAssistantDisclosure(greeted) : greeted;
    publicTexts.set(key, memory);
    replacements.set(result[key], memory);
  }
  // These fields are alternative ManyChat output paths. If any populated path
  // cannot fit even the compact version, defer on every path and do not consume.
  const rendered = disclosure?.show === true && publicTexts.size > 0 && [...publicTexts.values()].every(text => {
    const output = assistantDisclosureText(text, disclosure);
    return stripAssistantDisclosure(output) !== output;
  });
  for (const [key, text] of publicTexts) {
    (output as Record<string, any>)[key] = assistantDisclosureText(text, disclosure && {...disclosure, show: rendered});
  }
  // Clone only the conversational envelope being changed; never mutate the
  // caller's state object, facts, routing tokens, quote values or media URLs.
  let nextState: any;
  const editableState = () => nextState ||= {...(state || source)};
  const last = state?.turns?.at(-1);
  if (last?.role === 'assistant' && replacements.has(last.text)) {
    editableState().turns = [...state.turns.slice(0, -1), {...last, text: replacements.get(last.text)}];
  }
  if (rendered) editableState().assistant_disclosure = {...disclosure, rendered: true};
  else if (disclosure?.show && publicTexts.size) {
    // A short route response may have been rendered internally before the final
    // resolver produces a larger message. If that final path has no room, its
    // deferral must not be consumed by the intermediate route's marker.
    editableState().assistant_disclosure = {version: 1, show: true};
  }
  if (nextState) (output as Record<string, any>).state = JSON.stringify(nextState);
  return output;
}
