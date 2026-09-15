import { childPolicyQuestion } from './packageChildInquiry.js';
import { createHash } from 'node:crypto';
import { declaredFamilyAges, familyAgeFollowup, normalizeAgeNumbers, withAssignedFamilyAgeUnits } from './familyAges.js';

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
  // Only hashes of accepted incremental changes/age continuations. A replay
  // after another message must not add that same person or age twice.
  applied_increment_hashes?: string[];
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
  if (value.applied_increment_hashes!==undefined && (!Array.isArray(value.applied_increment_hashes)
    || value.applied_increment_hashes.length>40 || value.applied_increment_hashes.some((hash:unknown)=>typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash)))) return;
  return { ...(value.adults===undefined?{}:{adults:value.adults}), ...(value.children===undefined?{}:{children:value.children}),
    ...(value.age_subject==='offspring'?{age_subject:'offspring' as const}:{}),
    ...(value.total===undefined?{}:{total:value.total}),ages_months:[...value.ages_months],updated_at:value.updated_at,
    ...(/^[a-f0-9]{64}$/.test(value.last_message_hash||'')?{last_message_hash:value.last_message_hash}:{}),
    ...(value.applied_increment_hashes?.length?{applied_increment_hashes:[...value.applied_increment_hashes]}:{}),
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
  const total=(s:string)=>/\b(?:pessoas?|hospedes?)\b/.test(s);
  const declared=new RegExp(`^${number}\\s*(?:adult[oa]s?|criancas?|bebes?|filh[oa]s?|pessoas?|hospedes?|casais|casal)\\b|^(?:um )?casal\\b`).test(after);
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

function rememberIncrement(party: FamilyParty, hash: string) {
  party.applied_increment_hashes=[...(party.applied_increment_hashes||[]),hash].slice(-40);
}

/** A sole traveler replaces the whole party, not just an adult component.
 * Keep only the declared total: "uma pessoa" does not supply an age. */
function singleTravelerDeclaration(s: string): 'single' | 'unasserted' | undefined {
  const totals=[...s.matchAll(new RegExp(`\\b${number}\\s*(?:pessoas?|hospedes?)\\b`,'g'))];
  const one=totals.length===1&&quantity(totals[0][1])===1?totals[0]:undefined;
  const singleTotal=!!one&&(new RegExp(`^(?:e |so |apenas |somente )?${number}\\s*(?:pessoas?|hospedes?)[.!]*$`).test(s)
    || /\b(?:para|somos|seremos|sao|sera|so|apenas|somente|total de|ao todo)\s*$/.test(s.slice(0,one.index!)));
  const alone=/^sozinh[oa][.!]*$/.test(s)||/\b(?:vou|irei|viajarei|ficarei|estarei|vou viajar|vou ficar|vou me hospedar)\s+sozinh[oa]\b/.test(s)
    || /\b(?:para\s+(?:(?:a )?minha mae|(?:o )?meu pai|mim|ela|ele)|(?:minha mae|meu pai|ela|ele)\s+(?:vai|ira|viajara))\s+sozinh[oa]\b/.test(s)
    || /\b(?:so|apenas|somente)\s+(?:eu|para mim)(?=[,.;!?]|$|\s+(?:de|entre|no periodo|em)\b)/.test(s);
  if(!singleTotal&&!alone)return;
  // A hypothetical, negated, per-room or per-person amount is not a new group.
  if(/[?]|\b(?:nao|talvez|se|caso|hipoteticamente|poderia|posso|pode|sera que|ou|acho|exemplo|cada|por pessoa|por hospede|capacidade|cabe|cabem)\b/.test(s))return 'unasserted';
  if(/(?:\b(?:e|com)\s+|[,;]\s*)(?:(?:a|o|as|os)\s+)?(?:meu|minha|meus|minhas|outra|outro|esposa|esposo|marido|namorada|namorado|acompanhante)\b/.test(s))return 'unasserted';
  if(/\b(?:criancas?|bebes?|filh[oa]s?|casal|casais|mais|inclu(?:a|ir|i)|adicion(?:a|ar|e)|acrescent(?:a|ar|e))\b/.test(s))return;
  const adults=[...s.matchAll(new RegExp(`\\b${number}\\s*adult[oa]s?\\b`,'g'))];
  if(totals.length>1||totals.some(match=>quantity(match[1])!==1)
    ||adults.length>1||adults.some(match=>quantity(match[1])!==1))return;
  return 'single';
}

/** Explicit replacements are not incremental family components. Only direct,
 * self-contained declarations can retire the previous occupants and ages. */
function replacementFamily(s: string, old: FamilyParty | undefined, now: number, hash: string): FamilyPartyResult | undefined {
  const direct=s.replace(/^(?:(?:no(?: meu| nosso)? caso|nesse caso|neste caso|agora|na verdade|corrigindo|correcao|desta vez|dessa vez)\s*[,;:]?\s*)+/,'')
    .replace(/[.!]+$/,'').trim();
  const fresh={ages_months:[] as number[],updated_at:now,last_message_hash:hash};
  const unchanged=()=>({handled:false,...(old?{party:old}:{})});
  const partner='eu\\s+e\\s+(?:(?:a\\s+)?minha\\s+(?:esposa|companheira|namorada)|(?:o\\s+)?meu\\s+(?:marido|esposo|companheiro|namorado))';
  const onlyPair=new RegExp(`^(?:(?:ira|irao|vai|vao|vou|vamos|iremos|somos|seremos|sera|serao|e|ficaremos)\\s+)?(?:(?:so|apenas|somente)\\s+${partner}|${partner}\\s+(?:apenas|somente))$`).test(direct);
  if(onlyPair)return result({...fresh,adults:2,children:0,total:2});

  const withoutChildren=/^(?:as (?:nossas )?criancas|os (?:nossos )?filhos|as (?:nossas )?filhas) nao (?:vao|irao|vem|virao|viajam|viajarao)(?: (?:mais|conosco|nessa viagem|nesta viagem|desta vez|dessa vez))?$/.exec(direct);
  if(withoutChildren){
    // "Crianças" cannot silently remove adult offspring. If the antecedent
    // is incomplete/conflicting, ask for the remaining group rather than guess.
    const total=old?.total??(old?.adults===undefined?undefined:old.adults+(old.children||0));
    if(!old||old.children===undefined||old.clarification==='party_composition'||total===undefined
      ||old.adults!==undefined&&old.total!==undefined&&old.adults+old.children!==old.total
      ||/criancas/.test(direct)&&(old.ages_months.some(age=>age>=18*12)
        ||old.age_subject==='offspring'&&old.ages_months.length<old.children))
      return result(old?{...old,ages_months:[...old.ages_months],updated_at:now,last_message_hash:hash}:fresh,'party_composition');
    return result({...fresh,...(old.adults===undefined?{}:{adults:old.adults}),children:0,total:total-old.children});
  }

  // A contrast with a complete positive total supersedes the rejected total,
  // but does not reveal who makes up the new party or their ages.
  const people='(?:pessoas?|hospedes?)',verb='(?:nos\\s+)?(?:somos|seremos|sao|serao)';
  const forward=new RegExp(`^${verb}\\s+${number}\\s+${people}\\s*[,;]?\\s*(?:e\\s+)?nao\\s+${number}(?:\\s+${people})?$`).exec(direct);
  const reverse=new RegExp(`^nao\\s+${verb}\\s+${number}\\s+${people}\\s*[,;]\\s*(?:mas\\s+)?${verb}\\s+${number}\\s+${people}$`).exec(direct);
  const contrast=forward||reverse;
  if(contrast){
    const next=quantity(contrast[forward?1:2]),rejected=quantity(contrast[forward?2:1]);
    if(next===rejected)return unchanged();
    const previous=old?.total??(old?.adults===undefined?undefined:old.adults+(old.children||0));
    if(next===previous&&old&&old.clarification!=='party_composition')
      return result({...old,ages_months:[...old.ages_months],updated_at:now,last_message_hash:hash},old.clarification);
    return result({...fresh,total:next});
  }
  // Do not let the ordinary count parser select one side of a hypothetical,
  // quoted third-party statement, question or malformed numeric correction.
  if(new RegExp(`\\b(?:${verb}|sejam|sejamos|fossem|fossemos|seria|seriam)\\s+${number}\\s+${people}\\b`).test(s)
    &&new RegExp(`\\bnao\\s+(?:${verb}\\s+)?${number}\\b`).test(s))return unchanged();
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
  if(old?.applied_increment_hashes?.includes(messageHash)) {
    // After an intervening change, identical wording may be either a replay
    // or a genuine change of plans (add → remove → add). Neither applying it
    // again nor silently treating the old group as complete is safe.
    return result({...old,ages_months:[...old.ages_months],updated_at:now,last_message_hash:messageHash},
      familyAgeFollowup(s)?'age_reference':'party_composition');
  }
  if(childPolicyQuestion(s))return {handled:false,...(old?{party:old}:{})};
  const replacement=replacementFamily(s,old,now,messageHash);
  if(replacement)return replacement;
  const contrast=contrastingComposition(s);
  if(!contrast.message)return result({ages_months:[],updated_at:now,last_message_hash:messageHash},'party_composition');
  s=contrast.message;
  const single=singleTravelerDeclaration(s);
  if(single==='unasserted')return {handled:false,...(old?{party:old}:{})};
  if(single==='single')return result({total:1,ages_months:[],updated_at:now,last_message_hash:messageHash});
  const correction=contrast.corrected||/\b(?:na verdade|corrigindo|correcao|me enganei|quis dizer)\b/.test(s);
  const childMatches=[...s.matchAll(new RegExp(`\\b${number}\\s*(?:criancas?|bebes?|filh[oa]s?)\\b`,'g'))];
  const adultMatches=[...s.matchAll(new RegExp(`\\b${number}\\s*adult[oa]s?\\b`,'g'))];
  const totalMatches=[...s.matchAll(new RegExp(`\\b${number}\\s*(?:pessoas?|hospedes?)\\b`,'g'))];
  const contextualTotal=(old||validCount(knownTotal)&&Number(knownTotal)>0)
    ? new RegExp(`^nos(?:\\s+somos)?\\s+${number}[.!?]?$`).exec(s) : null;
  const hasTotal=totalMatches.length>0||!!contextualTotal;
  const pluralCouple=[...s.matchAll(new RegExp(`\\b${number}\\s*casais\\b`,'g'))].find(match=>!roomLinkedCouple(s,match.index!));
  const oneCouple=/^(?:casal)(?:\s*(?:[.!?]|$)|\s+(?:e|com)\b)/.test(s)
    || [...s.matchAll(/(?:[:,;]\s*|\b(?:na verdade|corrigindo)\s+)casal(?=\s*(?:[.!?]|$)|\s+(?:e|com)\b)/g)].some(match=>!roomLinkedCouple(s,match.index!))
    || [...s.matchAll(/\b(?:somos|para|vai|um|1)\s+casal\b/g)].some(match=>/^somos\s/.test(match[0])||!roomLinkedCouple(s,match.index!));
  const couple=pluralCouple?quantity(pluralCouple[1]):oneCouple?1:undefined;
  const offspringMention=/\bfilh[oa]s?\b/.test(s);
  const unspecifiedOffspring=offspringMention&&!childMatches.length
    && (adultMatches.length>0||couple!==undefined||/^(?:e |com )?(?:nossos? |nossas? |meus? |minhas? )?filh[oa]s\b/.test(s));
  const noChildren=/\b(?:sem criancas?|so adultos|apenas adultos|nao (?:temos|tenho) criancas?)\b/.test(s);
  const countDeclaration=childMatches.length>0||adultMatches.length>0||hasTotal||couple!==undefined||noChildren||unspecifiedOffspring;
  // Negative statements and comparisons do not declare the mentioned count.
  if(/\b(?:como|igual a) (?:um|uma|\d+) adult/.test(s)) return {handled:false,...(old?{party:old}:{})};
  // A complete list directly answering pending ages can omit "anos". Require
  // a known group and exactly one entry per child: a lone number, partial
  // list, date, hypothetical or unresolved composition must stay ambiguous.
  const pendingList=normalizeAgeNumbers(s).replace(/[.!]$/,'').trim();
  const knownPartyTotal=old?.total??(old?.adults===undefined?undefined:old.adults+(old.children||0));
  const completePendingList=!countDeclaration&&!!old?.children&&old.ages_months.length<old.children
    &&old.clarification!=='party_composition'&&knownPartyTotal!==undefined&&knownPartyTotal>=old.children
    &&(old.adults===undefined||old.total===undefined||old.adults+old.children===old.total)
    &&/^\d{1,3}(?:\s*(?:,|e)\s*\d{1,3}){1,19}$/.test(pendingList)
    &&pendingList.split(/\s*(?:,|e)\s*/).length===old.children;
  const ageText=withAssignedFamilyAgeUnits(completePendingList?`${pendingList} anos`:s,childMatches.some(match=>quantity(match[1])>0)
    || !!old?.children&&old.ages_months.length<old.children);
  const ageValues=declaredFamilyAges(ageText,countDeclaration);
  const ageOnly=!countDeclaration&&familyAgeFollowup(ageText);
  const barePendingAge=!!old?.children&&old.ages_months.length<old.children&&/^\d{1,3}[.!]?$/.test(s);
  if(!countDeclaration && !(ageOnly&&old?.children) && !barePendingAge) return {handled:false,...(old?{party:old}:{})};
  const party:FamilyParty=old?{...old,ages_months:[...old.ages_months],updated_at:now,last_message_hash:messageHash}:{ages_months:[],updated_at:now,last_message_hash:messageHash};
  if(barePendingAge)return result(party,'age_reference');
  if(adultMatches.length>1||totalMatches.length>1) return result(party,'party_composition');
  const component=[...childMatches,...adultMatches].sort((a,b)=>a.index!-b.index!)[0];
  const componentPrefix=component?s.slice(0,component.index!).trim():'';
  const componentSuffix=component?s.slice(component.index!+component[0].length):'';
  const subtract=!!component && (/\b(?:menos|retir(?:a|ar|e)|remov(?:a|er|e)|exclu(?:a|ir|i))\s*$/.test(componentPrefix)
    || /^\s*(?:de\s+\d+\s*(?:anos?|meses?)\s*)?nao\s+(?:vai|vem|ira|vao|irao)(?:\s+mais)?\b/.test(componentSuffix));
  // A couple is counted separately from adultMatches. In "1 casal mais 3
  // filhos", the first counted component is therefore "3 filhos", but
  // "mais" joins a complete composition; it is not an incremental child.
  // A capacity question after that declaration does not invalidate its ages.
  const coupleComposition=couple!==undefined&&!adultMatches.length
    && /\b(?:casal|casais)\s+(?:e\s+)?mais\s*$/.test(componentPrefix);
  if(coupleComposition) {
    const prefix=componentPrefix.replace(/\b(?:no meu caso|no nosso caso|nesse caso|neste caso)\b/g,'');
    if(/\b(?:nao|se|caso|talvez|hipoteticamente|supondo|poderia|poderiamos|seria|seriam|acho)\b/.test(prefix)
      ||/\b(?:talvez|hipoteticamente|supondo)\b/.test(componentSuffix))return result(party,'party_composition');
  }
  const add=!!component&&!coupleComposition && /\b(?:mais|adicion(?:a|ar|e)|acrescent(?:a|ar|e)|inclu(?:a|ir|i))\s*$/.test(componentPrefix);
  if(add||subtract) {
    // A delta is not a replacement family. Apply only an explicit operation
    // against known counts; questions and alternatives need clarification.
    if(!old||old.clarification==='party_composition'||childMatches.length>1||adultMatches.length>1
      || /[?]|\b(?:talvez|acho|se|poderia|pode|posso|sera|ou)\b/.test(s)
      || add&&!subtract&&/\bnao\b/.test(s)
      || childMatches.length&&old.children===undefined||adultMatches.length&&old.adults===undefined)
      return result(party,'party_composition');
    const childDelta=childMatches.length?quantity(childMatches[0][1]):0;
    const adultDelta=adultMatches.length?quantity(adultMatches[0][1]):0;
    const nextChildren=(old.children||0)+(subtract?-childDelta:childDelta);
    const nextAdults=(old.adults||0)+(subtract?-adultDelta:adultDelta);
    if(childDelta+adultDelta<1||childDelta>20||adultDelta>60
      || !validCount(nextChildren,20)||!validCount(nextAdults,60))return result(party,'party_composition');
    if(childDelta&&(ageValues.some(age=>!validCount(age,1440))||ageValues.length>childDelta))return result(party,'child_ages');
    if(childMatches.length)party.children=nextChildren;
    if(adultMatches.length)party.adults=nextAdults;
    if(hasTotal)party.total=quantity(totalMatches[0]?.[1]||contextualTotal![1]);
    else if(old.total!==undefined)party.total=old.total+(subtract?-1:1)*(childDelta+adultDelta);
    if(offspringMention)party.age_subject='offspring';
    if(childDelta) {
      if(subtract) {
        // Without the removed children's ages, the remaining age list cannot
        // safely be guessed. Keep the new count and ask for those ages.
        const remaining=[...old.ages_months];
        let identified=ageValues.length===childDelta;
        for(const age of ageValues) {
          const index=remaining.indexOf(age);
          if(index<0){identified=false;break;}
          remaining.splice(index,1);
        }
        party.ages_months=identified?remaining:[];
      } else party.ages_months.push(...ageValues);
    }
    rememberIncrement(party,messageHash);
    return result(party,party.children!==undefined&&party.ages_months.length<party.children?'child_ages':undefined);
  }
  // "Sem crianças" does not remove adult offspring from the party. Without
  // a replacement count, keep their slots (or clarify an explicit correction).
  if(old?.age_subject==='offspring'&&old.children&&!childMatches.length&&!unspecifiedOffspring) {
    if(noChildren&&!adultMatches.length&&couple===undefined&&!hasTotal)
      return result(party,correction?'party_composition':old.clarification);
    // A new adult count may include the adult offspring already counted. Do
    // not add it to those same people unless the composition is disambiguated.
    if(adultMatches.length&&!noChildren)return result(party,'party_composition');
  }
  // "4 adultos, incluindo 2 filhos adultos" is a subset, not six people.
  // Leave that overlapping description for clarification rather than sum it.
  if(childMatches.length&&adultMatches.length&&/\b(?:incluindo|dentre|entre eles|dos quais|sendo)\b/.test(s)
    && offspringMention)return result(party,'party_composition');
  if(hasTotal)party.total=quantity(totalMatches[0]?.[1]||contextualTotal![1]);
  if(correction&&countDeclaration||childMatches.length&&quantity(childMatches[0][1])!==old?.children
    || adultMatches.length&&quantity(adultMatches[0][1])!==old?.adults||couple!==undefined&&2*couple!==old?.adults)
    delete party.applied_increment_hashes;
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
  if(correction&&unspecifiedOffspring&&!hasTotal) {
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
  if(!hasTotal&&!explainsTotal&&(correction&&countDeclaration||adultMatches.length||couple!==undefined))delete party.total;
  if(ageValues.length) {
    if(ageValues.some(age=>!validCount(age,1440))||party.children===undefined||ageValues.length>party.children)return result(party,'child_ages');
    if(childMatches.length||ageValues.length===party.children||party.children===1)party.ages_months=ageValues;
    else if(correction) {party.ages_months=[];return result(party,'age_reference');}
    else if(party.ages_months.length===0) {
      party.ages_months=ageValues;
      rememberIncrement(party,messageHash);
    }
    else if(party.ages_months.length<party.children&&ageValues.length===1&&/\b(?:a outra|o outro|outra crianca|outro bebe)\b/.test(s)) {
      party.ages_months.push(ageValues[0]);
      rememberIncrement(party,messageHash);
    }
    else return result(party,'age_reference');
  }
  if(old?.clarification==='party_composition'&&party.adults===undefined&&party.children===undefined)
    return result(party,'party_composition');
  return result(party,party.children!==undefined&&party.ages_months.length<party.children?'child_ages':undefined);
}
