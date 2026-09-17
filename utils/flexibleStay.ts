import {calendarDateMention,readStayDuration,stayDurationRequest} from './stayDuration.js';
import {familyAccommodation,familyAgeQuestionFor,baseRoomCapacity} from './familyAccommodation.js';
import {motorStayPrice,motorStayRestriction,requiresFullPackagePeriod} from './motorStayPricing.js';
import {packageToday} from './packageAvailability.js';

export type FlexibleOption={check_in:string;check_out:string;room:string;total:number};
export type FlexibleResults={at:number;key:string;options:FlexibleOption[];compared:number};
export type FlexibleStay={at:number;month?:string;nights?:number;weekdays_only?:boolean;room?:string;
  issue?:'window'|'duration'|'constraints';results?:FlexibleResults};
const norm=(s:string)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const months=['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const counts:Record<string,number>={uma:1,um:1,duas:2,dois:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10};
const optionPattern=/^(?:(?:quero|prefiro|escolho|pode ser|fico com) )?(?:a |o )?(?:(primeira|segunda|terceira)(?: opcao)?|opcao ([123])|([123]))[.!]?$/;
const recent=(at:unknown,now:number)=>typeof at==='number'&&at>0&&at<=now&&now-at<=30*60000;
const day=(iso:string)=>new Date(iso+'T12:00:00Z');
const add=(iso:string,n:number)=>new Date(day(iso).getTime()+n*86400000).toISOString().slice(0,10);
const dateOK=(s:unknown):s is string=>typeof s==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(day(s).getTime())&&day(s).toISOString().slice(0,10)===s;
const monthOK=(s:unknown):s is string=>typeof s==='string'&&/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(s);
const roomOK=(s:unknown)=>typeof s==='string'&&['loft','suite casal','suite triplo','suite quadruplo','suite varanda terreo','suite sacada vista mar'].includes(s);
const windowFor=(month:string,now:number)=>({from:[month+'-01',packageToday(now)].sort().at(-1)!,
  to:new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0,12)).toISOString().slice(0,10)});
const nearMonth=(month:string,now:number)=>{
  const today=packageToday(now),distance=(Number(month.slice(0,4))-Number(today.slice(0,4)))*12+Number(month.slice(5))-Number(today.slice(5,7));
  return distance>=0&&distance<=12;
};
export function readFlexibleStay(value:any,now=Date.now()):FlexibleStay|undefined{
  if(!value||!recent(value.at,now))return;
  const s:FlexibleStay={at:value.at};
  if(monthOK(value.month))s.month=value.month;
  if(Number.isInteger(value.nights)&&value.nights>=1&&value.nights<=30)s.nights=value.nights;
  if(value.weekdays_only===true)s.weekdays_only=true;
  if(roomOK(value.room))s.room=value.room;
  if(['window','duration','constraints'].includes(value.issue))s.issue=value.issue;
  // Result validation also needs the current party; the controller does that
  // only after loading facts and family ages. No model prose supplies results.
  return s;
}
export function flexibleStayKey(search:FlexibleStay,state:any,now=Date.now()):string{
  return JSON.stringify([search.month,search.nights,!!search.weekdays_only,search.room||'',state?.facts?.guests,
    familyAccommodation(state,state?.facts?.guests||0,now).key||'',state?.facts?.children_pending===true,
    [...state?.facts?.extras||[]].sort()]);
}
export function readFlexibleResults(value:any,search:FlexibleStay,state:any,now=Date.now()):FlexibleResults|undefined{
  if(!recent(value?.at,now)||value.key!==flexibleStayKey(search,state,now)||!search.month||!search.nights
    ||!Number.isInteger(value.compared)||value.compared<0||value.compared>31||!Array.isArray(value.options)||value.options.length>3)return;
  const {from,to}=windowFor(search.month,now);
  if(!value.options.every((o:any)=>dateOK(o?.check_in)&&dateOK(o?.check_out)&&o.check_in>=from&&o.check_out<=to
    &&add(o.check_in,search.nights!)===o.check_out&&typeof o.room==='string'&&o.room.length>0&&o.room.length<=80
    &&Number.isFinite(o.total)&&o.total>0))return;
  return {at:value.at,key:value.key,compared:value.compared,options:value.options.map((o:any)=>({check_in:o.check_in,check_out:o.check_out,room:o.room,total:o.total}))};
}

/** Bounded monthly comparison, not an availability search or a chosen stay. */
export function updateFlexibleStay(message:string,previous:FlexibleStay|undefined,duration:any,context:boolean,familyFollowup=false,now=Date.now()):FlexibleStay|undefined{
  const s=norm(message);
  if(calendarDateMention(s))return; // Concrete dates go through normal quoting.
  if(/\b(?:restaurante|reserva solar|cardapio|cafe|almoco|jantar|day[ -]?use|massagem|massagens|passeio|piscina|fotos?|imagem|imagens|eventos?|casamento|aniversario|reveillon|carnaval|pacote)\b/.test(s))return;
  if(/\b(?:se eu|se nos|caso|hipoteticamente)\b|\bnao (?:quero|queremos|vou|vamos|preciso|desejo)\b|\b(?:mesmas? datas?|mesmo periodo|sem mudar)\b/.test(s))return;
  const cheap=/\b(?:mais (?:barat[oa]s?|economic[oa]s?|em conta)|menor(?:es)? (?:valor|valores|preco|precos|tarifa|tarifas))\b/.test(s);
  const time=/\b(?:datas?|periodos?|mes|meses|semana|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/.test(s);
  const lodging=/\b(?:diarias?|hospedagem|estadia|quartos?|suites?|loft|pessoas|hospedes)\b/.test(s);
  const request=cheap&&time&&(context||lodging)&&!/\b(?:por que|porque|costuma|costumam|geralmente|regra)\b/.test(s);
  const durationNow=stayDurationRequest(s,now);
  const shortDuration=previous&&!previous.nights&&/^(?:serao? |por )?(\d{1,2}|uma|um|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez)[.!]?$/.exec(s);
  const monthTerms=[...s.matchAll(new RegExp(`\\b(${months.join('|')})\\b`,'g'))];
  const relativeMonth=/\b(?:n?este|n?esse|deste|desse|neste|nesse|este|esse) mes\b|\bmes atual\b/.test(s);
  const nextMonth=/\b(?:proximo mes|mes que vem)\b/.test(s);
  const monthly=monthTerms.length>0||relativeMonth||nextMonth;
  const option=optionPattern.test(s);
  const followup=previous&&(monthly||durationNow||shortDuration||familyFollowup||option||/^(?:sim|nao|isso|qualquer data|meio de semana|durante a semana|e no loft|no loft|quero o loft|tente novamente|tentar novamente|pode tentar|consulte novamente)[.!?]*$/.test(s));
  if(!request&&!followup)return;
  const result:FlexibleStay={...previous,at:now};delete result.results;
  if(request&&!previous){const recentDuration=readStayDuration(duration,now);if(recentDuration?.unit==='nights')result.nights=recentDuration.count;}
  if(durationNow){
    if(durationNow.unit==='nights'){result.nights=durationNow.count;if(result.issue==='duration')delete result.issue;}
    else {delete result.nights;result.issue='duration';}
  }else if(shortDuration){const n=counts[shortDuration[1]]||Number(shortDuration[1]);if(n>=1&&n<=30){result.nights=n;if(result.issue==='duration')delete result.issue;}}
  if(/\b(?:\d{1,3}|uma|um|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez) (?:diarias?|noites?)\b/.test(s)&&!durationNow){delete result.nights;result.issue='duration';}
  if(/\b(?:\d{1,2}|uma|um|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez)(?: (?:diarias?|noites?))? ou (?:\d{1,2}|uma|um|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez) (?:diarias?|noites?)\b/.test(s)){delete result.nights;result.issue='duration';}
  if(monthly){
    delete result.month;if(result.issue==='window'||result.issue==='constraints')delete result.issue;
    const current=packageToday(now),yearMatch=s.match(/\b(20\d{2})\b/);
    if(monthTerms.length+(relativeMonth?1:0)+(nextMonth?1:0)!==1)result.issue='window';
    else if(relativeMonth)result.month=current.slice(0,7);
    else if(nextMonth)result.month=new Date(Date.UTC(Number(current.slice(0,4)),Number(current.slice(5,7)),1,12)).toISOString().slice(0,7);
    else result.month=`${yearMatch?.[1]||current.slice(0,4)}-${String(months.indexOf(monthTerms[0][1])+1).padStart(2,'0')}`;
    if(result.month&&!nearMonth(result.month,now)){delete result.month;result.issue='window';}
  }
  if(/\b(?:meio de semana|durante a semana|dias? uteis)\b/.test(s))result.weekdays_only=true;
  if(/\b(?:qualquer dia|incluindo (?:o )?fim de semana|todos os dias)\b/.test(s))delete result.weekdays_only;
  if(/\bloft\b/.test(s))result.room='loft';
  for(const name of ['casal','triplo','quadruplo','varanda terreo','sacada vista mar'])if(s.includes('suite '+name))result.room='suite '+name;
  if(/\b(?:qualquer categoria|todas as categorias|qualquer quarto)\b/.test(s))delete result.room;
  // Never silently expand a narrower request we cannot represent yet.
  if(/\b(?:semana que vem|proxima semana|fim de semana|final de semana|so (?:na|no)|apenas (?:na|no)|entre os dias|a partir do dia|ate o dia|fora de feriados|sem feriados|exceto feriados)\b/.test(s)
    &&!/incluindo (?:o )?fim de semana/.test(s))result.issue='constraints';
  if(previous?.results&&JSON.stringify([result.month,result.nights,result.room,result.weekdays_only,result.issue])===JSON.stringify([previous.month,previous.nights,previous.room,previous.weekdays_only,previous.issue]))result.results=previous.results;
  return result;
}
export function flexibleStayQuestion(search:FlexibleStay,state:any,now=Date.now()):string|undefined{
  if(search.issue==='constraints')return 'Para essa restrição de dias, informe um período de entrada e saída para eu simular, ou diga o mês em que posso comparar todas as datas.';
  if(!search.month||search.issue==='window'||!nearMonth(search.month,now))return 'Em qual mês você pode se hospedar? Vou comparar as datas com menor valor; não precisa escolher uma data exata.';
  if(!search.nights||search.issue==='duration')return 'Quantas diárias (noites) você deseja? Assim posso comparar estadias com a mesma duração no mês informado.';
  if(!state?.facts?.guests||state?.family_clarification==='party_composition')return 'Para quantas pessoas será a hospedagem? Se houver crianças, informe também as idades.';
  if(state.facts.children_pending||familyAccommodation(state,state.facts.guests,now).pending)return familyAgeQuestionFor(state);
  if(state.facts.guests>4+Math.min(1,familyAccommodation(state,state.facts.guests,now).eligible))return 'Para esse grupo, a recepção precisa comparar a distribuição em vários apartamentos. Posso chamar a equipe, ou você pode ligar para (91) 98100-0800.';
}
export function flexibleStaySelection(message:string,search:FlexibleStay,state:any,now=Date.now()):FlexibleOption|undefined{
  const results=readFlexibleResults(search.results,search,state,now);
  if(!results||flexibleStayQuestion(search,state,now))return;
  const match=optionPattern.exec(norm(message));
  if(!match)return;
  const n=match[1]?['primeira','segunda','terceira'].indexOf(match[1]):Number(match[2]||match[3])-1;
  return results.options[n];
}
export function compareFlexibleStays(search:FlexibleStay,state:any,rooms:any[],packages:any[],now=Date.now()):FlexibleResults{
  if(flexibleStayQuestion(search,state,now))throw Error('Incomplete flexible stay search');
  const {from,to}=windowFor(search.month!,now),guests=state.facts.guests;
  const family=familyAccommodation(state,guests,now),all:FlexibleOption[]=[];
  let compared=0;
  for(let entry=from;add(entry,search.nights!)<=to;entry=add(entry,1)){
    const exit=add(entry,search.nights!);
    if(search.weekdays_only&&Array.from({length:search.nights!},(_,i)=>day(add(entry,i)).getUTCDay()).some(d=>d<1||d>4))continue;
    const overlap=packages.filter(p=>p.active!==false&&dateOK(p.start_iso_date)&&dateOK(p.end_iso_date)&&entry<p.end_iso_date&&exit>p.start_iso_date);
    if(overlap.some(p=>requiresFullPackagePeriod(p)&&(entry>p.start_iso_date||exit<p.end_iso_date)
      ||p.no_checkin_dates?.includes(entry)||p.no_checkout_dates?.includes(exit)))continue;
    const exact=overlap.find(p=>p.start_iso_date===entry&&p.end_iso_date===exit);
    const candidates=rooms.filter(r=>r.active!==false&&typeof r.name==='string'&&r.name.length<=80
      &&baseRoomCapacity(Number(r.capacity))>0&&baseRoomCapacity(Number(r.capacity))+Math.min(1,family.eligible)>=guests
      &&(!search.room||norm(r.name)===search.room)&&!motorStayRestriction(r,entry,exit))
      .map(r=>({check_in:entry,check_out:exit,room:r.name,total:motorStayPrice(r,entry,exit,exact)}))
      .filter(o=>Number.isFinite(o.total)&&o.total>0).sort((a,b)=>a.total-b.total||a.room.localeCompare(b.room));
    compared++;
    if(candidates[0])all.push(candidates[0]);
  }
  all.sort((a,b)=>a.total-b.total||a.check_in.localeCompare(b.check_in)||a.room.localeCompare(b.room));
  return {at:now,key:flexibleStayKey(search,state,now),options:all.slice(0,3),compared};
}
export function flexibleStayAnswer(search:FlexibleStay,state:any,now=Date.now()):string{
  const question=flexibleStayQuestion(search,state,now);if(question)return question;
  const results=readFlexibleResults(search.results,search,state,now);
  if(!results)return 'Vou comparar os valores cadastrados no motor para esse mês e essa duração, sem confirmar disponibilidade.';
  if(!results.options.length)return 'Não encontrei uma simulação compatível com esses critérios e as restrições cadastradas no motor. Isso não comprova falta de vagas. Quer consultar outro mês ou falar com a recepção pelo (91) 98100-0800?';
  const money=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),label=(s:string)=>s.split('-').reverse().join('/');
  const {from,to}=windowFor(search.month!,now);
  return `Comparei ${results.compared} períodos para ${state.facts.guests} hóspedes e ${search.nights} ${search.nights===1?'diária':'diárias'}, com entrada e saída entre ${label(from)} e ${label(to)}${search.weekdays_only?', com noites de segunda a quinta':''}${search.room?', na categoria solicitada':''}. Menores totais encontrados entre as categorias compatíveis:\n\n`
    +results.options.map((o,i)=>`${i+1}. ${label(o.check_in)} a ${label(o.check_out)} — ${o.room}: ${money(o.total)} no total (${money(o.total/search.nights!)} de média por diária).`).join('\n')
    +'\n\nValores somente de hospedagem; extras à parte. Simulação de tarifas, sem confirmação de disponibilidade ou reserva. Qual opção de datas você prefere? Ao escolher, recalculo o período antes de prosseguir.';
}
