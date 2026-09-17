const normalize=(s:string)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const affirmative=/^(?:sim(?:,? por favor)?|isso(?: mesmo)?|pode manter|mantenha|mantem)(?:[,;.!]+\s*|\s+)(.+)$/;
const question=(s:string)=>s.replace(/^(?:(?:mas|e|tambem)\s+)*(?:(?:eu )?(?:quero|queria|gostaria de) saber\s+|(?:pode|poderia) (?:me )?(?:dizer|informar)\s+)?/,'').replace(/[.!?]+$/,'').trim();
function inclusions(s:string):boolean {
  return /^(?:(?:o )?que(?: que)? (?:esta |e |vem )?(?:inclus[oa]|incluid[oa]) (?:na|em uma|nessa|nesta) (?:diaria|hospedagem|estadia)|(?:o )?que (?:a |uma |essa |esta )?(?:diaria|hospedagem|estadia) inclui|quais (?:os )?(?:servicos|itens|beneficios) (?:estao |sao )?(?:inclusos|incluidos) (?:na|nessa|nesta) (?:diaria|hospedagem|estadia))$/.test(s);
}

// Only a complete, factual question may accompany a date affirmation. Do not
// strip arbitrary trailing clauses: a condition, correction, new date or
// booking instruction must not turn into consent to the proposed dates.
export function affirmedStayInformation(message:string):boolean {
  const match=affirmative.exec(normalize(message));
  if(!match)return false;
  const s=question(match[1]);
  return inclusions(s)
    || /^(?:o )?cafe(?: da manha)? (?:esta |e |vem )?(?:incluso|incluido)(?: na diaria)?$/.test(s)
    || /^(?:qual (?:e )?o horario|que horas) (?:do |de |e o )?check[ -]?(?:in|out)$/.test(s)
    || /^(?:tem|ha|voces tem|o hotel tem) (?:wi[ -]?fi|internet|estacionamento)$/.test(s);
}

export function lodgingInclusionsQuestion(message:string):boolean {
  const s=normalize(message),match=affirmative.exec(s);
  return inclusions(question(match?match[1]:s));
}

// Owner-confirmed ordinary-stay policy. Callers must retain the current
// package's own inclusion rules instead of substituting this general answer.
export const lodgingInclusionsText='Na diária comum estão incluídos café da manhã, Wi-Fi, estacionamento gratuito rotativo e acesso às áreas de lazer permitidas aos hóspedes, como piscinas e playground. Consumos de restaurante, massagens e passeios terceirizados são cobrados à parte. Pacotes especiais seguem suas próprias condições.';
export const lodgingInclusionsAnswer=(message:string)=>lodgingInclusionsQuestion(message)?lodgingInclusionsText:undefined;
