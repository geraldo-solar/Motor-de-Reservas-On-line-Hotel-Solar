import {readPackageContext} from './packageContext.js';
import {possibleCompanionInquiry,possibleCompanionAnswer} from './possibleCompanion.js';
import {explicitLodgingRequest} from './guestInquiry.js';

const norm=(s:string)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const months=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const monthNames='jan(?:eiro)?|fev(?:ereiro)?|mar(?:co)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?';
type DayMonth={day:number;month:number;year?:number};
function calendarParts(message:string):DayMonth[] {
  const date=new RegExp(`\\b(?:(\\d{4})-(\\d{2})-(\\d{2})|(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?|(\\d{1,2})\\s*(?:de\\s+)?(${monthNames})(?:\\s+(?:de\\s+)?(\\d{4}))?)\\b(?![\\d/]|\\s+(?:de\\s+)?\\d{4,}\\b)`,'g');
  return [...message.matchAll(date)].map(m=>m[1]
    ? {day:+m[3],month:+m[2],year:+m[1]}
    : m[4] ? {day:+m[4],month:+m[5],...(m[6]?{year:+(m[6].length===2?'20'+m[6]:m[6])}:{})}
    : {day:+m[7],month:months.indexOf(m[8].slice(0,3))+1,...(m[9]?{year:+m[9]}:{})});
}

function validDateRange(dates:DayMonth[]):boolean {
  if(dates.length!==2||dates.some(d=>d.year!==undefined&&(d.year<2000||d.year>2099)))return false;
  const [start,end]=dates;
  // Infer only an omitted year, never repair an explicitly reversed year.
  const crossesYear=end.month<start.month;
  const startYear=start.year??(end.year!==undefined?end.year-(crossesYear?1:0):2000);
  const endYear=end.year??startYear+(crossesYear?1:0);
  const values=dates.map((d,i)=>{
    const date=new Date(Date.UTC(i?endYear:startYear,d.month-1,d.day));
    return date.getUTCMonth()===d.month-1&&date.getUTCDate()===d.day?date.getTime():NaN;
  });
  const nights=(values[1]-values[0])/86400000;
  return Number.isFinite(nights)&&nights>0&&nights<=30;
}

/** Owner-confirmed regular New Year period: 31/12–03/01. Other periods are
 * consultation requests, not denials or approvals. Does not change facts. */
export function newYearDateException(message:string,context?:unknown,now=Date.now()):boolean {
  const s=norm(message),focus=readPackageContext(context,now);
  const named=/\b(?:reveillon|ano novo|virada)\b/.test(s);
  const focused=!!focus&&/\b(?:reveillon|ano novo|virada)\b/.test(norm(focus.name));
  if(!named&&/\b(?:natal|carnaval|pascoa|dia das criancas)\b/.test(s))return false;
  if(/\bnao (?:quero|queremos|vou|vamos|pretendo|pretendemos|posso|podemos|consigo|conseguimos|gostaria|preciso)\b|\b(?:essas?|estas?) datas? nao\b/.test(s))return false;
  if(!/\b(?:periodo|hospedagem|estadia|hospedar|reservar|reserva|entrada|saida|diarias?|noites?|site nao aceita)\b/.test(s))return false;
  const dates=calendarParts(s);
  if(!validDateRange(dates))return false;
  // Without a named/fresh package, only an unequivocal lodging request that
  // crosses December into January establishes a New Year consultation. A
  // table, visitor breakfast, date-only reply or other month must not do so.
  if(!named&&!focused && (!explicitLodgingRequest(message)
    ||dates[0].month!==12||dates[1].month!==1
    ||/\b(?:se|caso|quando) (?:eu |nos )?(?:quiser|quisermos|fizer|fizermos|reservar|reservarmos)\b/.test(s)))return false;
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
