// Per-contact conversational state; never use a process-global greeting flag.
// A prepared turn carries the same decision through routing and final media /
// package rendering. Only the next user turn resets it, not an internal HTTP step.
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
  return text.trim()
    .replace(/^(?:(?:olá|oi|bom dia|boa tarde|boa noite)(?=[\s!,.—–-]|$)[\s!,.—–-]*(?:[☀🌞🌙😊👋️]+\s*)?)+/iu, '')
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
  const daily = readDailyGreeting(state?.daily_greeting ?? parseGreetingState(sourceState)?.daily_greeting);
  if (!daily) return result;
  const output = { ...result };
  const replacements = new Map<string, string>();
  for (const key of ['answer', 'confirmation_text', 'quote_text', 'conversation_text']) {
    if (typeof result[key] !== 'string' || !result[key].trim()) continue;
    const text = dailyGreetingText(result[key], daily, now);
    (output as Record<string, any>)[key] = text;
    replacements.set(result[key], text);
  }
  const last = state?.turns?.at(-1);
  if (last?.role === 'assistant' && replacements.has(last.text)) {
    last.text = replacements.get(last.text);
    (output as Record<string, any>).state = JSON.stringify(state);
  }
  return output;
}
