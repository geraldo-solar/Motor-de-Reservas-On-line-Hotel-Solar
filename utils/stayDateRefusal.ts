import {calendarDateMention,relativeStayDateMention} from './stayDuration.js';

/** A refused period is not a positive date declaration. Keep this separate
 * from the numeric parser so abbreviated/relative dates get the same guard.
 * Mixed rejected/replacement periods are clarified rather than guessed. */
export function rejectedStayDates(message:string):boolean {
  const s=message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return s.split(/[.!?;]|\b(?:mas|porem|contudo)\b/).some(clause=>{
    // Negating a CHANGE means retain the existing period, not reject it.
    if(/\bnao (?:quero |queremos |vou |vamos |precisa |preciso |e para )?(?:mudar|mude|muda|alterar|altere|altera|trocar|troque|troca|corrigir|corrija|corrige|adiar|antecipar|prorrogar|estender)\b/.test(clause))return false;
    if(/\b(?:(?:ess[ae]s?|est[ae]s?|aquel[ae]s?) (?:datas?|dias?|periodos?)|(?:o|esse|este) periodo)\b.{0,35}\bnao (?:servem?|funcionam?|da|dara|posso|podemos|consigo|conseguimos)\b/.test(clause))return true;
    if(/\bnao (?:posso|podemos|consigo|conseguimos|quero|queremos|vou|vamos)\s+(?:(?:ir|viajar|ficar)\s+)?(?:ness[ae]s?|nest[ae]s?) (?:datas?|dias?|periodos?)\b/.test(clause))return true;
    const dateMention=calendarDateMention(clause)||relativeStayDateMention(clause)
      ||/\b(?:fim|final) de semana\b|\b(?:dias? )?\d{1,2}\s*(?:a|ate|ao|-)\s*\d{1,2}\b/.test(clause);
    if(!dateMention)return false;
    const dateStart='(?:(?:de|para|pra|entre|em|no|na|nos|nas|a partir de)\\s+)?(?:dias?\\s+)?(?:\\d{1,4}\\b|hoje\\b|amanha\\b|depois de amanha\\b|(?:esse|este|proximo) (?:fim|final) de semana\\b)';
    const travel='(?:ir|viajar|ficar|chegar|entrar|sair|me hospedar|nos hospedar)';
    const dateAtom='(?:20\\d{2}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}(?:/(?:20)?\\d{2})?|\\d{1,2} (?:de )?(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?: (?:de )?20\\d{2})?|hoje|amanha)';
    return new RegExp(`\\bnao\\s+(?:(?:era|e|seria|sera|posso|podemos|consigo|conseguimos)\\s+)?${dateStart}`).test(clause)
      // Require the refused travel action to target the date directly. A
      // refused floor/category, or "não vou sair do hotel", is not a refusal
      // of a period merely mentioned elsewhere in the same message.
      || new RegExp(`\\bnao (?:vou|vamos|posso|podemos|consigo|conseguimos|quero|queremos|pretendo|pretendemos|irei|iremos|e possivel)\\s+(?:mais\\s+)?${travel}\\s+${dateStart}`).test(clause)
      || new RegExp(`\\bnao (?:quero|queremos)\\s+(?:mais\\s+)?(?:hospedagem|estadia|entrada|saida)\\s+${dateStart}`).test(clause)
      || new RegExp(`\\b${dateAtom}\\s+nao (?:da|dara|serve|servem|funciona|funcionam|posso ir|consigo ir)\\b`).test(clause);
  });
}
