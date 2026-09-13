// Customer-declared dates only. Never consult the catalogue or recover dates
// from assistant text, old quotes or an unbounded conversation history.
const norm=(s:string)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\bhj\b/g,'hoje').replace(/\s+/g,' ').trim();
const months=['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const weekdays=['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
const recent=(at:unknown,now:number)=>typeof at==='number'&&Number.isFinite(at)&&at>0&&at<=now&&now-at<=30*60000;
const iso=(day:number,month:number,year:number)=>{const d=new Date(Date.UTC(year,month-1,day,12));return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day?d.toISOString().slice(0,10):undefined;};
const validDate=(s:unknown):s is string=>typeof s==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(s)&&iso(+s.slice(8),+s.slice(5,7),+s.slice(0,4))===s;
const day=(now:number)=>new Date(now-3*3600000).toISOString().slice(0,10);
const excluded=(s:string)=>/\b(?:nao|se|caso|hipoteticamente|restaurante|reserva solar|cardapio|menu|cafe|almoco|jantar|day[ -]?use|passeio|barco|festa|evento|aniversario|fotos?|imagens?|videos?|programacao|pagamento|comprovante|horarios?|que horas|politica|regras?|inclui|incluso)\b/.test(s);
export type SplitStayDatePending={at:number;reason:'split_dates';days:[number,number];month?:number;year?:number;weekday_span?:[number,number]};
export function readSplitStayDates(value:any,now=Date.now()):SplitStayDatePending|undefined{
  if(value?.reason!=='split_dates'||!recent(value.at,now)||!Array.isArray(value.days)||value.days.length!==2
    ||!value.days.every((d:unknown)=>Number.isInteger(d)&&Number(d)>=1&&Number(d)<=31)||value.days[0]===value.days[1])return;
  if(value.month!==undefined&&(!Number.isInteger(value.month)||value.month<1||value.month>12||!Number.isInteger(value.year)||value.year<2000||value.year>2099
    ||!iso(value.days[0],value.month,value.year)||!iso(value.days[1],value.month,value.year)))return;
  if(value.weekday_span!==undefined&&(!Array.isArray(value.weekday_span)||value.weekday_span.length!==2
    ||!value.weekday_span.every((d:unknown)=>Number.isInteger(d)&&Number(d)>=0&&Number(d)<=6)))return;
  return {at:value.at,reason:'split_dates',days:[...value.days] as [number,number],
    ...(value.month===undefined?{}:{month:value.month,year:value.year}),...(value.weekday_span?{weekday_span:[...value.weekday_span] as [number,number]}:{})};
}
const pair=(s:string)=>/^(?:dias?\s+)?(\d{1,2})\s*(?:e|a|ate)\s*(\d{1,2})[.!?]*$/.exec(s);
const monthReply=(s:string)=>new RegExp(`^(?:(?:de|do mes de|mes de|em)\\s+)?(${months.join('|')})(?:\\s+(?:de\\s+)?(20\\d{2}))?[.!?]*$`).exec(s);
const span=(s:string)=>new RegExp(`^(${weekdays.join('|')})(?:-feira)?\\s*(?:a|ate)\\s*(${weekdays.join('|')})(?:-feira)?[.!?]*$`).exec(s);
export function splitStayFollowup(message:string,value:unknown,now=Date.now()):boolean{
  if(!readSplitStayDates(value,now))return false;
  const s=norm(message);
  return !!pair(s)||!!monthReply(s)||!!span(s)||/^(?:oi|ola|bom dia|boa tarde|boa noite|isso)[.!?]*$/.test(s)
    ||/^(?:\d{1,2}|uma?|duas?|tres)\s+(?:diarias?|noites?|dias?)[.!?]*$/.test(s);
}
export function splitStayDates(message:string,value:unknown,allowStart:boolean,now=Date.now()):{handled:boolean;pending?:SplitStayDatePending;dates?:[string,string];invalid?:boolean}{
  const s=norm(message);let pending=readSplitStayDates(value,now);
  const days=pair(s);
  if(days&&(pending||allowStart)){
    if(pending&&pending.days[0]===+days[1]&&pending.days[1]===+days[2])return {handled:true,pending};
    pending=readSplitStayDates({at:now,reason:'split_dates',days:[+days[1],+days[2]]},now);
    return pending?{handled:true,pending}:{handled:true,invalid:true};
  }
  if(!pending)return {handled:false};
  const month=monthReply(s);
  if(month){
    let year=Number(month[2]||day(now).slice(0,4));const m=months.indexOf(month[1])+1;
    if(!month[2]&&(iso(pending.days[0],m,year)||'')<day(now))year++;
    const updated=readSplitStayDates({...pending,month:m,year,at:now},now);
    return updated?{handled:true,pending:updated}:{handled:true,invalid:true};
  }
  const weekday=span(s);
  if(weekday)return {handled:true,pending:{...pending,at:now,weekday_span:[weekdays.indexOf(weekday[1]),weekdays.indexOf(weekday[2])]}};
  // A declared overnight count settles the meaning of the day pair only when
  // it exactly matches the candidate period. "Two days" is still ambiguous.
  const duration=/^(\d{1,2}|uma?|duas?|tres)\s+(diarias?|noites?)[.!?]*$/.exec(s);
  if(duration&&pending.month&&pending.year){
    const count=({um:1,uma:1,dois:2,duas:2,tres:3} as Record<string,number>)[duration[1]]||Number(duration[1]);
    const start=iso(pending.days[0],pending.month,pending.year)!;const end=iso(pending.days[1],pending.month,pending.year)!;
    const nights=(Date.parse(end+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000;
    const matchesWeekdays=!pending.weekday_span||pending.weekday_span.every((d,i)=>new Date([start,end][i]+'T12:00:00Z').getUTCDay()===d);
    if(nights>=1&&nights<=30&&count===nights&&matchesWeekdays)return {handled:true,dates:[start,end]};
    return {handled:true,pending};
  }
  return {handled:false};
}
export function splitStayQuestion(pending:SplitStayDatePending):string{
  if(!pending.month)return `Você se refere aos dias ${pending.days[0]} e ${pending.days[1]}? De qual mês? Depois confirmamos quais serão a entrada e a saída.`;
  const label=(d:number)=>`${String(d).padStart(2,'0')}/${String(pending.month).padStart(2,'0')}/${pending.year}`;
  const nights=pending.days[1]-pending.days[0];
  if(nights<1)return 'Para não presumir uma virada de mês, pode informar as datas completas de entrada e saída no formato dia/mês?';
  if(pending.weekday_span&&pending.weekday_span.some((d,i)=>new Date(iso(pending.days[i],pending.month!,pending.year!)+'T12:00:00Z').getUTCDay()!==d))
    return 'Os dias do mês e os dias da semana informados não correspondem entre si. Pode confirmar a entrada e a saída completas no formato dia/mês?';
  return `Você informou os dias ${label(pending.days[0])} e ${label(pending.days[1])}. Se forem entrada e saída, são ${nights} ${nights===1?'diária':'diárias'}. Quantas diárias deseja? Não considerei esses dias como duas noites automaticamente.`;
}
export function declaredRelativeStay(message:string,now=Date.now()):{dates:[string,string];morning:boolean}|undefined{
  const s=norm(message);
  if(excluded(s)||/\bsem hospedagem\b/.test(s)||! /\b(?:valor|preco|cotacao|orcamento|hospedagem|estadia|quartos?|duplo|apartamentos?|quero|queria|preciso|gostaria)\b/.test(s))return;
  const entry=/\b(?:ir|entrar|entrada|chegar|chego|entro|de|desde)\s+(hoje|amanha|depois de amanha)\b/.exec(s);
  const exit=new RegExp(`\\b(?:sair|saida|saio|ate)\\s+(?:(?:na|no)\\s+)?(${weekdays.join('|')})(?:-feira)?\\b`).exec(s);
  if(!entry||!exit||entry.index>=exit.index)return;
  const start=new Date(day(now)+'T12:00:00Z');start.setUTCDate(start.getUTCDate()+({hoje:0,amanha:1,'depois de amanha':2}[entry[1]]!));
  const distance=(weekdays.indexOf(exit[1])-start.getUTCDay()+7)%7;
  if(distance===0)return; // Same weekday has two plausible meanings; clarify.
  const end=new Date(start);end.setUTCDate(end.getUTCDate()+distance);
  return {dates:[start.toISOString().slice(0,10),end.toISOString().slice(0,10)],morning:/\b(?:de|pela|na) manha\b/.test(s.slice(entry.index+entry[0].length,exit.index))};
}
export type ArrivalTimePending={at:number;check_in:string;check_out:string;status:'time_needed'|'human_review';minutes?:number};
export function readArrivalTime(value:any,facts:any,now=Date.now()):ArrivalTimePending|undefined{
  if(!value||!recent(value.at,now)||!validDate(value.check_in)||!validDate(value.check_out)||value.check_out<=value.check_in
    ||value.check_in!==facts?.check_in||value.check_out!==facts?.check_out||!['time_needed','human_review'].includes(value.status))return;
  if(value.minutes!==undefined&&(!Number.isInteger(value.minutes)||value.minutes<0||value.minutes>=14*60))return;
  return {at:value.at,check_in:value.check_in,check_out:value.check_out,status:value.status,...(value.minutes===undefined?{}:{minutes:value.minutes})};
}
export function arrivalTimeReply(message:string):number|'unknown'|undefined{
  const s=norm(message);
  if(/^(?:nao sei(?: ainda)?|ainda nao sei|nao sabemos(?: ainda)?|nao tenho horario|sem horario definido)[.!?]*$/.test(s))return 'unknown';
  const m=/^(?:(?:as|chego|chegaremos|chegarei|vamos chegar|pretendo chegar|por volta das|umas)\s+)?(\d{1,2})(?:(?:h|:)(\d{2})?)?(?:\s*(?:horas?|h))?(?:\s+(?:da|de|pela)\s+(manha|tarde|noite))?[.!?]*$/.exec(s);
  if(!m)return;let hour=+m[1];const minutes=+(m[2]||0);
  if(m[3]&&hour>12||hour>23||minutes>59||m[3]==='manha'&&hour===12)return;
  if((m[3]==='tarde'||m[3]==='noite')&&hour<12)hour+=12;
  return hour*60+minutes;
}
export const arrivalTimeQuestion='Você pretende chegar pela manhã. O check-in normal é a partir das 14h; para usar o apartamento entre 06h e antes das 14h, a entrada antecipada custa R$250 e depende de disponibilidade. Antes das 06h, é cobrada uma diária, também sob disponibilidade. Qual é o horário previsto de chegada? Ainda não há garantia de liberação do apartamento.';
export const arrivalTimeHandoff='Vou chamar a recepção para conferir a possibilidade de entrada antecipada e orientar sobre o horário e a cobrança aplicável. O apartamento ainda não está liberado nem há confirmação de disponibilidade por aqui.';
