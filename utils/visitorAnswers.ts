// Fixed answers for conversations that are not a lodging quote (audit
// 17/11/2026): Ostrabeach visitors and job applications got "Para quantas
// pessoas será a estadia?" or the events team.

const norm = (value: string) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

// Ostrabeach 2026 (catálogo: festival nos dias 20 e 21/11). What the team told
// visitors on 14-16/11: open to the public, guests do not pay, a one-day
// access ticket bought on the day, meals apart, tables by order of arrival.
// Ticket for visitors: R$ 60 per person (Geraldo, 17/11/2026; the team had
// also answered R$ 50 and R$ 40).
const OSTRABEACH_LAST_DAY = '2026-11-22';
export const ostrabeachVisitorAnswer = 'O Ostrabeach é aberto ao público e acontece no Reserva Solar, nosso restaurante pé na areia, nos dias 20 e 21/11, com música ao vivo. Quem não está hospedado paga só o ingresso de acesso, de R$ 60 por pessoa, comprado no dia, na entrada; hóspede não paga. As refeições e bebidas são à parte, e as mesas são por ordem de chegada (não fazemos reserva de mesa). O ingresso vale para um dia. A programação e o cardápio do festival saem nas redes sociais do hotel durante a semana.';

export function ostrabeachVisitorQuestion(message: string, focusName = '', now = Date.now()): boolean {
  if (new Date(now - 3 * 3600000).toISOString().slice(0, 10) > OSTRABEACH_LAST_DAY) return false;
  const s = norm(message);
  if (!s || s.length > 400) return false;
  const festival = /\b(?:ostrabeach|ostra ?beach|festival|ostras?)\b/.test(s) || /ostrabeach/.test(norm(focusName));
  if (!festival) return false;
  // A stay with a group or dates is a lodging quote (the package card).
  if (/\b(?:\d{1,2}|duas|dois|tres|quatro)\s+(?:pessoas|adult\w*|crianc\w*)\b|\bcasal\b|\b\d{1,2}\/\d{1,2}\b/.test(s)) return false;
  return /\b(?:sem (?:estadia|hospedagem|me hospedar|ficar hospedad\w*)|nao (?:estou|estando|vou ficar|sou) hospedad\w*|nao hospede|so (?:pro|para o|pra o|o) (?:evento|festival)|so participar|participar so|um dia|ingressos?|entrada|acesso|aberto ao publico|tem que (?:fazer )?reserva|precisa (?:de )?reserva|reserva de mesa|reservar (?:uma )?mesa|como funciona|funcionaria como|open food|a vontade|so o evento|visitante)\b/.test(s);
}

export const jobApplicationAnswer = 'Obrigado pelo interesse em fazer parte da equipe do Hotel Solar! Vou passar a sua mensagem para a nossa equipe, que retorna por aqui se houver uma oportunidade.';
export function jobApplication(message: string): boolean {
  const s = norm(message);
  if (!s || /\b(?:diarias?|hospedagem|quarto|apartamento|reveillon|pacote)\b.{0,40}\b(?:valor|quanto|preco)\b/.test(s)) return false;
  return /\b(?:curriculo|curriculum|meu cv|vagas? de (?:emprego|trabalho)|oportunidade de (?:emprego|trabalho)|trabalhar (?:com voces|no hotel|ai|na equipe)|candidat[oa]r?|tem vaga(?:s)? (?:de|para) (?:emprego|trabalho|recepcionista|camareira|garcom|cozinheir\w*))\b/.test(s)
    || /\b(?:profissional senior|ampla experiencia|experiencia profissional|sou (?:gerente|diretor|recepcionista|camareira|garcom|cozinheir\w*|chef)|gerente geral hoteleiro)\b/.test(s) && /\b(?:experiencia|atuacao|gestao|profissional)\b/.test(s);
}
