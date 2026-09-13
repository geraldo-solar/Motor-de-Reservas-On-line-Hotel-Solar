const norm=(s:string)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();

/** A named relative/person whose attendance is uncertain is not a confirmed
 * occupant, a child by inference, or an instruction to modify a reservation. */
export function possibleCompanionInquiry(message:string):boolean {
  const s=norm(message);
  if(/\b(?:restaurante|reserva solar|solar 73|day[ -]?use|almoco|jantar|cafe|passeio)\b/.test(s))return false;
  if(!/\b(?:filh[oa]|acompanhante|adult[oa]|pessoa)\b/.test(s))return false;
  return /\b(?:ainda )?nao confirmou(?: (?:se )?ir)?\b|\b(?:caso|se)\b.{0,65}\b(?:consiga ir|conseguir ir|possa ir|puder ir|ele va|ela va|ele for|ela for|venha|vier)\b|\btalvez\b.{0,50}\b(?:va|venha|viaje|participe)\b/.test(s);
}

export const possibleCompanionAnswer='Por enquanto, esse acompanhante é apenas uma possibilidade, não uma pessoa confirmada na ocupação. Se a participação for confirmada, a recepção precisa conferir a idade, a capacidade e a configuração do apartamento, a disponibilidade e eventual diferença de valor. Cama extra não significa hospedagem gratuita para um adulto. Não estou confirmando inclusão, cama ou mudança de categoria.';
