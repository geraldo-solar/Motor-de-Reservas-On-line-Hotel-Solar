// Audit 26/10/2026: the model invented menu details ("os pratos são
// individuais", "o peixe inteiro serve mais de uma pessoa", "não há cardápio
// de café da tarde") and told a customer "não realizamos reservas por aqui".
// Menu details come only from the official menus; bookings are made here.

const norm = (value: string) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

export const MENU_LINKS = {
  reserva: 'https://cardapio-reserva-solar.vercel.app/',
  solar73: 'https://cardapiohotelsolar.vercel.app/',
};

const menuWords = /\b(?:cardapio|menu|pratos?|porc(?:ao|oes)|peixes?|camarao|camaroes|caranguejo|ostras?|moqueca|petiscos?|sobremesas?|drinks?|bebidas?|sucos?|caldeirada|file|picanha|risoto|massas?)\b/;
const detail = /\b(?:serve[m]?|servir|da para|quantas pessoas|individua(?:l|is)|tamanho|gramas|kg|quilo|ingredientes?|acompanha(?:m|mento|mentos)?|vem com|leva|contem|feito com|vegan[oa]s?|vegetarian[oa]s?|sem gluten|sem lactose|infantil|kids|cafe da tarde|lanche da tarde|tem (?:opcao|opcoes)|tem (?:peixe|camarao|caranguejo|ostra|moqueca|sobremesa|suco|drink)|qual (?:o )?(?:melhor|mais pedido)|recomenda)\b/;

/** The restaurants a menu answer should link: the one named in the message
 * or in the recent turns, or both. */
function restaurantsFor(text: string): Array<'reserva' | 'solar73'> {
  const reserva = /\b(?:reserva solar|pe na areia|o reserva|no reserva|do reserva)\b/.test(text);
  const solar73 = /\bsolar 73\b/.test(text);
  if (reserva && !solar73) return ['reserva'];
  if (solar73 && !reserva) return ['solar73'];
  return ['reserva', 'solar73'];
}

export function menuDetailQuestion(message: string, recent = ''): boolean {
  const s = norm(message);
  if (!s || s.length > 300) return false;
  if (/\b(?:hospedagem|diarias?|quartos?|apartamentos?|suites?|pacote|reveillon|ceia|festa|evento|casamento|aniversario|day ?use|cafe da manha)\b/.test(s)) return false;
  if (!detail.test(s)) return false;
  return menuWords.test(s) || menuWords.test(norm(recent)) && /\?|\b(?:qual|quais|quantas?|quantos?|tem|serve|e individual)\b/.test(s);
}

export function menuDetailAnswer(message: string, recent = ''): string | undefined {
  if (!menuDetailQuestion(message, recent)) return;
  const places = restaurantsFor(`${norm(message)} ${norm(recent)}`);
  const links = places.length === 1
    ? `${places[0] === 'reserva' ? 'Reserva Solar' : 'Solar 73'}: ${MENU_LINKS[places[0]]}`
    : `Reserva Solar: ${MENU_LINKS.reserva}\nSolar 73: ${MENU_LINKS.solar73}`;
  return `Para não te passar uma informação errada: porções, quantas pessoas cada prato serve, ingredientes e opções estão no cardápio oficial.\n${links}\nO que não estiver no cardápio, a equipe do restaurante confirma na hora do pedido.`;
}

/** The model saying bookings are not made here. */
export function bookingDenial(answer: string): boolean {
  const s = norm(answer);
  return /\bnao (?:realizamos|fazemos|efetuamos|conseguimos (?:fazer|realizar)|e possivel (?:fazer|realizar|efetuar)|consigo (?:fazer|realizar|efetuar)|posso (?:fazer|realizar|efetuar))\b.{0,40}\breservas?\b/.test(s)
    || /\breservas?\b.{0,50}\b(?:nao (?:sao|e) (?:feitas?|realizadas?)|somente (?:pelo|pela) (?:site|telefone|recepcao))\b.{0,20}\b(?:por aqui|neste canal|pelo whatsapp)?/.test(s)
      && /\b(?:por aqui|neste canal|pelo whatsapp|nao)\b/.test(s);
}
export const bookingHereAnswer = 'Fazemos a sua reserva por aqui, sim! Me diga as datas de entrada e saída e quantas pessoas vão, contando adultos e crianças, que eu já te passo os valores.';
