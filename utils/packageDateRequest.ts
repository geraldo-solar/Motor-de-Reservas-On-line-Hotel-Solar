import {readPackageContext,newTripRequest} from './packageContext.js';

export type PackageDateRequest={package_id:string;text:string;at:number};
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const packageDateRequestRefused=(message:string)=>/\b(?:nao\s+(?:precisa|preciso|precisamos|quero|queremos|aceito|aceitamos|desejo|desejamos|autorizo|abra|consulte|solicite|vou|vamos)|desisti|esqueca|esquece)\b/.test(norm(message))
  &&/\b(?:excecao|excessao|periodo diferente|datas? diferentes?)\b/.test(norm(message));

/** An exceptional-period question is context for reception, never stay facts. */
export function packageDateRequest(message:string,context:unknown,now=Date.now()):PackageDateRequest|undefined {
  const focus=readPackageContext(context,now),s=norm(message);
  if(!focus||newTripRequest(message)||message.length>500||/@|\b(?:\d[.\s-]*){11,}\b/.test(message))return;
  if(!/\b(?:reveillon|ano novo|virada)\b/.test(norm(focus.name)))return;
  if(!/\b(?:excecao|excessao|excepcional|datas? diferentes?|outro periodo)\b/.test(s))return;
  if(packageDateRequestRefused(message))return;
  const named=/\b(?:reveillon|ano novo|virada|natal|carnaval|pascoa|dia das criancas)\b/.exec(s)?.[0];
  if(named&&!norm(focus.name).includes(named)&&!(/reveillon|ano novo|virada/.test(named)&&/reveillon|ano novo|virada/.test(norm(focus.name))))return;
  if(/\b\d{1,2}\s*(?:a|ate|ao|-)\s*\d{1,2}\s*(?:anos?|meses?)\b/.test(s))return;
  if(!/\b\d{1,2}\/\d{1,2}\b/.test(s)&&!/\b(?:dias?|periodo|datas?|entrada|saida)\b/.test(s))return;
  if(!/\b\d{1,2}(?:\/\d{1,2}(?:\/20\d{2})?)?\s*(?:a|ate|ao|-)\s*\d{1,2}(?:\/\d{1,2}(?:\/20\d{2})?)?\b/.test(s))return;
  return {package_id:focus.id,text:message.trim(),at:now};
}

export function readPackageDateRequest(value:any,context:unknown,now=Date.now()):PackageDateRequest|undefined {
  if(!value||!Number.isFinite(value.at)||value.at<=0||value.at>now||now-value.at>30*60000
    ||typeof value.text!=='string')return;
  const request=packageDateRequest(value.text,context,now);
  return request&&request.package_id===value.package_id?{...request,at:value.at}:undefined;
}

export const packageDateRequestAnswer='O pacote regular de Réveillon é de 31/12 a 03/01. Podemos consultar a recepção sobre o período diferente que você pediu; essa exceção depende de avaliação e disponibilidade. O pedido fica registrado nesta conversa, sem confirmar as datas, valores ou uma reserva.';
