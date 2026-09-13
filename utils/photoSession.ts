const normalize = (value: string) => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const photoSessionAnswer = 'Para realizar ensaios ou sessões de fotos durante a hospedagem, consulte previamente a recepção, inclusive para fotos nas áreas comuns ou com fotógrafo externo. A autorização e as condições precisam ser conferidas; isso não confirma agendamento.';

/** Taking photographs at the hotel is not asking to receive its media.
 * This classifies the subject only, never grants permission or books a shoot. */
export function photoSessionInquiry(message: string): boolean {
  const s = normalize(message);
  if (!s || /\b(?:comprovantes?|documentos?|pdf|anexos?|identidade|cpf|passaporte|cnh)\b/.test(s)) return false;
  const viewingMedia = /\b(?:mande|manda|mandar|envie|envia|enviar|mostrar|mostre|ver|receber)\s+(?:(?:as|umas|algumas|mais|novas|minhas|nossas|suas|outras|essas)\s+){0,4}(?:fotos?|imagens?|videos?)\b/.test(s)
    || /\b(?:tem|possui|voces tem|cade) (?:as |algumas )?(?:fotos?|imagens?|videos?) (?:do|da|dos|das) (?:ensaio|sessao)\b/.test(s);
  if (viewingMedia) return false;
  if (/\b(?:ensaio(?:s)? (?:fotograficos?|de fotos)|sessoes? (?:de fotos|fotograficas?)|sessao (?:de fotos|fotografica))\b/.test(s)) return true;
  if (/\b(?:levar|trazer|entrar|vir)\b[^.!?;]{0,45}\bfotografo\b|\bfotografo (?:externo|de fora|pode entrar)\b/.test(s)) return true;
  return /\b(?:fazer|realizar|tirar|produzir) (?:as |umas |algumas |minhas |nossas )?fotos?\b/.test(s)
    || /\b(?:posso|podemos|permitido|permite|autorizado)\b[^.!?;]{0,45}\bfotografar\b/.test(s);
}
