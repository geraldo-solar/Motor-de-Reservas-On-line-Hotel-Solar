/** The owner confirmed the full 26/08 guidance on 08/09/2026. This is a
 * shared guest facility, not confirmation of room appliances or staff service. */
export const confirmedGuestFacilitiesPolicy = {
  status: 'owner_confirmed',
  confirmed_at: '2026-09-08',
  confirmed_by: 'Geraldo Barros, responsável pelo Hotel Solar',
  source: 'Confirmação explícita do responsável em 08/09/2026 da orientação da equipe de 26/08/2026.',
  copa_baby: {
    available: true,
    audience: 'hóspedes',
    appliance: 'micro-ondas',
    purpose: 'aquecer alimentos',
    location: 'copa baby',
    hours: 'sem horário específico de uso',
  },
  limits: [
    'Não afirmar que há micro-ondas dentro dos quartos.',
    'Não confirmar forno, fogão, refrigerador ou outras instalações.',
    'Não prometer aquecimento ou entrega de alimentos por funcionários.',
    'Ausência de horário específico de uso não confirma equipe disponível 24 horas.',
    'Não estender a disponibilidade confirmada para hóspedes a visitantes.',
    'Não deduzir estrutura adaptada, acessibilidade ou preparo de refeições.',
  ],
} as const;

const normalize = (message: string) => String(message || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const appliance = /\bmicro[ -]?ondas?\b/;
const copa = /\bcopa\s+(?:baby|bebe|do bebe)\b/;
const heat = /\b(?:aquecer|aquecem|aquece|aqueca|aquecam|esquentar|esquentam|esquenta|esquente|esquentem)\b/;
const food = /\b(?:comida|comidinha|alimentos?|refeicao|refeicoes|papinha|leite|mamadeira|marmita)\b/;
const unrelatedHeating = /\b(?:piscinas?|hidromassagem|hidro|jacuzzi|chuveiro|banheira|banho|agua da piscina)\b/;
const media = /\b(?:fotos?|fotografias?|imagem|imagens|videos?|cardapio|menu|pdf)\b/;

/** True means an operational request for the existing human handoff, never
 * evidence that staff can or will perform the requested heating/delivery. */
export function guestFacilityServiceRequest(message: string): boolean {
  const s = normalize(message);
  for (const clause of s.split(/[;.!?]|\bmas\b|\bporem\b/).map(value => value.trim())) {
    if (!heat.test(clause) || unrelatedHeating.test(clause) || media.test(clause)) continue;
    if (/\bnao (?:quero|queremos|preciso|precisamos|desejo|gostaria|precisa|precisam)\b|\b(?:cancele|cancela|cancelar|dispenso|desisti)\b|\bnao (?:aqueca|aquecam|esquente|esquentem|traga|tragam|leve|levem)\b/.test(clause)) continue;
    // A procedure question or the guest's own action is not a staff request.
    if (/\bcomo (?:faco|posso|pedir|solicitar|peco|solicito)\b|\b(?:quero|queria|gostaria de) saber\b/.test(clause)) continue;
    const directedHeating = /\b(?:podem|poderiam|conseguem|conseguiriam)\s+(?:me\s+)?(?:aquecer|esquentar)\b/.test(clause)
      || /\b(?:voces|equipe|recepcao|funcionarios?)\s+(?:(?:pode|podem|poderia|poderiam|consegue|conseguem)\s+)?(?:aquecer|esquentar|aquecem|esquentam)\b/.test(clause)
      || /^(?:por favor[, ]+)?(?:aqueca|aquecam|esquente|esquentem)\b/.test(clause)
      || /\b(?:pode|poderia|consegue)\s+(?:me\s+)?(?:aquecer|esquentar)\s+(?:(?:a|o)\s+)?(?:minha|meu|nossa|nosso)\b/.test(clause)
      || /\b(?:quero|preciso|gostaria|solicito)\s+que\s+(?:voces\s+)?(?:aquecam|esquentem)\b/.test(clause);
    const delivery = /\b(?:trazer|traga|tragam|levar|leve|levem|entregar|entregue|entreguem)\b/.test(clause)
      && !/\b(?:eu posso|posso|consigo|vou)\s+(?:aquecer|esquentar|levar|trazer)\b/.test(clause);
    if ((directedHeating || delivery) && (food.test(clause) || appliance.test(clause) || delivery)) return true;
  }
  return false;
}

/** Narrow, current facility FAQ. Other equipment, photos, service requests,
 * visitor permission, maintenance and bookings retain their own handling. */
export function guestFacilityInquiry(message: string): 'copa_baby' | undefined {
  const s = normalize(message);
  if (!s || guestFacilityServiceRequest(s) || media.test(s) || unrelatedHeating.test(s)) return;
  if (/\b(?:forno|fogao|geladeira|refrigerador|adaptad[oa]|acessibilidade|cadeirante|cozinhar|preparar refeicoes)\b/.test(s)) return;
  if (/\b(?:nao (?:estou|esta|estao|estamos|sou|e|somos) hospedad[oa]s?|nao hospedes?|visitantes?)\b/.test(s)) return;
  if (/\b(?:atendente|humano|reclamacao|reembolso|paguei|cobrado|cobrada)\b/.test(s)) return;
  if (/\b(?:reservar|cotar|orcamento|confirmar reserva)\b/.test(s)) return;
  if (/\b(?:quebrad[oa]|com defeito|nao funciona|nao esta funcionando|nao aquece|nao esquenta|parou de funcionar|manutencao|consertar)\b/.test(s)) return;
  if (/\b(?:nao quero|nao preciso|nao precisamos|desisti|dispenso|cancele)\b/.test(s)) return;
  if (appliance.test(s) || copa.test(s) || heat.test(s) && food.test(s)) return 'copa_baby';
}

/** Only owner-confirmed facts. Even a question about a room gets the actual
 * confirmed location, without asserting presence or absence in that room. */
export function guestFacilityAnswer(message: string): string | undefined {
  if (guestFacilityInquiry(message) !== 'copa_baby') return;
  return 'Os hóspedes podem usar o micro-ondas da copa baby para aquecer alimentos, sem horário específico de uso.';
}
