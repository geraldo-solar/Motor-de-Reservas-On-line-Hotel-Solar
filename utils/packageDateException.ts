import {readPackageContext} from './packageContext.js';
import {possibleCompanionInquiry,possibleCompanionAnswer} from './possibleCompanion.js';

const norm=(s:string)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const months=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const monthNames='jan(?:eiro)?|fev(?:ereiro)?|mar(?:co)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?';
type DayMonth={day:number;month:number;year?:number};
function calendarParts(message:string):DayMonth[] {
  const iso=[...message.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)];
  if(iso.length)return iso.map(m=>({day:+m[3],month:+m[2],year:+m[1]}));
  const numeric=[...message.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}|\d{2}))?\b/g)];
  if(numeric.length)return numeric.map(m=>({day:+m[1],month:+m[2],...(m[3]?{year:+(m[3].length===2?'20'+m[3]:m[3])}:{})}));
  return [...message.matchAll(new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s+)?(${monthNames})(?:\\s+(?:de\\s+)?(20\\d{2}))?\\b`,'g'))]
    .map(m=>({day:+m[1],month:months.indexOf(m[2].slice(0,3))+1,...(m[3]?{year:+m[3]}:{})}));
}

/** Owner-confirmed regular New Year period: 31/12–03/01. Other periods are
 * consultation requests, not denials or approvals. Does not change facts. */
export function newYearDateException(message:string,context?:unknown,now=Date.now()):boolean {
  const s=norm(message),focus=readPackageContext(context,now);
  const named=/\b(?:reveillon|ano novo|virada)\b/.test(s);
  const focused=!!focus&&/\b(?:reveillon|ano novo|virada)\b/.test(norm(focus.name));
  if(!named&&!focused||!named&&/\b(?:natal|carnaval|pascoa|dia das criancas)\b/.test(s))return false;
  if(/\bnao (?:quero|queremos|vou|vamos|pretendo|pretendemos)\b/.test(s))return false;
  if(!/\b(?:periodo|hospedagem|estadia|hospedar|reservar|reserva|entrada|saida|diarias?|noites?|site nao aceita)\b/.test(s))return false;
  const dates=calendarParts(s);
  if(dates.length!==2||dates.some(d=>{
    const date=new Date(Date.UTC(d.year||2000,d.month-1,d.day));
    return date.getUTCMonth()!==d.month-1||date.getUTCDate()!==d.day;
  }))return false;
  const keys=dates.map(d=>`${d.month}-${d.day}`);
  return !(keys.includes('12-31')&&keys.includes('1-3'));
}

export function packageConsultationReply(message:string,context?:unknown,now=Date.now()):{answer:string;handoff:boolean}|undefined {
  const exception=newYearDateException(message,context,now);
  const companion=possibleCompanionInquiry(message)&&(/\b(?:cama|apartamento|apto|quarto|hospedagem|estadia|reserva|reservar|pacote|reveillon)\b/.test(norm(message))||!!readPackageContext(context,now));
  if(!exception&&!companion)return;
  const period='O pacote regular de Réveillon é de 31/12 a 03/01. O período solicitado é diferente e precisa ser consultado com a recepção. Vou chamar a equipe para verificar a possibilidade, sem confirmar a exceção, disponibilidade ou alteração de reserva.';
  return {answer:[exception?period:'',companion?possibleCompanionAnswer:''].filter(Boolean).join('\n\n'),handoff:exception};
}
