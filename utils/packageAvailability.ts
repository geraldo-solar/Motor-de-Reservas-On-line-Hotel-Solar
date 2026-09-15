// Commercial catalog projection only. Historical bookings and source records
// are not deleted when an offer ends.
export const packageToday=(now=Date.now())=>new Date(now-3*3600000).toISOString().slice(0,10);
const validDate=(value:unknown):value is string=>typeof value==='string'&&/^20\d\d-\d\d-\d\d$/.test(value)
  &&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
type Period={active?:boolean;start_iso_date?:string;end_iso_date?:string;end_date?:string};
export function packageEnded(pkg:Period|undefined,now=Date.now()):boolean {
  const end=pkg?.end_iso_date||pkg?.end_date;return validDate(end)&&end<packageToday(now);
}
export function currentPackage(pkg:Period,now=Date.now()):boolean {
  return pkg.active!==false&&validDate(pkg.start_iso_date)&&validDate(pkg.end_iso_date)
    &&pkg.end_iso_date>pkg.start_iso_date&&!packageEnded(pkg,now);
}
export const endedPackageMarker='[pacote_encerrado]';
export const endedPackageAnswer='Esse pacote já foi encerrado e não faz mais parte das ofertas atuais. Não vou reutilizar os preços ou a programação antigos. Posso consultar os pacotes vigentes para você.';
const norm=(s:string)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
/** Remove the retired 2026 Independence offer, not the holiday in future years. */
export function retiredIndependence(message:string,now=Date.now()):boolean {
  if(packageToday(now)<='2026-09-07')return false;
  const s=norm(message),years:string[]=s.match(/\b20\d\d\b/g)||[];
  if(years.length&&!years.includes('2026'))return false;
  return /\bindependencia\b|\b(?:0?7|sete)\s+(?:de\s+)?setembro\b|\b07\/09(?:\/2026)?\b|1f8c71b5-a692-4fbc-a155-01d12251b223/.test(s);
}
