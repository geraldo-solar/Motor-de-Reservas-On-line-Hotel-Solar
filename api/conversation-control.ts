import type { VercelRequest, VercelResponse } from '@vercel/node';

// No bookings, stock queries, outbound messages, personal-data storage or LLM calls.
// State is a bounded user-only record held in the contact's ManyChat custom field.
type Facts = { check_in?: string; check_out?: string; guests?: number; extras: string[]; children_pending?: boolean };
type Quote = { version: number; id: string; created_at: number; check_in: string; check_out: string; guests: number; extras: string[]; options: { name: string; capacity: number; total: number }[] };
type State = { version: 2; history: string[]; facts: Facts; greeted: boolean; first_turn?: boolean; changed?: boolean; pending?: { quote_id: string; option: string }; };
const norm = (s: unknown) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s?/,.-]/g, ' ').replace(/\s+/g, ' ').trim();
const json = (v: unknown): any => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };
const months = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const numbers: Record<string, number> = { uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
const count = (s: string) => numbers[s] || Number(s);
const numberPattern = '(\\d{1,2}|uma|um|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez)';
const lodging = (s: string) => /\b(vaga|vagas|disponibilidade|hospedagem|estadia|diaria|diarias|reservar|reserva|quarto|quartos|apto|apartamento|loft|suite|cotacao|orcamento|pessoas|hospedes|casal|adultos)\b/.test(s);
const recommendation = (s: string) => /\b(indica|indicam|indicado|recomenda|recomendam|melhor|sugere|sugestao)\b/.test(s);
const question = (s: string) => s.includes('?') || /\b(qual|quais|quanto|quantos|como|onde|quando|indica|recomenda|poderia|pode me|gostaria de saber|tem vaga|tem disponibilidade|inclui|incluido)\b/.test(s);
const human = (s: string) => /\b(atendente|falar com (uma pessoa|alguem|a recepcao|um humano)|(?:chama|chame|chamar|encaminhar)(?:r?\s+(?:para|a|o))?\s+(?:recepcao|atendente)|atendimento humano|reclamacao|quero reclamar|cancelar minha reserva|reembolso|nao quero informar|prefiro nao informar)\b/.test(s) || s === 'recepcao';
const greeting = (s: string) => /^(oi|ola|bom dia|boa tarde|boa noite|tudo bem)([ ,.!?]*(tudo bem|bom dia|boa tarde|boa noite))?[ ,.!?]*$/.test(s);
const personal = (s: string) => /@|\b(?:\d[.\s-]*){11,}\b|\b(cpf|meu nome|me chamo)\b/i.test(s);

function loadState(value: unknown): State {
  const parsed = json(value);
  if (parsed?.version !== 2 || !Array.isArray(parsed.history) || !parsed.facts) {
    return { version: 2, history: [], facts: { extras: [] }, greeted: false };
  }
  const f = parsed.facts;
  const facts: Facts = { extras: Array.isArray(f.extras) ? f.extras.filter((x: unknown) => ['BARCO', 'MESA', 'LUA'].includes(String(x))) : [] };
  if (typeof f.check_in === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(f.check_in)) facts.check_in = f.check_in;
  if (typeof f.check_out === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(f.check_out)) facts.check_out = f.check_out;
  if (Number.isInteger(f.guests) && f.guests > 0 && f.guests <= 60) facts.guests = f.guests;
  if (typeof f.children_pending === 'boolean') facts.children_pending = f.children_pending;
  return { version: 2, history: parsed.history.filter((s: unknown) => typeof s === 'string' && !personal(s as string)).slice(-12).map((s: string) => s.slice(0, 500)), facts, greeted: parsed.greeted === true, first_turn: parsed.first_turn === true, changed: parsed.changed === true, ...(typeof parsed.pending?.quote_id === 'string' && typeof parsed.pending?.option === 'string' ? { pending: parsed.pending } : {}) };
}

function iso(day: number, month: number, year: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : undefined;
}

function parseDates(s: string, now: number): string[] {
  const today = new Date(now - 3 * 3600000).toISOString().slice(0, 10);
  const currentYear = Number(today.slice(0, 4));
  const full = [...s.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)].map(m => iso(+m[3], +m[2], +m[1]));
  if (full.length) return full.filter(Boolean) as string[];
  const numeric = [...s.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/g)].map(m => {
    let result = iso(+m[1], +m[2], Number(m[3] || currentYear));
    if (!m[3] && result && result < today) result = iso(+m[1], +m[2], currentYear + 1);
    return result;
  });
  if (numeric.length) return numeric.filter(Boolean) as string[];
  const range = s.match(new RegExp(`\\b(\\d{1,2})(?:\\s+de)?\\s*(?:a|ate|ao|-)\\s*(\\d{1,2})\\s*(?:de\\s+)?(${months.join('|')})(?:\\s+(?:de\\s+)?(20\\d{2}))?\\b`));
  if (range) {
    const month = months.indexOf(range[3]) + 1;
    let year = Number(range[4] || currentYear);
    if (!range[4] && (iso(+range[1], month, year) || '') < today) year++;
    return [iso(+range[1], month, year), iso(+range[2], month, year)].filter(Boolean) as string[];
  }
  const written = [...s.matchAll(new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?(${months.join('|')})(?:\\s+(?:de\\s+)?(20\\d{2}))?\\b`, 'g'))].map(m => {
    const month = months.indexOf(m[2]) + 1;
    let year = Number(m[3] || currentYear);
    if (!m[3] && (iso(+m[1], month, year) || '') < today) year++;
    return iso(+m[1], month, year);
  });
  if (written.length) return written.filter(Boolean) as string[];
  if (/\b(esse|este|proximo|neste|nesse)?\s*(final de semana|fim de semana)\b/.test(s)) {
    const friday = new Date(`${today}T12:00:00Z`);
    let days = (5 - friday.getUTCDay() + 7) % 7;
    if (/proximo/.test(s) && days === 0) days = 7;
    friday.setUTCDate(friday.getUTCDate() + days);
    const sunday = new Date(friday); sunday.setUTCDate(sunday.getUTCDate() + 2);
    return [friday.toISOString().slice(0, 10), sunday.toISOString().slice(0, 10)];
  }
  return [];
}

function updateFacts(state: State, message: string, now: number) {
  const before = JSON.stringify(state.facts);
  const s = norm(message);
  const total = s.match(new RegExp(`${numberPattern}\\s*(pessoas|hospedes)\\b`));
  const adults = s.match(new RegExp(`${numberPattern}\\s*adult[oa]s?\\b`));
  const children = s.match(new RegExp(`${numberPattern}\\s*criancas?\\b`));
  const group = s.match(new RegExp(`\\b(?:somos|seremos|vamos em|agora somos)\\s+${numberPattern}\\b`));
  if (total) state.facts.guests = count(total[1]);
  else if (adults) state.facts.guests = count(adults[1]) + (children ? count(children[1]) : 0);
  else if (group) state.facts.guests = count(group[1]);
  else if (/\b(somos|para|vai|um) casal\b/.test(s)) state.facts.guests = 2;
  else if (!state.facts.guests && new RegExp(`^${numberPattern}[.!]?$`).test(s)) state.facts.guests = count(s.replace(/[.!]/g, ''));
  if (/crianca|bebe/.test(s) && !/sem crianca/.test(s)) state.facts.children_pending = !/\d+\s*(anos?|meses?)\b/.test(s);
  if (state.facts.children_pending && /\d+\s*(anos?|meses?)\b/.test(s)) state.facts.children_pending = false;
  if (/sem crianca|so adultos|apenas adultos/.test(s)) state.facts.children_pending = false;
  const dates = parseDates(s, now);
  if (dates.length >= 2) { state.facts.check_in = dates[0]; state.facts.check_out = dates[1]; }
  else if (dates.length === 1) {
    if (/saida|check.?out|ate|saio/.test(s)) state.facts.check_out = dates[0];
    else if (/entrada|check.?in|chego/.test(s)) state.facts.check_in = dates[0];
    else if (state.facts.check_in && !state.facts.check_out) state.facts.check_out = dates[0];
    else if (!state.facts.check_in) state.facts.check_in = dates[0];
  }
  for (const [term, code] of [['barco', 'BARCO'], ['mesa', 'MESA'], ['lua de mel', 'LUA']]) {
    if (!s.includes(term)) continue;
    if (/retir|remov|sem |nao quero|exclu/.test(s)) state.facts.extras = state.facts.extras.filter(x => x !== code);
    else if (!question(s) && /quero|inclu|adicion|coloca|acrescenta/.test(s) && !state.facts.extras.includes(code)) state.facts.extras.push(code);
  }
  state.changed = before !== JSON.stringify(state.facts);
  if (state.changed) delete state.pending;
}

function validQuote(value: unknown, state: State, now: number): Quote | null {
  const q = json(value);
  const f = state.facts;
  if (q?.version !== 1 || typeof q.id !== 'string' || !Number.isFinite(q.created_at) || now - q.created_at < 0 || now - q.created_at > 30 * 60000 || !Array.isArray(q.options) || !q.options.length || !Array.isArray(q.extras)) return null;
  if (q.check_in !== f.check_in || q.check_out !== f.check_out || q.guests !== f.guests || f.children_pending || JSON.stringify([...q.extras || []].sort()) !== JSON.stringify([...f.extras].sort())) return null;
  if (!q.options.every((o: any) => o && typeof o.name === 'string' && Number.isFinite(o.capacity) && o.capacity >= q.guests && Number.isFinite(o.total) && o.total > 0)) return null;
  return q;
}

function selection(s: string, quote: Quote): Quote['options'][number] | undefined {
  const matches = quote.options.filter(option => {
    const name = norm(option.name);
    if (s.includes(name)) return true;
    const unique = name.replace(/\bsuite\b/g, '').trim();
    return unique.length > 3 && s.includes(unique);
  });
  if (matches.length === 1) return matches[0];
  if (/\b(primeira opcao|opcao 1|recomendacao premium)\b/.test(s)) return quote.options[0];
  return undefined;
}

const dateLabel = (s: string) => s.split('-').reverse().join('/');
const amount = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function confirmation(q: Quote, name: string) {
  const option = q.options.find(o => o.name === name)!;
  return `Confira sua escolha:\n\n${option.name}\n${dateLabel(q.check_in)} a ${dateLabel(q.check_out)} · ${q.guests} hóspedes\nTotal da simulação: ${amount(option.total)}${q.extras.length ? ' (com os extras escolhidos)' : ''}.\n\nAinda não confirma disponibilidade nem reserva. Para solicitar que a recepção verifique as vagas e continue por aqui, toque em “Confirmar opção”. Só então pediremos nome completo, e-mail e CPF.`;
}

export function control(body: any, now = Date.now()) {
  const state = loadState(body.state);
  const raw = String(body.user_message || '').slice(0, 2000);
  const s = norm(raw);
  let decision = 'NOQUOTE';
  let answer = String(body.ai_response || '').slice(0, 1800);
  let ready = 'NAO';
  let confirmationText = '';
  if (body.operation === 'prepare') {
    state.first_turn = !state.greeted;
    state.greeted = true;
    delete state.pending; // Any new typed message invalidates an older confirmation card.
    updateFacts(state, raw, now);
    if (raw && !personal(raw)) state.history = [...state.history, raw.slice(0, 500)].slice(-12);
    const currentQuote = validQuote(body.quote_state, state, now);
    const context = JSON.stringify({ primeira_resposta: state.first_turn, fatos_informados_pelo_cliente: state.facts, mensagens_do_cliente: state.history, ultima_mensagem: personal(raw) ? '[Dado pessoal omitido; não repetir nem guardar]' : raw, cotacao_valida_para_estes_dados: currentQuote, data_atual: new Date(now - 3 * 3600000).toISOString().slice(0, 10), regra: 'Datas e ocupação só valem se estão nos fatos do cliente. Oferta de pacote não é escolha do cliente. Nunca pedir dados pessoais: isso pertence à confirmação por botão. Nunca afirmar encaminhamento sem ação real.' });
    return { state: JSON.stringify(state), context, can_collect: 'NAO', quote_request: 'NOQUOTE' };
  }
  const quote = validQuote(body.quote_state, state, now);
  if (body.operation === 'confirm') {
    if (quote && state.pending?.quote_id === quote.id && quote.options.some(o => o.name === state.pending?.option)) {
      ready = 'SIM';
      confirmationText = confirmation(quote, state.pending.option);
      delete state.pending; // A confirmation is consumed once, not reusable.
    } else answer = 'Essa escolha precisa ser conferida novamente. Me diga as datas e a acomodação desejada para atualizarmos a simulação antes de pedir seus dados.';
    return { state: JSON.stringify(state), can_collect: ready, confirmation_text: confirmationText, answer };
  }
  if (body.operation !== 'route') return { error: 'Invalid operation' };
  const proposed = String(body.proposed || '').trim();
  if (human(s)) decision = 'HUMANO';
  else if (greeting(s)) answer = state.first_turn ? 'Olá! Que bom receber seu contato no Hotel Solar. ☀️ Como posso ajudar?' : 'Estou por aqui! Como posso ajudar?';
  else {
    const selected = quote ? selection(s, quote) : undefined;
    const selecting = /\b(quero|prefiro|escolho|escolhi|aceito|pode ser|fico com|vou ficar|vou querer)\b/.test(s);
    if (quote && selected && selecting && !question(s) && !/\b(nao|talvez|pensar|depois|ainda)\b/.test(s)) {
      state.pending = { quote_id: quote.id, option: selected.name };
      confirmationText = confirmation(quote, selected.name);
      decision = 'COLETAR'; // Routes only to the confirmation card, NEVER directly to data collection.
    } else if (quote && state.pending?.quote_id === quote.id && /^(sim|confirmo|pode prosseguir|quero prosseguir)[.!]?$/.test(s)) {
      confirmationText = confirmation(quote, state.pending.option);
      decision = 'COLETAR';
    } else if (recommendation(s) && state.facts.guests && state.facts.guests <= 4) {
      const premium = quote?.options[0];
      answer = premium
        ? `Minha primeira indicação é ${premium.name}, por ${amount(premium.total)} no período informado${quote!.extras.length ? ', com os extras escolhidos' : ''}. Se preferir uma opção mais econômica, também podemos comparar as demais acomodações da simulação. Qual combina melhor com sua viagem?`
        : 'Minha primeira indicação é o Loft: tem cama King, sala integrada e sacada com vista para o mar, para quem busca mais espaço e conforto. Se preferirem algo mais econômico, podemos comparar com outra suíte. Quais são as datas de entrada e saída?';
    } else if (lodging(s) || /^QUOTE\|/.test(proposed) || state.changed) {
      const f = state.facts;
      if (!f.guests) answer = 'Para quantas pessoas será a estadia?';
      else if (f.children_pending) answer = 'Quais são as idades das crianças? Assim consigo considerar a ocupação corretamente.';
      else if (!f.check_in || !f.check_out) answer = 'Quais são as datas de entrada e saída? Pode informar no formato dia/mês.';
      else if (f.check_out <= f.check_in || (Date.parse(`${f.check_out}T12:00:00Z`) - Date.parse(`${f.check_in}T12:00:00Z`)) / 86400000 > 30) answer = 'Preciso conferir as datas: a saída deve ser depois da entrada, e esta simulação aceita até 30 diárias. Quais datas deseja?';
      else if (!quote || state.changed || /^QUOTE\|/.test(proposed)) decision = `QUOTE|${f.check_in}|${f.check_out}|${f.guests}|${f.extras.join(',') || 'NONE'}`;
      else if (selecting || /reservar|prosseguir|aceito|confirmo/.test(s)) answer = 'Qual acomodação da simulação você prefere? Depois mostro um resumo para você confirmar a escolha antes de informar seus dados.';
    }
  }
  if (question(s)) delete state.pending;
  if (decision !== 'COLETAR') confirmationText = '';
  if (state.first_turn && decision === 'NOQUOTE' && answer && !/^(olá|oi|bom dia|boa tarde|boa noite)/i.test(answer)) answer = 'Olá! Que bom receber seu contato no Hotel Solar. ☀️\n\n' + answer;
  return { state: JSON.stringify(state), quote_request: decision, can_collect: 'NAO', confirmation_text: confirmationText, answer };
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const result = control(req.body || {});
  return res.status('error' in result ? 400 : 200).json(result);
}
