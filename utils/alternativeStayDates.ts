const norm=(s:string)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();

// A search for a different stay is not a cheaper category for the same stay.
// No weekday price/date is inferred here: the customer must supply a period.
export function alternativeStayDates(message:string,lodgingContext=false):boolean {
  const s=norm(message);
  if(/\b(?:restaurante|reserva solar|cardapio|cafe|almoco|jantar|day[ -]?use|massagem|massagens|passeio|piscina|fotos?|imagem|imagens|eventos?|casamento|aniversario|pacote|reveillon|carnaval|feriado)\b/.test(s))return false;
  if(/\b(?:se eu|se nos|caso|hipoteticamente)\b/.test(s)
    || /\bnao (?:quero|queremos|vou|vamos|preciso|precisamos|desejo|e para)\b/.test(s)
    || /\b(?:mesmas? datas?|mesmo periodo|sem (?:mudar|alterar|trocar))\b/.test(s))return false;
  const other=/\b(?:outras?|novas?) datas?\b|\b(?:outro|novo) periodo\b/.test(s);
  const weekday=/\b(?:meio de semana|durante a semana|dias? (?:de|da) semana|dias? uteis)\b/.test(s);
  const lodging=/\b(?:hospedagem|estadia|diarias?|quartos?|apartamentos?|aptos?|suites?|hospedar|cotacao)\b/.test(s);
  if(!lodgingContext&&!lodging)return false;
  if(other)return /\b(?:tem|teria|existe|existem|ha|quero|queremos|prefiro|pode|podemos|veja|ver|consulte|consultar|cot[ae]r?|mudar|trocar|barat[oa]|em conta)\b/.test(s)
    || /^(?:e )?(?:outras? datas?|(?:outro|novo) periodo)[?!.]*$/.test(s);
  // General FAQ ("a tarifa muda no meio de semana?") doesn't choose dates.
  return weekday&&(/\b(?:veja|verifique|consulte|consultar|simule|simular|cote|cotar|quero|queremos|prefiro)\b/.test(s)
    || /\bquanto (?:fica|ficaria|custa|sai)\b/.test(s)
    || lodgingContext&&/^(?:(?:entao|para|pra|no|em) )*(?:meio de semana|durante a semana|dias? (?:de|da) semana|dias? uteis)[?!.]*$/.test(s));
}
