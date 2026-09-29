import { familyAgeFollowup, normalizeAgeNumbers } from './familyAges.js';
import {possibleCompanionInquiry} from './possibleCompanion.js';

type ChildPolicyPackage = {
  name?: string;
  description?: string;
  includes?: string[];
  benefits?: string[];
};

const normalize = (value: string) => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const childWords = /\b(?:criancas?|bebes?|filh[oa]s?|menores?|politica infantil)\b/;
const otherService = /\b(?:day[ -]?use|restaurante|cardapio|cafe(?: da manha)?|almoco|jantar|ceia|recreacao|monitoria|passeio|barco|ingresso)\b/;
const media = /\b(?:fotos?|imagens?|fotografias?|galeria|videos?)\b/;

/** A tariff/policy question is not a statement that there is "one adult". */
export function childPolicyQuestion(message: string): boolean {
  const s = normalize(message);
  // A possible future companion must be discussed as an unconfirmed person;
  // "filho" + "pagar" alone must not replace that request with child policy.
  if(possibleCompanionInquiry(message))return false;
  const quoteWithParty=/\b(?:cotacao|orcamento|diarias?|hospedagem|estadia)\b/.test(s)
    && /\b(?:(?:\d+|um|uma|dois|duas|tres|quatro|cinco|seis)\s*adult[oa]s?|casal)\b/.test(s)
    && /\b(?:(?:\d+|um|uma|dois|duas|tres|quatro|cinco|seis)\s*(?:criancas?|bebes?|filh[oa]s?)|filh[oa]s)\b/.test(s);
  const childCharge=/\b(?:paga|pagam|pagar|cobranca|cobrado|cobrada|cortesia|gratis|gratuidade|gratuito|gratuita|free|isencao|desconto)\b/.test(s)
    || /\b(?:conta|considerad[ao]|cobrad[ao])\b.{0,35}\badult[oa]\b/.test(s);
  // A question mark or the price of lodging does not erase a simultaneously
  // declared party. Explicit child-charge questions retain the policy guard.
  if(quoteWithParty&&!childCharge)return false;
  return childWords.test(s) && !otherService.test(s) && !media.test(s)
    && (/\b(?:paga|pagam|pagar|cobranca|cobrado|cobrada|cortesia|gratis|gratuidade|gratuito|gratuita|free|isencao|desconto|valores?|precos?|tarifas?)\b/.test(s)
      || /\b(?:conta|considerad[ao]|cobrad[ao])\b.{0,35}\badult[oa]\b/.test(s));
}

/** Only call as a continuation of a fresh, identified package. Never a count. */
export function childAgeFollowup(message: string): boolean {
  const s = normalize(message);
  if (!s || s.length > 140 || media.test(s) || otherService.test(s)) return false;
  return familyAgeFollowup(s);
}

const clean = (value: unknown, limit: number) => String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, limit);

function catalogChildConditions(pkg: ChildPolicyPackage) {
  const entries = [String(pkg.description || ''), ...(pkg.includes || []), ...(pkg.benefits || [])]
    .flatMap(value => String(value).split(/\n+|(?<=[.!?;])\s+/)).map(value => clean(value, 500)).filter(Boolean);
  const candidates = entries.filter(value => {
    const s = normalize(value);
    return childWords.test(s) && !otherService.test(s)
      && /\b(?:cortesia|gratis|gratuidade|gratuit[oa]s?|free|isencao|isent[oa]s?|pagam?|cobranca|cobrad[oa]s?|tarifas?|descontos?|precos?|valores?)\b/.test(s);
  });
  // Catalog prose is quoted data, never an instruction to the model or a
  // calculation. Unclear/unsafe clauses require review instead of an override.
  const safe = candidates.filter(value => !/\b(?:ignore|ignorar|desconsidere|instrucoes|prompt|system|cupom|codigo|senha|token|chave|vagas?|disponibilidade)\b|https?:|www\.|@|\b(?:\d[.\s-]*){11,}\b/i.test(normalize(value)));
  return {present:candidates.length > 0, lines:[...new Set(safe)].slice(0, 2)};
}

/**
 * Informational only. Source: Knowledge_Base.md "Regras de Crianças" and the
 * hotel regulation: ages 0–6, at most one child per apartment. The source does
 * not define an adult-equivalent tariff, a second-child price or a discount.
 */
export function packageChildReply(pkg: ChildPolicyPackage, message: string): string {
  const name = clean(pkg.name, 150) || 'pacote consultado';
  const conditions = catalogChildConditions(pkg);
  const base = 'A regra geral de hospedagem prevê cortesia para crianças de 0 a 6 anos, limitada a 1 criança por apartamento.';
  const s = normalizeAgeNumbers(message);
  const older = [...s.matchAll(/\b(\d{1,2})\s*anos?\b/g)].map(match => Number(match[1])).find(age => age >= 7 && age <= 17);
  // Package prices are per accommodation. Answer the asked age first, in
  // plain words, whenever the catalogue repeats the general 0–6 rule.
  const sameAsGeneral = conditions.lines.length > 0 && conditions.lines.every(line => /\b(?:ate|0 a) 6 anos\b/.test(normalize(line)));
  // A single stated age up to 6 is answered directly too; several ages do
  // not each receive the one-per-apartment courtesy.
  const stated = [...s.matchAll(/\b(\d{1,2})\s*(anos?|meses?)\b/g)];
  const younger = stated.length === 1 && (/^mes/.test(stated[0][2]) ? Number(stated[0][1]) < 84 : Number(stated[0][1]) <= 6) ? stated[0] : undefined;
  const direct = older !== undefined
    ? `Com ${older} anos, a criança já não entra na cortesia: ela conta como hóspede normal e ocupa uma vaga no apartamento. Os valores do ${name} são por acomodação, conforme a categoria que comporta o grupo.\n\n`
    : younger ? `Com ${younger[1]} ${younger[2]}, a criança não paga a hospedagem: fica em cortesia, limitada a 1 criança de até 6 anos por apartamento.\n\n` : '';
  if (conditions.present && !sameAsGeneral) {
    const specific = conditions.lines.length
      ? `O ${name} informa esta condição específica para crianças:\n${conditions.lines.map(line => `• ${line}`).join('\n')}\n\nEla prevalece sobre a regra geral quando se aplica à hospedagem desse pacote.`
      : `Há uma condição infantil cadastrada para o ${name} que precisa ser esclarecida pela recepção antes de aplicar a regra geral.`;
    return `${specific}\n\n${base} Não apliquei desconto nem alterei valores. A recepção confirma o enquadramento do grupo nas condições do pacote, sem reserva ou disponibilidade confirmada.`;
  }
  const ageNote = older === undefined ? '' : ` A idade de ${older} anos está fora dessa faixa de cortesia.`;
  return `${direct}Sobre crianças no ${name}: ${base}${ageNote}\n\nO limite não dá cortesia automaticamente a todas as crianças do grupo. Não há desconto infantil cadastrado para outras idades; a recepção confirma qualquer condição específica do pacote. Crianças continuam contando na ocupação do apartamento. Esta orientação é informativa e não confirma reserva nem disponibilidade.`;
}
