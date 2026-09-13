const normalize = (value: string) => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Do not include "não consigo": inability to reach the team is a request
// for help, not a refusal. The allowed bridge cannot consume a later
// affirmative "quero", punctuation, a complaint or a different service object.
const refusedStart = '(?:n[aã]o\\s+(?:quero|queremos|preciso|precisamos|precisa|desejo|desejamos|gostaria|vamos|vou|posso|podemos)|prefiro\\s+n[aã]o|preferimos\\s+n[aã]o|n[aã]o\\s+(?:(?:me|nos)\\s+)?(?:chame|chama|chamem|encaminhe|encaminhem|transfira|transfiram|passe|passa|passem)|n[aã]o\\s+[eé]\\s+(?:preciso|necess[aá]rio)|dispenso|dispensamos|sem\\s+precisar)';
const bridge = '(?:mais|agora|ainda|nem|enquanto|de|do|da|com|por|para|ao|a|o|um|uma|me|nos|que|voc[eê]s?|falar|conversar|chamar|chame|chamem|encaminhe|encaminhem|transfira|transfiram|passe|passem|fale|falem|ser|seja|atendido|atendida|atendidos|atendidas|encaminhado|encaminhada|transferido|transferida|encaminhar|transferir|ajuda|contato|nenhum|nenhuma)';
const refusedTarget = '(?:atendimento\\s+humano|atendentes?|recep[cç][aã]o|humanos?|funcion[aá]ri[oa]s?|equipe|pessoa|algu[eé]m)';

/** Remove only a negated human-contact phrase, retaining other requests and
 * punctuation verbatim. This is for intent guards, not stored user history. */
export function stripNegatedHumanRequests(message: string): string {
  const refusedPhrase = `\\b${refusedStart}(?:\\s+${bridge}){0,12}\\s+${refusedTarget}\\b`;
  const coordinatedRefusal = `(?:\\s+(?:e\\s+)?nem(?:\\s+${bridge}){0,6}\\s+${refusedTarget}\\b)*`;
  return String(message || '').replace(new RegExp(refusedPhrase + coordinatedRefusal, 'gi'), ' ');
}

/** Explicit human contact only. Operational requests, disputes, reservation
 * changes and cancellation keep their independent detectors and priority. */
export function explicitHumanRequest(message: string): boolean {
  const s = normalize(stripNegatedHumanRequests(message));
  if (!s) return false;
  if (/\b(?:nao quero informar|prefiro nao informar)\b/.test(s)) return true;
  const target = '(?:atendimento humano|atendentes?|recepcao|humanos?|funcionari[oa]s?|equipe)';
  if (new RegExp(`^(?:por favor[, ]+)?(?:o |a |um |uma )?${target}(?:[, ]+(?:por favor|pfv))?[.!?]*$`).test(s)) return true;
  if (new RegExp(`\\b(?:falar|conversar|contato) (?:diretamente )?com (?:o |a |um |uma )?(?:${target}|pessoa|alguem)\\b`).test(s)) return true;
  const request = '(?:quero|queremos|preciso|precisamos|gostaria|gostariamos|prefiro|solicito|solicitamos|chame|chama|chamem|chamar|encaminhe|encaminhem|encaminhar|transfira|transfiram|transferir|passe|passa|passar)';
  const via = '(?:de|do|da|com|por|para|ao|a|o|um|uma|me|nos|mais|agora|ajuda|falar|conversar|chamar|ser|atendido|atendida|atendidos|atendidas|diretamente|contato|atendimento)';
  return new RegExp(`\\b${request}(?:\\s+${via}){0,12}\\s+${target}\\b`).test(s);
}
