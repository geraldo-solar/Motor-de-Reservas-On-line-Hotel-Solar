import {getNightlyPrice} from './pricing.js';

type MotorRoom={id?:string;name?:string;base_price?:number;overrides?:Array<{dateIso?:string;date_iso?:string;price?:number;noCheckIn?:boolean;noCheckOut?:boolean;isClosed?:boolean}>};
type MotorPackage={start_iso_date?:string;end_iso_date?:string;room_prices?:Array<{roomId?:string;room_id?:string;price?:number}>;full_period_discount_pct?:number};
export function requiresFullPackagePeriod(pkg:{name?:string;start_iso_date?:string;full_period_required?:boolean;no_checkin_dates?:string[]}):boolean {
  const flags=pkg.no_checkin_dates||[];
  return !flags.includes('__FULL_PERIOD_FREE__')&&(pkg.full_period_required===true||flags.includes('__FULL_PERIOD_REQUIRED__')
    ||String(pkg.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes('reveillon')&&String(pkg.start_iso_date||'').endsWith('-12-31'));
}
const day=(iso:string)=>new Date(iso+'T12:00:00Z');
export function motorStayRestriction(room:MotorRoom,checkIn:string,checkOut:string):'check_in'|'check_out'|'closed'|undefined {
  const overrides=room.overrides||[];
  const on=(date:string)=>overrides.find(o=>(o.dateIso||o.date_iso)===date);
  if(on(checkIn)?.noCheckIn)return 'check_in';
  if(on(checkOut)?.noCheckOut)return 'check_out';
  if(overrides.some(o=>o.isClosed&&(o.dateIso||o.date_iso||'')>=checkIn&&(o.dateIso||o.date_iso||'')<checkOut))return 'closed';
}

/** Same nightly tariffs, rounding and exact-period discount as the public
 * motor/BookingForm. This does not inspect stock or confirm availability. */
export function motorStayPrice(room:MotorRoom,checkIn:string,checkOut:string,pkg?:MotorPackage):number {
  const from=day(checkIn),to=day(checkOut),nights=(to.getTime()-from.getTime())/86400000;
  if(!Number.isInteger(nights)||nights<1||nights>30)return NaN;
  const exact=pkg?.start_iso_date===checkIn&&pkg?.end_iso_date===checkOut;
  const fixed=exact?Number(pkg?.room_prices?.find(p=>(p.roomId||p.room_id)===room.id)?.price||0):0;
  let total=0;
  for(let i=0;i<nights;i++){
    const date=new Date(from.getTime()+i*86400000);
    // Local noon preserves the ISO calendar day for the public pricing helper,
    // independent of the server's time zone and of Brazil's UTC offset.
    const local=new Date(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate(),12);
    total+=getNightlyPrice({name:room.name||'',price:Number(room.base_price),
      overrides:(room.overrides||[]).map(o=>({...o,dateIso:o.dateIso||o.date_iso}))} as Parameters<typeof getNightlyPrice>[0],local);
  }
  total=fixed>0?fixed:Math.round(total);
  const discount=exact?Number(pkg?.full_period_discount_pct||0):0;
  return total-Math.round(total*Math.max(0,Math.min(100,discount))/100);
}
