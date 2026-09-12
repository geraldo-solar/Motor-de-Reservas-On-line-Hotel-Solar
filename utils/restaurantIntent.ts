// The short venue name needs a restaurant-related predicate. A generic
// "reserva", an existing booking or a lodging request is not this alias.
export function reservaRestaurantMessage(message: string): string {
  const text=String(message || '');
  const s=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if (/\breserva solar\b/.test(s)) return text;
  if (/\b(?:minha|nossa|sua) reserva\b|\b(?:hospedagem|diarias?|quartos?|apartamentos?|aptos?|check.?in|check.?out|pagamento|paguei|boleto)\b/.test(s)) return text;
  const venue=/\b(?:o|no|do|ao|pro|pelo) reserva\b/.test(s)
    || /^\s*reserva\s+(?:vai\s+)?(?:abrir|abre|funciona|funcionar|fecha|fechar)\b/.test(s);
  const information=/\b(?:funciona\w*|aberto|abrir|abre|fech\w*|horarios?|cardapio|menu|restaurante|fotos?|imagens?|videos?|entrada|almoco|jantar|pratos?|onde|localizacao|endereco)\b/.test(s);
  return venue && information ? text.replace(/\breserva\b/i,'Reserva Solar') : text;
}
