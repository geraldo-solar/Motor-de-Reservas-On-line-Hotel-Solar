import { readFamilyParty } from './familyParty.js';

// Owner-confirmed on 2026-09-11. Counts stay physical: the child is not
// removed from guests, and the allowance does not promise an extra bed.
export const familyAccommodationPolicy = {
  confirmed_at: '2026-09-11',
  confirmed_by: 'Responsável pelo Hotel Solar',
  max_base_capacity: 4,
  max_complimentary_children_per_room: 1,
  child_age_months_exclusive: 84,
};
export const familyAgeQuestion = 'Quais são as idades das crianças? Preciso da idade de todas para verificar se vocês cabem em um apartamento ou se será necessário dividir o grupo. Cada categoria admite sua ocupação normal mais 1 criança de até 6 anos em cortesia, com limite de 4 pessoas mais essa criança no mesmo apartamento.';
export const familyRoomRule = 'Cada categoria admite sua ocupação normal mais 1 criança de até 6 anos em cortesia, com limite de 4 pessoas mais essa criança por apartamento. Um casal com 1 criança nessa faixa pode ficar na categoria Casal pelo valor de casal; uma categoria maior é opcional. Precisamos das idades de todas as crianças antes de indicar a acomodação ou dividir o grupo. Isso não garante cama extra, berço ou disponibilidade.';

export function familyAccommodation(state: any, guests: number, now = Date.now()) {
  const party = readFamilyParty(state?.family_party, now);
  const adults = party?.adults ?? (party?.total !== undefined && party?.children !== undefined ? party.total - party.children : undefined);
  const mentioned = !!state?.family_party?.children || !!state?.facts?.children_pending;
  const complete = !!party && !party.clarification && !state?.family_clarification && !state?.facts?.children_pending
    && Number.isInteger(adults) && adults! > 0 && Number.isInteger(party.children)
    && party.ages_months.length === party.children && adults! + party.children! === guests
    && (party.total === undefined || party.total === guests);
  const children = complete ? party!.children! : 0;
  return {
    pending: mentioned && !complete,
    children,
    eligible: complete ? party!.ages_months.filter(age => age < 84).length : 0,
    // Quotes using child rules are tied to the exact composition and ages.
    key: complete && children ? JSON.stringify([adults, children, [...party!.ages_months].sort((a,b)=>a-b)]) : undefined,
  };
}

export function baseRoomCapacity(value: number) {
  return Number.isInteger(value) && value > 0 ? Math.min(value, 4) : 0;
}

export function familyRoomExplanation(guests: number, eligible: number, divided = false) {
  if (divided) return `Para ${guests} hóspedes, precisamos dividir o grupo entre apartamentos. A cortesia é de no máximo 1 criança de até 6 anos por apartamento; as demais pessoas contam na ocupação normal de cada categoria. A distribuição será conferida com a recepção.`;
  if (!eligible) return `Para ${guests} hóspedes, usamos a ocupação normal da categoria: não há criança na faixa de até 6 anos para aplicar a cortesia adicional.`;
  return `As idades informadas permitem acomodar os ${guests} hóspedes em um apartamento compatível, considerando no máximo 1 criança de até 6 anos em cortesia. As demais pessoas contam na ocupação normal da categoria. Um casal com 1 criança nessa faixa pode usar o valor da categoria Casal; uma categoria maior é opcional. Isso não garante cama extra ou berço.`;
}
