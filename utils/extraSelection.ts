export type ExtraSelectionAction={code:'BARCO'|'MESA'|'LUA';action:'add'|'remove'};

/** Bind each extra to its own command. A removal in one clause must not
 * remove an item requested in the next. Facts only describe a simulation. */
export function extraSelectionActions(message:string):ExtraSelectionAction[] {
  const s=message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  // Questions about capability/price are not permission to select an extra.
  if(/\b(?:quanto|qual|quais|como|posso|podemos|poderia incluir|pode incluir no pacote|inclui|incluido|incluso)\b|\b(?:quero|queria|preciso|gostaria de) saber\b/.test(s)
    || /\b(?:possivel|possibilidade|viavel|sera que)\b|\b(?:dizer|informar|ver|verificar|conferir|consultar)\s+se\b|\b(?:da|daria) (?:para|pra)\b|\b(?:voce|voces) consegue(?:m)?\b/.test(s)
    ||/\b(?:se eu|se nos|caso|talvez|hipoteticamente)\b/.test(s))return [];
  const result:ExtraSelectionAction[]=[];
  const verbs='(?:quero|queremos|inclu(?:ir|a|i)|adicion(?:ar|e|a)|coloc(?:ar|a)|coloque|acrescent(?:ar|e|a)|retir(?:ar|e|a)|remov(?:er|a|e)|exclu(?:ir|a|i))';
  const tokens=new RegExp(`\\b(?:nao\\s+(?:(?:quero|queremos|preciso|precisa|e para)\\s+)?${verbs}|${verbs}|sem|barco|mesa(?: posta)?|(?:kit )?lua de mel)\\b|[.!?;]`,'g');
  const nextCommand=new RegExp(`\\b(?:nao\\s+)?${verbs}\\b|[.!?;]`);
  let action:ExtraSelectionAction['action']|undefined;
  for(const match of s.matchAll(tokens)){
    const token=match[0];
    if(/^[.!?;]$/.test(token)){action=undefined;continue;}
    const code=token==='barco'?'BARCO':/^mesa/.test(token)?'MESA':/lua de mel$/.test(token)?'LUA':undefined;
    if(code){if(action)result.push({code,action});continue;}
    if(/^nao/.test(token)){
      // "não retire" preserves the item; it never implies adding it.
      // Refusing a duplicate inclusion also preserves it. Scope repetition
      // to this command, so a later affirmative selection still takes effect.
      const target=s.slice(match.index!+token.length).split(nextCommand)[0];
      const duplicateInclusion=/inclu|adicion|coloc|coloque|acrescent/.test(token)
        &&/\b(?:novamente|de novo|outra vez|mais uma vez|outro|outra|mais um|mais uma)\b/.test(target);
      action=/retir|remov|exclu/.test(token)||duplicateInclusion?undefined:'remove';
    }else action=/^(?:retir|remov|exclu|sem)/.test(token)?'remove':'add';
  }
  return result;
}
