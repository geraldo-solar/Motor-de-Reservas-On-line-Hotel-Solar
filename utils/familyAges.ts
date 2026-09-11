// Shared by text and transcribed-audio age continuations. No bare number is
// treated as an age: the customer must supply years/months explicitly.
const numbers: Record<string, number> = {
  zero:0, um:1, uma:1, dois:2, duas:2, tres:3, quatro:4, cinco:5, seis:6,
  sete:7, oito:8, nove:9, dez:10, onze:11, doze:12, treze:13, catorze:14,
  quatorze:14, quinze:15, dezesseis:16, dezasseis:16, dezessete:17,
  dezassete:17, dezoito:18, dezenove:19, dezanove:19,
  vinte:20, trinta:30, quarenta:40, cinquenta:50, sessenta:60,
  setenta:70, oitenta:80, noventa:90, cem:100,
};
export function normalizeAgeNumbers(value: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa) e (um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove)\b/g,
      (_all, tens, units) => String(numbers[tens] + numbers[units]))
    .replace(new RegExp(`\\b(${Object.keys(numbers).join('|')})\\b`, 'g'), word => String(numbers[word]));
}
const agesPattern = () => /\b(\d{1,3}(?:\s*(?:,|e)\s*\d{1,3})*)\s*(anos?|meses?)(?:\s+e\s+(\d{1,2})\s*meses?\b)?\b/g;

/** Discard ages attached to adults/parents, never borrowing them for a child. */
export function declaredFamilyAges(value: string, composition = false): number[] {
  const s = normalizeAgeNumbers(value);
  const result: number[] = [];
  for (const match of s.matchAll(agesPattern())) {
    if (composition) {
      const prefix = s.slice(0, match.index);
      const subjects = [...prefix.matchAll(/\b(?:criancas?|bebes?|filh[oa]s?|adult[oa]s?|casal|casais|pai|mae|marido|esposa|esposo|eu)\b/g)];
      const last = subjects.at(-1);
      if (last && !/^(?:crianca|bebe|filh)/.test(last[0])) {
        const before = subjects.at(-2);
        // "filhos adultos" still describes offspring, not additional adults.
        const offspringAdjective = /^adult/.test(last[0]) && before && /^filh/.test(before[0])
          && /^\s*(?:e\s+)?$/.test(prefix.slice(before.index! + before[0].length, last.index));
        if (!offspringAdjective) continue;
      }
    }
    const values = match[1].split(/\s*(?:,|e)\s*/).map(Number);
    if (match[3] !== undefined) {
      result.push(values.length === 1 && match[2].startsWith('ano') && Number(match[3]) < 12
        ? values[0] * 12 + Number(match[3]) : -1);
    } else result.push(...values.map(age => age * (match[2].startsWith('ano') ? 12 : 1)));
  }
  return result;
}

export function familyAgeFollowup(value: string): boolean {
  const s = normalizeAgeNumbers(value).trim();
  if (!s || s.length > 180 || !declaredFamilyAges(s).length) return false;
  const remainder = s.replace(agesPattern(), '@').replace(/[.!?,:]/g, ' ').trim();
  return /^(?:(?:na verdade|corrigindo|correcao|me enganei|quis dizer|e|ela|ele|elas|eles|a|o|as|os|outra|outro|minha|meu|minhas|meus|filhas?|filhos?|criancas?|bebes?|tem|temos|idades?|sao|de|com|mais|nova|novo|velha|velho|\d+|@)\s*)+$/.test(remainder);
}
