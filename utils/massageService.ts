// Owner-confirmed service information, not stock, medical advice or a booking.
export const massagePolicy = {
  confirmed_at: '2026-09-17',
  available: true,
  outsourced: true,
  contacts: ['(91) 98477-8630', '(91) 98063-8223'],
  modalities: ['Relaxante', 'Drenagem linfática', 'Pedras Quentes', 'SPA dos pés', 'Reflexologia', 'Velas aromáticas'],
  pricing: 'Valores devem ser cotados diretamente nos contatos informados; não informar preço fixo.',
  limits: 'Horários, disponibilidade e agendamento diretamente com os prestadores. Não afirmar contratação, agendamento, inclusão na diária/pacote, gratuidade, local de atendimento ou indicação terapêutica. Não confundir com o retiro/evento SPA Solar Detox.',
} as const;
const norm=(s:string)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export function massageInquiry(message:string):boolean {
  return /\b(?:massage(?:m|ns)|massagistas?|massoterap(?:ia|eutas?)|drenagem(?: linfatica)?|pedras quentes|spa(?: dos pes)?|reflexologia|velas aromaticas)\b/.test(norm(message));
}
export function readMassageContext(value:any,now=Date.now()):{at:number}|undefined {
  if(value&&Number.isFinite(value.at)&&value.at>0&&value.at<=now&&now-value.at<=30*60000)return {at:value.at};
}
export function massageFollowup(message:string):boolean {
  const s=norm(message).replace(/[.!?]+$/,'');
  return /^(?:e )?(?:quanto (?:custa|e|fica)|qual (?:e )?o (?:valor|preco|contato|telefone|numero|horario)|quais (?:sao )?(?:os (?:valores|precos|contatos|horarios)|as (?:modalidades|opcoes))|tem (?:contato|telefone)|(?:me )?(?:passe|manda|mande|envie) (?:o |os )?(?:contatos?|telefones?|numeros?)|como (?:agendar|reservar|contratar|funciona)|(?:pode|podem|quero|gostaria de) (?:agendar|reservar)|(?:esta|e|ja esta) inclus[oa]|(?:e |tem )?(?:gratis|gratuito|gratuita|cortesia)|(?:qual |o )?whatsapp|(?:e )?(?:relaxante|para hoje|para amanha))$/.test(s);
}
export function massageServiceAnswer(message:string,context?:unknown,now=Date.now()):string|undefined {
  if(!massageInquiry(message)&&!(readMassageContext(context,now)&&massageFollowup(message)))return;
  const s=norm(message);
  const intro=/\b(?:solar detox|retiro)\b/.test(s)
    ? 'O SPA Solar Detox é um retiro/evento em datas específicas. Separadamente, há serviço de massagens terceirizado no Hotel Solar.'
    : 'Há serviço de massagens terceirizado no Hotel Solar.';
  const modalities='Modalidades: '+massagePolicy.modalities.join(', ')+'.';
  const contacts='Para cotar valores e consultar horários, disponibilidade e agendamento, fale diretamente com os prestadores:\n'+massagePolicy.contacts.join('\n');
  const extra=/\b(?:inclus[oa]|incluid[oa]|diaria|pacote|gratis|gratuit[oa]|cortesia)\b/.test(s)
    ? '\nO serviço é contratado à parte; não há inclusão ou gratuidade confirmada na sua hospedagem.'
    : /\b(?:gestante|gravida|gestacao|cirurgia|dor|dores|doenca|contraindicacao|tratamento|indicado|indicada|saude)\b/.test(s)
    ? '\nPara saber se uma modalidade é adequada ao seu caso, consulte um profissional de saúde.' : '';
  return `${intro}\n\n${modalities}\n\n${contacts}${extra}`;
}
