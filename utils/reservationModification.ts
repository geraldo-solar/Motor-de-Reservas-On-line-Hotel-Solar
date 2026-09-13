import { stripNegatedHumanRequests } from './humanIntent.js';

const normalize = (value: string) => stripNegatedHumanRequests(String(value || '')).normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Current requests to change an existing stay or verify its additional
 * balance. No category, amount, availability or prior booking is confirmed. */
export function reservationModificationInquiry(message: string, contextual = false): boolean {
  const s = normalize(message);
  if (!s || /\b(?:outro hotel|voo|passagem|celular|computador|software|ingresso|plano de internet)\b/.test(s)) return false;
  for (const clause of s.split(/[.!?;]|\b(?:mas|porem)\b/).map(part => part.trim())) {
    if (!clause) continue;
    if (/\b(?:nao|nunca) (?:quero|queremos|preciso|precisamos|desejo|gostaria|vou|vamos|pedi|solicitei)\b|\b(?:dispenso|desisti|cancele|cancelar)\b/.test(clause)) continue;
    if (/\b(?:como (?:funciona|funcionam|faco|fazer|pedir|solicitar)|quero saber|gostaria de saber|queria saber|e possivel|politica|regras?|em geral|normalmente)\b/.test(clause)
      || /\b(?:se|caso|quando) (?:eu )?(?:quiser|precisar|fizer|pedir|solicitar|tiver)\b/.test(clause)) continue;
    const upgrade = /\bupgrade\b/.test(clause);
    const explicitAction = /\b(?:quero|queremos|preciso|precisamos|gostaria|retomar|finalizar|concluir|prosseguir|continuar|solicito|solicitamos|pode fazer|podem fazer)\b/.test(clause);
    const nonRoomUpgrade = /\b(?:passeio|barco|catamara|mesa posta|refeicao|restaurante|reserva solar)\b/.test(clause)
      && !/\b(?:quarto|apartamento|apto|suite|loft|hospedagem)\b/.test(clause);
    if (upgrade && explicitAction && !nonRoomUpgrade) return true;
    const ownRoom = /\b(?:meu|minha|nosso|nossa|o|a) (?:quarto|apartamento|apto|suite|acomodacao)\b/.test(clause);
    if ((ownRoom || contextual) && /\b(?:alterar|mudar|trocar)\b/.test(clause) && explicitAction
      && /\b(?:quarto|apartamento|apto|suite|acomodacao|categoria)\b/.test(clause)) return true;
    // A comparison between advertised categories is not an outstanding
    // balance. Bind the difference to the customer's own amount to pay.
    const ownBalance = /\b(?:tenho|temos|falta|faltaria|devo|devemos|preciso|precisamos) (?:que |de |eu |nos )?pagar\b|\bdiferenca (?:da|para a) (?:minha|nossa) reserva\b/.test(clause);
    const verify = /\b(?:verificar|conferir|consultar|calcular|confere|confira|veja|quanto|qual)\b/.test(clause);
    if (/\bdiferenca\b/.test(clause) && ownBalance && verify) return true;
    if (contextual && /\bdiferenca\b/.test(clause) && verify
      && /\b(?:do upgrade|para (?:o|a) upgrade|dessa (?:troca|alteracao)|deste upgrade|desse upgrade)\b/.test(clause)) return true;
  }
  return false;
}
