// Public hotel contact, checked against https://www.hotelsolar.tur.br/ on
// 2026-09-09. Supplying a requested number is not a handoff or an outbound call.
export const hotelContactAnswer = 'Você pode ligar para o Hotel Solar pelo telefone (91) 98100-0800. Se preferir, podemos continuar o atendimento por aqui.';

export function hotelPhoneInquiry(message: string): boolean {
  const s = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\b(?:nao quero informar|prefiro nao informar|nao autorizo|reclamacao|reembolso|cancelar minha reserva|luiza)\b/.test(s)) return false;
  if (/\b(?:fotos?|imagens?|videos?|frigobar|televisao|tv|ar condicionado|chuveiro|luz|tomada|wifi|wi-fi)\b/.test(s)) return false;
  // Do not turn a customer's number, room number or broken room telephone
  // into a request for our public contact; do not promise a callback.
  if (/\b(?:meu|novo) (?:numero|telefone)|\b(?:telefone|numero) (?:do|no) (?:quarto|apartamento)|\b(?:me ligue|me liga|me liguem|me ligar|liguem para mim)\b/.test(s)) return false;
  const phone = /\b(?:telefone|fone|numero (?:de contato|para contato|para ligar|d[eo] (?:voces|vcs)|do hotel|da recepcao)|contato telefonico)\b/.test(s);
  const ask = /\b(?:qual|como|onde|posso|podemos|consigo|quero|queria|gostaria|preciso|pode|poderia|tem|voces tem|me pass[ae]|me mand[ae]|me envi[ae])\b/.test(s);
  if (phone && ask) return true;
  return ask && /\b(?:ligar|telefonar|ligacao)\b/.test(s)
    && /\b(?:voces|vcs|hotel|recepcao|falar|contato|telefone|numero)\b/.test(s);
}
