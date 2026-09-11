// Confirmed by the hotel owner on 2026-09-05. These are scheduled starts,
// not proof of performance, availability, admission conditions or an end time.
const TIME_ZONE = 'America/Belem';
const norm = (value: string) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\bhj\b/g, 'hoje').replace(/\s+/g, ' ').trim();
const EVENTS = [
  { artista: 'Heraldo Ramos', local: 'Restaurante Reserva Solar', inicio: '2026-09-05T17:00:00-03:00', data: '2026-09-05', horario: '17:00' },
  { artista: 'Heraldo Ramos', local: 'Restaurante Reserva Solar', inicio: '2026-09-06T12:00:00-03:00', data: '2026-09-06', horario: '12:00' },
] as const;
const MONTHS = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const otherHoliday = (s: string) => /\b(reveillon|natal|ano novo|carnaval|pascoa|tiradentes|corpus christi|finados|sao joao|dia (?:das criancas|das maes|dos pais|dos namorados|do trabalho))\b/.test(s);
const weekendMention = (s: string) => /\b(?:fim|final) de semana\b/.test(s);

function localClock(now: number) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'}).formatToParts(new Date(now));
  const value = (key: string) => parts.find(part => part.type === key)!.value;
  return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}:${value('second')}` };
}
function addDay(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
const dateLabel = (date: string) => date.split('-').reverse().join('/');

/** Organizing a private event is distinct from asking about hotel programming. */
export function isPrivateEventRequest(message: string): boolean {
  const s = norm(message);
  if (/\b(nao quero|nao e|sem)\s+(?:um |uma )?(evento|festa|aniversario)\b/.test(s)) return false;
  const privateSubject = /\b(eventos?|festas?|aniversarios?|casamentos?|corporativ[oa]s?|empresariais|confraternizacoes?|confraternizacao|reunioes|treinamentos?|shows?)\b/.test(s);
  if (privateSubject && /\b(organizar|realizar|contratar|orcamento|cotacao|planejar|alugar|locar)\b/.test(s)) return true;
  if (privateSubject && /\b(fazer|planejar)\b/.test(s) && /\b(festa|aniversario|casamento|evento (?:privado|particular|corporativo|empresarial))\b/.test(s)) return true;
  if (/\b(quero (?:um|uma)|gostaria de (?:um|uma))\b/.test(s) && /\b(festa|casamento|evento (?:privado|particular|corporativo|empresarial))\b/.test(s)) return true;
  if (/\baniversarios?\b/.test(s) && Number(s.match(/\b(\d+)\s*(pessoas|convidados|participantes)\b/)?.[1]) >= 5) return true;
  if (/\b(minha festa|meu evento|meu casamento|nosso evento|nossa festa)\b/.test(s) && /heraldo|musico|musica|show|apresentacao|contratar|organizar|realizar|orcamento/.test(s)) return true;
  return /\b(contratar|contratacao|orcamento para contratar)\b/.test(s) && /\b(heraldo|musico|banda|cantor|show|apresentacao)\b/.test(s);
}

/** Public intent only: never route an explicit private-event request here. */
export function publicEventInquiry(message: string): boolean {
  const s = norm(message);
  if (isPrivateEventRequest(s)) return false;
  // Those questions belong to the dynamic package catalog, not this dated agenda.
  if (!/\bheraldo\b/.test(s) && (otherHoliday(s) || /\bpacotes?\b/.test(s))) return false;
  const temporalContext = /\b(hoje|amanha)\b/.test(s) || weekendMention(s);
  const publicContext = temporalContext || /\b(restaurante|reserva solar|hotel)\b/.test(s);
  const otherAttraction = /\b(passeios?|barco|trilha|bicicletas?)\b/.test(s) && !/\b(heraldo|restaurante|reserva solar)\b/.test(s);
  return /\bheraldo(?:\s+ramos)?\b|\bmusica\s+ao\s+vivo\b|\bshows?\b|\bapresentacao\s+(?:musical|do musico|do cantor)\b/.test(s)
    || !otherAttraction && /\bprogramacao\b/.test(s) && (publicContext || /\bmusical\b/.test(s))
    || /\beventos?\b/.test(s) && temporalContext
    || !otherAttraction && publicContext && (/\bquem\s+(?:toca|canta|vai tocar|vai cantar|esta tocando)\b/.test(s) || /\bmusica\b/.test(s) || /\b(atracao|atracoes)\b/.test(s));
}

/** Only use after a recent public-event turn; these words alone are not intent. */
export function publicEventFollowup(message: string): boolean {
  const s = norm(message).replace(/[!?.,;:]+$/g, '').trim();
  if (isPrivateEventRequest(s) || /\b(quartos?|aptos?|apartamentos?|suites?|loft|hospedagem|diarias?|check.?in|check.?out|barco|bicicleta|cardapio)\b/.test(s)) return false;
  if (/^(?:e\s+)?(?:hoje|amanha|depois de amanha|no dia 0?[56]|dia 0?[56]|0?[56]\/0?9(?:\/2026)?)(?:\s+(?:tambem|tem|vai ter|a que horas))?$/.test(s)) return true;
  if (/^(?:e\s+)?(?:(?:neste|nesse|este|esse|no|o)\s+)?(?:proximo\s+)?(?:fim|final) de semana(?:\s+(?:agora|tambem|tem|vai ter))?$/.test(s)) return true;
  return /^(?:e )?quem (?:toca|canta|vai tocar|vai cantar)(?: (?:hoje|amanha))?$/.test(s)
    || /^(?:(?:e|mas|entao)\s+)?(?:(?:qual|quais|o|os|a|as|tem|qual e|quais sao)\s+)?(?:o |a |os |as )?(?:horarios?|repertorio|apresentacao|programacao|couvert|valor(?: do couvert)?|preco(?: do couvert)?|entrada|ingresso)(?:\s+(?:de hoje|de amanha|da apresentacao|do show))?$/.test(s)
    || /^(?:(?:e|mas)\s+)?(?:quanto(?: custa| e| fica)?(?:\s+(?:a entrada|o ingresso|o couvert|o show))?|ate que horas(?: vai| fica| dura| vai durar)?|que horas(?: comeca| termina| vai ser)?|a que horas|qual (?:e )?o horario|quanto tempo dura|qual a duracao|e gratuito|e gratis|precisa (?:pagar|reservar)(?: mesa)?|(?:posso|como) reservar(?: uma)? mesa|ainda (?:esta|ta) acontecendo|ja comecou|ja terminou)$/.test(s);
}

export function publicEventContext(now = Date.now()) {
  const clock = localClock(now);
  return {
    fonte: 'Programação confirmada pelo responsável do Hotel Solar em 05/09/2026; não é informação de disponibilidade em tempo real.',
    fuso_horario: TIME_ZONE,
    data_atual: clock.date,
    hora_atual: clock.time,
    programacao: EVENTS.map(event => ({...event, situacao_temporal: event.data < clock.date ? 'data_passada' : now >= Date.parse(event.inicio) ? 'horario_inicial_atingido_sem_confirmacao_em_tempo_real' : 'programado_para_o_futuro'})),
    limites: {
      ingresso_preco_couvert: 'Não informado. Não assumir gratuidade, R$40, consumo mínimo ou valores do Day Use.',
      termino_duracao_repertorio: 'Não informado.',
      reserva_de_mesa_e_acesso: 'Necessidade de reserva, disponibilidade de mesas e condições de acesso não confirmadas.',
      fotos: 'Não afirmar envio ou existência de foto neste contexto.',
      temporal: 'Os horários são inícios programados. Não afirmar que a apresentação começou, continua ocorrendo ou terminou. Não divulgar datas passadas como futuras.',
      encaminhamento: 'Programação pública não é pedido para organizar evento privado com a Luiza. Não coletar dados nem converter as datas em hospedagem.',
    },
  };
}

function requestedDates(message: string, today: string): string[] {
  const s = norm(message);
  const requested: string[] = [];
  if (/\bhoje\b/.test(s)) requested.push(today);
  if (/\bdepois de amanha\b/.test(s)) requested.push(addDay(today, 2));
  if (/\bamanha\b/.test(s.replace(/depois de amanha/g, ''))) requested.push(addDay(today, 1));
  for (const match of s.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) requested.push(`${match[1]}-${match[2]}-${match[3]}`);
  for (const match of s.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/g)) requested.push(`${match[3] || today.slice(0, 4)}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`);
  for (const match of s.matchAll(new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?(${MONTHS.join('|')})(?:\\s+(?:de\\s+)?(20\\d{2}))?\\b`, 'g'))) requested.push(`${match[3] || today.slice(0, 4)}-${String(MONTHS.indexOf(match[2]) + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`);
  if (!requested.length && weekendMention(s)) {
    // Saturday/Sunday in the hotel's local calendar, never the old agenda's
    // dates. On Sunday "this weekend" still means yesterday and today;
    // "next weekend" during a weekend means the following Saturday/Sunday.
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    let offset = weekday === 0 ? -1 : 6 - weekday;
    if (weekday === 0 || weekday === 6) {
      if (/\bproximo\s+(?:fim|final) de semana\b/.test(s)) offset += 7;
    }
    const saturday = addDay(today, offset);
    requested.push(saturday, addDay(saturday, 1));
  }
  // "Dia 5/6" is contextual shorthand for these two specifically announced dates.
  if (!requested.length) for (const match of s.matchAll(/\bdia\s+0?([56])\b/g)) requested.push(`2026-09-0${match[1]}`);
  return [...new Set(requested)];
}

/** Deterministic factual answer. Call only for detected or contextual public intent. */
export function publicEventAnswer(message: string, now = Date.now()): string {
  const s = norm(message);
  // A holiday or broad named period is not an implied September date.
  if (otherHoliday(s) || new RegExp(`\\b(${MONTHS.filter(month => month !== 'setembro').join('|')})\\b`).test(s) && !/\b\d{1,2}\s+(?:de\s+)?(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|outubro|novembro|dezembro)\b/.test(s)) {
    return 'Não tenho uma apresentação de Heraldo Ramos confirmada para esse período. A equipe pode confirmar por aqui se há novidades para o período que você deseja.';
  }
  const today = localClock(now).date;
  const tomorrow = addDay(today, 1);
  const requested = requestedDates(s, today);
  const events = EVENTS.filter(event => requested.length ? requested.includes(event.data)
    && (!weekendMention(s) || event.data >= today) : event.data >= today);
  const missing = requested.filter(date => !EVENTS.some(event => event.data === date));
  const blocks: string[] = [];
  if (!events.length && weekendMention(s)) {
    blocks.push(`Ainda não tenho programação confirmada para este fim de semana (${requested.map(dateLabel).join(' e ')}). A equipe pode confirmar por aqui se há novidades.`);
  } else if (!events.length && !requested.length) {
    blocks.push('Ainda não tenho programação atual ou futura confirmada na agenda disponível. Para qual data você gostaria de consultar?');
  }
  if (events.length) {
    blocks.push('A programação informada para Heraldo Ramos no restaurante Reserva Solar é:');
    blocks.push(events.map(event => `${event.data === today ? 'Hoje, ' : event.data === tomorrow ? 'Amanhã, ' : ''}${dateLabel(event.data)}, às ${event.horario === '17:00' ? '17h' : '12h'}.`).join('\n'));
    if (events.some(event => now >= Date.parse(event.inicio))) blocks.push('Esses são os horários de início programados. Para os horários já passados, não tenho confirmação em tempo real de realização, término ou de que a apresentação ainda esteja acontecendo.');
  }
  if (missing.length && !(weekendMention(s) && !events.length)) blocks.push(`Não tenho apresentação confirmada para ${missing.slice(0, 3).map(dateLabel).join(' ou ')}${missing.length > 3 ? ' e as demais datas solicitadas' : ''} na programação disponível.`);
  if (/\b(ate que horas|termina|termino|duracao|dura|quanto tempo)\b/.test(s)) blocks.push('O horário de término e a duração não foram informados. A equipe pode confirmar por aqui.');
  else if (/\b(repertorio|estilo musical|que musicas|quais musicas)\b/.test(s)) blocks.push('O repertório não foi informado. Posso solicitar essa informação à equipe por aqui.');
  else if (/\b(fotos?|imagem|imagens|cartaz|arte)\b/.test(s)) blocks.push('Não tenho confirmação de uma imagem disponível neste atendimento. Posso pedir apoio à equipe por aqui.');
  else if (/\b(couvert|custa|custo|preco|valor|ingresso|entrada|gratis|gratuit[oa]|pagar|pago|paga|quanto)\b/.test(s)) blocks.push('O valor de entrada, eventual couvert e outras condições de cobrança dessa apresentação não foram informados. A equipe pode confirmar por aqui.');
  else if (/\b(reservar|reserva de mesa|mesas?|visitantes?|nao hospede|publico externo|criancas?)\b/.test(s)) blocks.push('A necessidade de reserva, a disponibilidade de mesas e as condições de acesso dessa apresentação precisam ser confirmadas com a equipe por aqui.');
  return blocks.join('\n\n');
}
