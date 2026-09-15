const normalize = (value: string) => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[*_`]/g, '')
  .replace(/\s+/g, ' ').trim();

const counts: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
};
const count = '(\\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)';
const lodging = /\b(?:hospedagem|estadia|hospedar|acomodar|acomodacao|diarias?|quartos?|apartamentos?|aptos?|loft|suites?)\b/;
const distribution = /\b(?:dividir|divididos|distribuir|distribuicao|distribuidos|restantes|outros|outras|filhos|filhas)\b|\bcasal\b.*\btriplo\b|\btriplo\b.*\bcasal\b/;

function sentences(answer: string): string[] {
  return String(answer || '').split(/(?<=[.!?;])\s+|\n+/).map(normalize).filter(Boolean);
}

// This is deliberately not a general number/entity parser. Ignore questions,
// hypotheses and reported older compositions instead of guessing which number
// was asserted. A later sentence can still contain an independent assertion.
function assertion(sentence: string): string {
  if (/\?|\b(?:se|supondo|suponha|hipotese|exemplo|seriam|fossem|poderiam)\b|\bcaso (?!atual\b)/.test(sentence)) return '';
  const now = sentence.match(/\b(?:mas )?agora\b/);
  if (/\b(?:antes|anteriormente|antigamente|anterior|eram)\b/.test(sentence)) {
    if (!now || now.index === undefined) return '';
    sentence = sentence.slice(now.index);
  }
  return sentence;
}

function negated(sentence: string, index: number): boolean {
  // A comma ends the negated assertion: “não são cinco, agora são dois”.
  const prefix = sentence.slice(0, index).split(',').at(-1) || '';
  return /\b(?:nao|nunca|nem)\b/.test(prefix);
}

/** Detect only explicit claims about the current entire travelling party.
 * Capacity, bedroom counts, adult/child subtotals and money are not totals.
 * Missing/invalid facts cannot establish a contradiction. This helper neither
 * updates facts nor establishes that a booking or a quote is valid. */
export function lodgingPartyConflict(answer: string, guests?: number): boolean {
  if (!Number.isInteger(guests) || !guests || guests < 1) return false;
  const text = normalize(answer);
  for (const raw of sentences(answer)) {
    const sentence = assertion(raw);
    if (!sentence) continue;
    const claims = [
      `\\bpara (?:acomodar|hospedar) (?:todos )?voces (?:os |as )?${count}\\b`,
      `\\b(?:a sua|sua|essa|esta) (?:hospedagem|estadia|reserva) (?:e |sera |ficou )?(?:agora )?para ${count} (?:pessoas|hospedes)\\b`,
      `\\b(?:voces|seu grupo|sua familia) (?:sao|serao|somam?|totalizam?) (?:ao todo |no total |agora )?${count}\\b`,
      `\\bagora (?:sao|serao) ${count} (?:pessoas|hospedes)\\b`,
    ];
    // Bare acknowledgements and an explicit quote basis can also assert the
    // whole party. Keep these forms separate from capacity/service clauses.
    if (!/\b(?:capacidade|lotacao|limite|cafe|almoco|jantar|restaurante|passeio|barco|terceiros?)\b/.test(sentence)) {
      claims.push(`^(?:(?:entendi|certo|perfeito|ok|entao)[,:!]?\\s+)*(?:sao|serao) ${count} (?:pessoas|hospedes)\\b`);
      claims.push(`\\b(?:a|esta|essa|sua|a sua) (?:cotacao|simulacao) (?:considera|inclui|e para|sera para) ${count} (?:pessoas|hospedes)\\b`);
    }
    // “Para vocês dois” can refer to the parents in a two-room distribution.
    // Use this shorter form only when no distribution/subgroup is described.
    if (lodging.test(text) && !distribution.test(text)) claims.push(`\\bpara voces ${count}\\b`);
    for (const pattern of claims) {
      for (const match of sentence.matchAll(new RegExp(pattern, 'g'))) {
        if (negated(sentence, match.index!)) continue;
        // “Vocês são dois adultos e três crianças” states a subtotal. Never
        // use it as an assertion that the entire party contains two people.
        const after = sentence.slice(match.index! + match[0].length);
        if (/^\s+(?:adultos?|criancas?|filhos?|filhas?|quartos?|apartamentos?|aptos?|anos|meses)\b/.test(after)) continue;
        if (/^\s*(?:(?:pessoas|hospedes)\s*)?(?:\+|mais|e)\s*(?:\d|um|uma|dois|duas|tres)\b/.test(after)) continue;
        if (/^\s*(?:(?:pessoas|hospedes)\s*)?(?:por|em cada|para cada)\s+(?:quarto|apartamento|apto|suite)\b/.test(after)) continue;
        const stated = counts[match[1]] || Number(match[1]);
        if (stated !== guests) return true;
      }
    }
    if (lodging.test(text) && !distribution.test(text)) {
      const couple = /\b(?:so|apenas|somente) voce e (?:(?:a )?sua (?:esposa|companheira|namorada)|(?:o )?seu (?:marido|companheiro|namorado))\b/g;
      for (const match of sentence.matchAll(couple)) {
        if (!negated(sentence, match.index!) && guests !== 2) return true;
      }
    }
  }
  return false;
}

/** Narrow classifier for discarding old monetary lodging answers after the
 * party changes. It is not a price validator. Service/meal-policy prices alone
 * must not cause otherwise useful FAQ history to be removed. */
export function lodgingCommercialAnswer(answer: string): boolean {
  // Keep a room heading together with its following single-line price, but do
  // not associate a meal price with an unrelated sentence about a room.
  const blocks = String(answer || '').split(/(?<=[.!?;])\s+|\n\s*\n/);
  const money = /(?:r\$\s*\d(?:[\d.,]*\d)?|\bbrl\s*\d(?:[\d.,]*\d)?|\b\d(?:[\d.,]*\d)?\s*reais\b)/g;
  const roomOrStay = /\b(?:hospedagem|estadia|diarias?|loft|suites?|quartos?|apartamentos?|aptos?|casal|duplo|triplo|quadruplo|pacotes? (?:de |do |para o )?(?:reveillon|ano novo|natal|carnaval))\b/;
  const service = /\b(?:cafe|almoco|jantar|restaurante|cardapio|couvert|ingresso|day use|passeio|barco|mesa posta|lua de mel|decoracao|estacionamento|frigobar|lavanderia|taxa|multa|late checkout|late check out|checkout|check out|saida tardia|meia diaria|terceiros?|operadora|agencia)\b/;
  const withoutIncludedBreakfast = (text: string) => text
    .replace(/\b(?:com|inclui|incluindo) (?:o )?cafe da manha(?: incluso| incluido)?\b/g, '')
    .replace(/\bcafe da manha (?:incluso|incluido)\b/g, '');
  for (const block of blocks) {
    const text = normalize(block);
    let previousPriceEnd = 0;
    for (const price of text.matchAll(money)) {
      const prefix = withoutIncludedBreakfast(text.slice(previousPriceEnd, price.index));
      previousPriceEnd = price.index! + price[0].length;
      // A later comma-separated inclusion does not change the subject of an
      // already stated room price: “Loft R$2900, com café e Kit Lua de Mel”.
      // In contrast, “um casal paga R$150 pelo café” prices a meal, not a room.
      const suffix = withoutIncludedBreakfast(text.slice(previousPriceEnd).split(/[,;]/)[0]);
      if (service.test(prefix) || service.test(suffix)) continue;
      if (roomOrStay.test(prefix)) return true;
      if (/^\s*(?:por|pelo|pela|da|do|de)\s+/.test(suffix) && roomOrStay.test(suffix)) return true;
    }
  }
  return false;
}
