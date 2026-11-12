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

// People of the hotel a customer may ask for by name or role. "Luiza" is
// left out on purpose: new event quotes already point to her contact.
const namedStaff = '(?:geraldo|dono|proprietari[oa]|gerente|gerencia|diretor|diretora|kaline)';
const treatment = '(?:(?:sr|sra|senhor|senhora|seu|dona|dr|dra)\\.?\\s+)?';

/** The customer mentions someone of the team without asking to be put through
 * now ("depois converso com o Geraldo"). Context for the answer, not a handoff. */
export function namedStaffMention(message: string): boolean {
  return new RegExp(`\\b${namedStaff}\\b`).test(normalize(message));
}

/** "Quero falar com o Geraldo", "chama o gerente", "o Geraldo está aí?"
 * (audit 12/11/2026: a customer who mentioned the owner got generic answers).
 * A later or already held conversation is not a request to be put through now. */
export function namedStaffRequest(message: string): boolean {
  const s = normalize(message);
  if (!s || !new RegExp(`\\b${namedStaff}\\b`).test(s)) return false;
  if (/\b(?:depois|mais tarde|outra hora|outro dia|outro momento|amanha|qualquer hora|quando (?:der|puder|ele puder|ela puder)|ja falei|falei|conversei|tratei|combinei|acertei|fechei|disse|falou|informou|passou|mandou|enviou|indicou|indicacao|autorizou|prometeu)\b/.test(s)) return false;
  if (/\bnao\s+(?:quero|queremos|preciso|precisamos|precisa|gostaria|vou|vamos|e (?:preciso|necessario))\b/.test(s)) return false;
  const ask = '(?:quero|queria|queremos|preciso|precisava|precisamos|gostaria|gostariamos|posso|podemos|poderia|pode|consigo|tem como|teria como|da para|da pra|como faco para|como faco pra|como eu faco para|como eu faco pra|deixa eu|me deixa|necessito)';
  const who = `(?:o\\s+|a\\s+)?${treatment}${namedStaff}\\b`;
  return new RegExp(`\\b${ask}(?:\\s+[a-z]+){0,3}?\\s+(?:falar|conversar|tratar|negociar|contato)(?:\\s+[a-z]+){0,2}?\\s+com\\s+${who}`).test(s)
    || new RegExp(`\\b(?:chama|chame|chamem|chamar|passa|passe|passem)(?:\\s+(?:ai|pra mim|para mim|por favor|pfv))?\\s+(?:o|a|pro|pra|para o|para a)\\s+${treatment}${namedStaff}\\b`).test(s)
    || new RegExp(`^(?:oi|ola|bom dia|boa tarde|boa noite)?[,!. ]*(?:o\\s+|a\\s+)?${treatment}${namedStaff}\\s+(?:esta|ta|se encontra)(?:\\s+(?:ai|por ai|disponivel|no hotel|online))?\\s*\\??$`).test(s)
    || new RegExp(`\\b(?:numero|contato|telefone|whatsapp|zap)\\s+d[oa]\\s+${treatment}${namedStaff}\\b`).test(s);
}
export const namedStaffAnswer = 'Vou chamar a nossa equipe e avisar do seu pedido. Ela continua seu atendimento por aqui.';

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
  return new RegExp(`\\b${request}(?:\\s+${via}){0,12}\\s+${target}\\b`).test(s) || namedStaffRequest(s);
}
