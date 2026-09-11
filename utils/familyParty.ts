import { childPolicyQuestion } from './packageChildInquiry.js';
import { createHash } from 'node:crypto';
import { declaredFamilyAges, familyAgeFollowup } from './familyAges.js';

// Explicit composition only: occupancy is not the number of paying guests.
// Ages have no identities, names, dates of birth or inferred tariff classes.
export type FamilyParty = {
  adults?: number;
  children?: number;
  // Legacy children slots may represent adult offspring. This marker affects
  // wording only; no minority, tariff class or extra occupants are inferred.
  age_subject?: 'offspring';
  total?: number;
  ages_months: number[];
  updated_at: number;
  last_message_hash?: string;
  clarification?: 'party_composition' | 'child_ages' | 'age_reference';
};
export type FamilyPartyResult = {
  handled: boolean;
  party?: FamilyParty;
  guests?: number;
  children_pending?: boolean;
  clarification?: 'party_composition' | 'child_ages' | 'age_reference';
};
const words: Record<string,number> = {zero:0,um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10};
const number = '(\\d{1,2}|zero|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)';
const quantity = (value: string) => /^\d+$/.test(value) ? Number(value) : words[value];
const norm = (value: string) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/\bchds?\b/g,'criancas')
  .replace(/\r/g,'').replace(/([a-z])(\d)/g,'$1 $2').replace(/(\d)([a-z])/g,'$1 $2').trim();
const validCount = (value: unknown, max=60) => Number.isInteger(value) && Number(value)>=0 && Number(value)<=max;

export function readFamilyParty(value: any, now=Date.now()): FamilyParty | undefined {
  if (!value || !Number.isFinite(value.updated_at) || value.updated_at<=0 || value.updated_at>now || now-value.updated_at>30*60000
    || !Array.isArray(value.ages_months) || value.ages_months.length>20
    || value.ages_months.some((age: unknown)=>!validCount(age,1440))) return;
  for (const key of ['adults','children','total']) if(value[key]!==undefined&&!validCount(value[key],key==='children'?20:60))return;
  if (value.adults===undefined&&value.children===undefined&&value.total===undefined&&value.clarification!=='party_composition') return;
  if (value.children===undefined&&value.ages_months.length || value.children!==undefined&&value.ages_months.length>value.children) return;
  return { ...(value.adults===undefined?{}:{adults:value.adults}), ...(value.children===undefined?{}:{children:value.children}),
    ...(value.age_subject==='offspring'?{age_subject:'offspring' as const}:{}),
    ...(value.total===undefined?{}:{total:value.total}),ages_months:[...value.ages_months],updated_at:value.updated_at,
    ...(/^[a-f0-9]{64}$/.test(value.last_message_hash||'')?{last_message_hash:value.last_message_hash}:{}),
    ...(['party_composition','child_ages','age_reference'].includes(value.clarification)?{clarification:value.clarification}:{}) };
}

function roomLinkedCouple(message: string, index: number) {
  const prefix=message.slice(0,index).split(/[.;!?\n]/).at(-1)||'';
  const room=[...prefix.matchAll(/\b(?:quartos?|suites?|apartamentos?|aptos?|acomodac(?:ao|oes)|loft)\b/g)].at(-1);
  return !!room&&!/\b(?:somos|seremos|vamos em|grupo de|ao todo)\b/.test(prefix.slice(room.index!+room[0].length));
}

function contrastingComposition(message: string) {
  const negative=new RegExp(`\\bnao (?:somos|sao|tenho|temos)\\s+${number}\\b`).exec(message);
  if(!negative)return {message,corrected:false};
  const replacements=[...message.matchAll(/[,;.!\n]\s*(?:mas\s+)?(?:na verdade[,]?\s+)?(?:somos|sao|seremos|tenho|temos)\s+/g)]
    .filter(match=>match.index!>negative.index);
  if(replacements.length!==1)return {message:'',corrected:true};
  const replacement=replacements[0];
  const after=message.slice(replacement.index!+replacement[0].length).trim();
  const before=message.slice(negative.index,replacement.index);
  const adults=(s:string)=>/\badult[oa]s?\b|\bcasa(?:l|is)\b/.test(s);
  const children=(s:string)=>/\b(?:criancas?|bebes?|filh[oa]s?)\b/.test(s);
  const total=(s:string)=>/\b(?:pessoas|hospedes)\b/.test(s);
  const declared=new RegExp(`^${number}\\s*(?:adult[oa]s?|criancas?|bebes?|filh[oa]s?|pessoas|hospedes|casais)\\b|^(?:um )?casal\\b`).test(after);
  // Do not mix any rejected count/age into the affirmative replacement.
  // A rejected component without a clear replacement needs a fresh group.
  if(!declared||/[?]|\b(?:ou|talvez|acho|nao)\b/.test(after)
    || adults(before)&&!adults(after)||children(before)&&!children(after)
    || total(before)&&!total(after)&&!(adults(after)&&children(after)))return {message:'',corrected:true};
  return {message:after,corrected:true};
}

function result(party: FamilyParty, clarification?: FamilyPartyResult['clarification']): FamilyPartyResult {
  const composed=party.adults===undefined?undefined:party.adults+(party.children||0);
  const conflict=(party.adults!==undefined&&!validCount(party.adults))||(party.children!==undefined&&!validCount(party.children,20))
    || (party.total!==undefined&&(!validCount(party.total)||party.total===0))
    || (composed!==undefined&&(composed===0||composed>60))
    || party.total!==undefined&&((party.adults!==undefined&&party.children!==undefined&&party.total!==composed)
      || (party.adults||0)+(party.children||0)>party.total);
  const issue=conflict?'party_composition':clarification;
  if(issue)party.clarification=issue;else delete party.clarification;
  const guests=issue==='party_composition'?undefined:party.total??composed;
  return {handled:true,party,...(guests&&guests<=60?{guests}:{}),children_pending:(party.children||0)>party.ages_months.length,
    ...(issue?{clarification:issue}:{} )};
}

/**
 * Call only in a lodging/family fact-collection context. It neither chooses
 * that context nor changes booking facts. The caller owns topic/TTL resets.
 * Every clarification must block treating the new composition as complete.
 */
export function updateFamilyParty(message: string, previous?: unknown, now=Date.now(), knownTotal?: number): FamilyPartyResult {
  let s=norm(message);
  const old=readFamilyParty(previous,now);
  if(!s) return {handled:false,...(old?{party:old}:{})};
  const messageHash=createHash('sha256').update(s).digest('hex');
  if(old?.last_message_hash===messageHash)return result(old,old.clarification);
  if(childPolicyQuestion(s))return {handled:false,...(old?{party:old}:{})};
  const contrast=contrastingComposition(s);
  if(!contrast.message)return result({ages_months:[],updated_at:now,last_message_hash:messageHash},'party_composition');
  s=contrast.message;
  const correction=contrast.corrected||/\b(?:na verdade|corrigindo|correcao|me enganei|quis dizer)\b/.test(s);
  const childMatches=[...s.matchAll(new RegExp(`\\b${number}\\s*(?:criancas?|bebes?|filh[oa]s?)\\b`,'g'))];
  const adultMatches=[...s.matchAll(new RegExp(`\\b${number}\\s*adult[oa]s?\\b`,'g'))];
  const totalMatches=[...s.matchAll(new RegExp(`\\b${number}\\s*(?:pessoas|hospedes)\\b`,'g'))];
  const pluralCouple=[...s.matchAll(new RegExp(`\\b${number}\\s*casais\\b`,'g'))].find(match=>!roomLinkedCouple(s,match.index!));
  const oneCouple=/^(?:casal)(?:\s*(?:[.!?]|$)|\s+(?:e|com)\b)/.test(s)
    || [...s.matchAll(/(?:[:,;]\s*|\b(?:na verdade|corrigindo)\s+)casal(?=\s*(?:[.!?]|$)|\s+(?:e|com)\b)/g)].some(match=>!roomLinkedCouple(s,match.index!))
    || [...s.matchAll(/\b(?:somos|para|vai|um) casal\b/g)].some(match=>match[0].startsWith('somos ')||!roomLinkedCouple(s,match.index!));
  const couple=pluralCouple?quantity(pluralCouple[1]):oneCouple?1:undefined;
  const offspringMention=/\bfilh[oa]s?\b/.test(s);
  const unspecifiedOffspring=offspringMention&&!childMatches.length
    && (adultMatches.length>0||couple!==undefined||/^(?:e |com )?(?:nossos? |nossas? |meus? |minhas? )?filh[oa]s\b/.test(s));
  const noChildren=/\b(?:sem criancas?|so adultos|apenas adultos|nao (?:temos|tenho) criancas?)\b/.test(s);
  const countDeclaration=childMatches.length>0||adultMatches.length>0||totalMatches.length>0||couple!==undefined||noChildren||unspecifiedOffspring;
  // Negative statements and comparisons do not declare the mentioned count.
  if(/\b(?:como|igual a) (?:um|uma|\d+) adult/.test(s)) return {handled:false,...(old?{party:old}:{})};
  const ageValues=declaredFamilyAges(s,countDeclaration);
  const ageOnly=!countDeclaration&&familyAgeFollowup(s);
  const barePendingAge=!!old?.children&&old.ages_months.length<old.children&&/^\d{1,3}[.!]?$/.test(s);
  if(!countDeclaration && !(ageOnly&&old?.children) && !barePendingAge) return {handled:false,...(old?{party:old}:{})};
  const party:FamilyParty=old?{...old,ages_months:[...old.ages_months],updated_at:now,last_message_hash:messageHash}:{ages_months:[],updated_at:now,last_message_hash:messageHash};
  if(barePendingAge)return result(party,'age_reference');
  if(adultMatches.length>1||totalMatches.length>1) return result(party,'party_composition');
  // "Sem crianças" does not remove adult offspring from the party. Without
  // a replacement count, keep their slots (or clarify an explicit correction).
  if(old?.age_subject==='offspring'&&old.children&&!childMatches.length&&!unspecifiedOffspring) {
    if(noChildren&&!adultMatches.length&&couple===undefined&&!totalMatches.length)
      return result(party,correction?'party_composition':old.clarification);
    // A new adult count may include the adult offspring already counted. Do
    // not add it to those same people unless the composition is disambiguated.
    if(adultMatches.length&&!noChildren)return result(party,'party_composition');
  }
  // "4 adultos, incluindo 2 filhos adultos" is a subset, not six people.
  // Leave that overlapping description for clarification rather than sum it.
  if(childMatches.length&&adultMatches.length&&/\b(?:incluindo|dentre|entre eles|dos quais|sendo)\b/.test(s)
    && offspringMention)return result(party,'party_composition');
  if(totalMatches.length)party.total=quantity(totalMatches[0][1]);
  if(adultMatches.length)party.adults=quantity(adultMatches[0][1]);
  else if(couple!==undefined)party.adults=2*couple;
  if(offspringMention&&(childMatches.length||unspecifiedOffspring))party.age_subject='offspring';
  if(childMatches.length) {
    const counts=childMatches.map(match=>quantity(match[1]));
    let count=counts.reduce((sum,n)=>sum+n,0);
    if(counts.length>1&&counts[0]>1) {
      const rest=s.slice(childMatches[0].index!+childMatches[0][0].length);
      if(/^(?:\s*[:,]\s*(?:sendo\s*)?|\s+sendo\s+)/.test(rest)&&counts.slice(1).reduce((sum,n)=>sum+n,0)===counts[0])count=counts[0];
      else if(!/\bmais\b/.test(rest))return result(party,'party_composition');
    }
    if(count>20)return result(party,'party_composition');
    if(party.children!==count||correction)party.ages_months=[];
    party.children=count;
  } else if(noChildren) {party.children=0;party.ages_months=[];delete party.age_subject;}
  // The fallback is for legacy facts without a party. A computed previous
  // total (e.g. two adults before mentioning their offspring) is not a new
  // explicit total against which to reject the added family information.
  const totalFromContext=party.total??(!old&&validCount(knownTotal)&&Number(knownTotal)>0?knownTotal:undefined);
  // Explaining an already stated total does not replace that total with just
  // the parents. The remainder is age-tracked offspring, including adults.
  const explainsTotal=offspringMention&&!correction&&totalFromContext!==undefined;
  if(explainsTotal)party.total=totalFromContext;
  if(correction&&unspecifiedOffspring&&!totalMatches.length) {
    delete party.total;delete party.children;party.ages_months=[];
  }
  if(unspecifiedOffspring) {
    if(party.total!==undefined&&party.adults!==undefined) {
      const remainder=party.total-party.adults;
      if(!validCount(remainder,20)||remainder<1)return result(party,'party_composition');
      if(party.children!==remainder)party.ages_months=[];
      party.children=remainder;
    } else if(party.children===undefined)return result(party,'party_composition');
  }
  // An explicit corrected component invalidates an old total, not another
  // separately known component. A new explicit total stays authoritative.
  if(!totalMatches.length&&!explainsTotal&&(correction&&countDeclaration||adultMatches.length||couple!==undefined))delete party.total;
  if(ageValues.length) {
    if(ageValues.some(age=>!validCount(age,1440))||party.children===undefined||ageValues.length>party.children)return result(party,'child_ages');
    if(childMatches.length||ageValues.length===party.children||party.children===1)party.ages_months=ageValues;
    else if(correction) {party.ages_months=[];return result(party,'age_reference');}
    else if(party.ages_months.length===0)party.ages_months=ageValues;
    else if(party.children===2&&party.ages_months.length===1&&ageValues.length===1&&/\b(?:a outra|o outro|outra crianca|outro bebe)\b/.test(s))party.ages_months.push(ageValues[0]);
    else return result(party,'age_reference');
  }
  if(old?.clarification==='party_composition'&&party.adults===undefined&&party.children===undefined)
    return result(party,'party_composition');
  return result(party,party.children!==undefined&&party.ages_months.length<party.children?'child_ages':undefined);
}
