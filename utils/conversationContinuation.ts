const norm=(message:string)=>String(message||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();

/** An explicit postponement of the conversation is not booking consent or
 * permission to schedule a callback. Keep stay facts; callers clear consent. */
export function bookingDeferral(message:string):boolean {
  const s=norm(message).replace(/^(?:(?:ta|ok|certo|entao|combinado|tudo bem)[,!. ]+)*/,'').replace(/[.!]+$/,'');
  if(!s||s.length>180||s.includes('?')||/\b(?:nao|talvez|se|caso|quando|check[ -]?in|check[ -]?out|entrada|saida|chegar|chegada|almocar|passeio)\b/.test(s))return false;
  const later='(?:depois do almoco|mais tarde|depois|amanha|a tarde|a noite)';
  const subject='(?:(?:eu|nos|a gente) )?';
  const action='(?:faz(?:emos)? isso|faco isso|faz isso|continu(?:o|amos|a)(?: (?:isso|por aqui|a conversa|o atendimento))?|retom(?:o|amos|a)(?: (?:isso|a conversa|o atendimento))?|finaliz(?:o|amos|a)(?: (?:isso|a reserva))?|fech(?:o|amos|a)(?: (?:isso|a reserva))?|volt(?:o|amos|a) a falar(?: com voces)?)';
  return new RegExp(`^(?:${later}[, ]+${subject}${action}|${subject}${action} ${later})$`).test(s);
}

export const bookingDeferralAnswer='Combinado! Quando puder, continuamos por aqui com a recepção para finalizar sua solicitação.';
