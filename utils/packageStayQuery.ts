import {readPackageContext} from './packageContext.js';
const norm=(s:string)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export type PackageStayQuery={package_id:string;check_in:string;check_out:string;at:number;price_requested?:boolean};
const date=(y:number,m:number,d:number)=>{
  const value=new Date(Date.UTC(y,m-1,d,12));
  return y>=2000&&y<2100&&value.getUTCMonth()===m-1&&value.getUTCDate()===d?value.toISOString().slice(0,10):undefined;
};
const range=(a?:string,b?:string)=>!!a&&!!b&&b>a&&(Date.parse(b)-Date.parse(a))/86400000<=30;
export function readPackageStayQuery(value:any,context:unknown,now=Date.now()):PackageStayQuery|undefined {
  const focus=readPackageContext(context,now);
  if(!focus||value?.package_id!==focus.id||!Number.isFinite(value.at)||value.at>now||now-value.at>30*60000
    ||![value.check_in,value.check_out].every(v=>typeof v==='string'&&/^20\d\d-\d\d-\d\d$/.test(v)&&date(+v.slice(0,4),+v.slice(5,7),+v.slice(8))===v)
    ||!range(value.check_in,value.check_out))return;
  return {package_id:focus.id,check_in:value.check_in,check_out:value.check_out,at:value.at,...(value.price_requested===true?{price_requested:true}:{})};
}
export const packageStayPriceRequest=(text:string)=>/\b(?:quanto|valor|valores|preco|precos|custa|custaria|ficaria|calcular|calcule|simular|simule|simulacao|orcamento|cotacao|mais barato|mais economico)\b/.test(norm(text))
  && !/\b(?:fotos?|inclus[oa]|inclui|cafe|ceia|passeio|barco|cama extra|taxa|early|late)\b/.test(norm(text));

/** Fresh customer-established package context supplies omitted month/year.
 * This query is not acceptance of an exception, availability or a booking. */
export function packageStayDates(text:string,context:unknown,now=Date.now(),previous?:unknown):PackageStayQuery|undefined {
  const focus=readPackageContext(context,now);if(!focus)return;
  const prior=readPackageStayQuery(previous,context,now);
  let s=norm(text);
  if(/\b(?:nao|outra viagem|outro assunto|natal|carnaval|pascoa|mesa|restaurante|cafe|anos|meses|programacao|manha|madrugada|cedo)\b/.test(s))return;
  if(!/\b(?:chegar|chegando|sair|saindo|entrada|saida|diarias?|noites?|hospedagem|estadia|periodo|reservar|ficar|dia|de \d)\b/.test(s))return;
  const words:Record<string,number>={'trinta e um':31,'trinta':30,'vinte e nove':29,'vinte e oito':28,'vinte e sete':27,'vinte e seis':26,'vinte e cinco':25,'vinte e quatro':24,'vinte e tres':23,'vinte e dois':22,'vinte e um':21,'vinte':20,'dezenove':19,'dezoito':18,'dezessete':17,'dezesseis':16,'quinze':15,'quatorze':14,'treze':13,'doze':12,'onze':11,'dez':10,'nove':9,'oito':8,'sete':7,'seis':6,'cinco':5,'quatro':4,'tres':3,'dois':2,'primeiro':1,'um':1};
  // Do not rewrite month abbreviations: spoken "dez" is recognized only
  // following an explicit day/arrival/departure word.
  for(const [word,value] of Object.entries(words)){
    if(word==='dez')s=s.replace(/\b(dia|chegar|sair) dez\b/g,'$1 10');
    else s=s.replace(new RegExp(`\\b${word}\\b`,'g'),String(value));
  }
  const monthNames=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const matches=[...s.matchAll(/\b(?:(20\d\d)-(\d\d)-(\d\d)|(\d{1,2})\/(\d{1,2})(?:\/(20\d\d|\d{2}))?|(\d{1,2})\s*(?:de\s+)?(jan(?:eiro)?|fev(?:ereiro)?|mar(?:co)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)(?:\s+(?:de\s+)?(20\d\d))?)\b(?![\d/]|\s+(?:de\s+)?\d{4,}\b)/g)];
  const startYear=+focus.start_date.slice(0,4),startMonth=+focus.start_date.slice(5,7);
  let dates:(string|undefined)[]=[];
  if(matches.length===2)dates=matches.map(m=>{
    const month=m[1]?+m[2]:m[4]?+m[5]:monthNames.indexOf(m[8].slice(0,3))+1;
    const year=m[1]||m[6]||m[9];
    return date(year?+(year.length===2?'20'+year:year):startYear+(month<startMonth-6?1:month>startMonth+6?-1:0),month,+(m[3]||m[4]||m[7]));
  });
  else if(!matches.length){
    const arrival=s.match(/\b(?:chegar|chegando|entrada|ficar)\s+(?:no\s+)?(?:dia\s+)?(\d{1,2})\b/);
    const exit=s.match(/\b(?:sair|saindo|saida)\s+(?:no\s+)?(?:dia\s+)?(\d{1,2})\b/);
    const pair=s.match(/\b(?:dia|dias|periodo\s+(?:de|do))\s+(\d{1,2})\s*(?:a|ate|ao)\s*(?:o\s+)?(?:dia\s+)?(\d{1,2})\b/);
    const first=arrival?.[1]||pair?.[1],last=exit?.[1]||pair?.[2];
    if(prior&&!!first!==!!last){
      const reference=first?prior.check_in:prior.check_out;
      const changed=date(+reference.slice(0,4),+reference.slice(5,7),+(first||last));
      dates=first?[changed,prior.check_out]:[prior.check_in,changed];
    }
    if(first&&last){
      const options:{a:string;b:string;distance:number}[]=[];
      for(let delta=-1;delta<=1;delta++){
        const month=new Date(Date.UTC(startYear,startMonth-1+delta,1));
        const a=date(month.getUTCFullYear(),month.getUTCMonth()+1,+first);
        const endMonth=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+(+last<=+first?1:0),1));
        const b=date(endMonth.getUTCFullYear(),endMonth.getUTCMonth()+1,+last);
        if(a&&b&&range(a,b))options.push({a,b,distance:Math.abs(Date.parse(a)-Date.parse(focus.start_date))+Math.abs(Date.parse(b)-Date.parse(focus.end_date))});
      }
      options.sort((a,b)=>a.distance-b.distance);
      if(options[0]&&options[0].distance<=30*86400000)dates=[options[0].a,options[0].b];
    }
  }
  if(dates.length!==2||!range(dates[0],dates[1]))return;
  if(/\b(?:excecao|excessao|excepcional)\b/.test(s)
    &&!(dates[0]!<=focus.start_date&&dates[1]!>=focus.end_date))return;
  if(Math.abs(Date.parse(dates[0]!)-Date.parse(focus.start_date))>30*86400000
    ||Math.abs(Date.parse(dates[1]!)-Date.parse(focus.end_date))>30*86400000)return;
  return {package_id:focus.id,check_in:dates[0]!,check_out:dates[1]!,at:now};
}
