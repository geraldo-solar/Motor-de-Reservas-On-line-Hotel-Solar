export type ExtraRecord = {id:string; name?:string; price?:number; image_url?:string; imageUrl?:string; active?:boolean};
export const normalizeExtra = (v:string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const EXTRA_MEDIA_CODES = ['BARCO','MESA','LUA','BIKE','PARQUE','PISCINA','HIDRO'] as const;
const SERVICE_CODES = ['BARCO','MESA','LUA','BIKE'];
export const extraPhotoRequest = (text:string) => /\b(fotos?|fotografias?|imagem|imagens|galeria|album)\b/.test(normalizeExtra(text));
export const extraCodes = (text:string) => {
  const s=normalizeExtra(text);
  const hydro=/\b(?:piscinas?\s+(?:(?:de|com)\s+)?)?(?:hidromassagem|hidromassagens|hidros?)\b/g;
  // A hydro pool is not the main pool. Mask only its own phrase, keeping
  // offsets and any separately requested main pool in the original order.
  const mainPoolText=s.replace(hydro,match=>' '.repeat(match.length));
  // Remember the explicit all-three subject even in informational questions.
  // requestedExtraCodes still requires photo intent before showing leisure
  // images, and the catalog contains just one photograph of a hydro pool.
  const allPools=/\b(?:todas(?:\s+as)?|tres|3)\s+piscinas\b/.exec(mainPoolText);
  const allPoolsIndex=allPools?allPools.index+allPools[0].lastIndexOf('piscinas'):-1;
  return Object.entries({BARCO:/\bbarco\b|catamara/,MESA:/mesa posta/,LUA:/lua de mel|kit celebracao|kit romantico/,BIKE:/biciclet|\bbikes?\b/,PARQUE:/\b(parque infantil|parquinhos?|playground)\b/,PISCINA:/\bpiscinas?\b/,HIDRO:hydro})
    .map(([code,re])=>{
      let index=(code==='PISCINA'?mainPoolText:s).search(re);
      if(code==='HIDRO'&&allPoolsIndex>=0) index=index<0?allPoolsIndex:Math.min(index,allPoolsIndex);
      return {code,index};
    }).filter(match=>match.index>=0).sort((a,b)=>a.index-b.index).map(match=>match.code);
};
export const extraCode = (name:string) => extraCodes(name)[0];
// A description that merely mentions a third-party boat is not a benefit.
// Use only current catalog fields, never a previous assistant assertion.
export function explicitPackageBoatBenefit(pkg?: { includes?: string[]; benefits?: string[]; description?: string }) {
  const boat = /\bbarco\b|catamara/;
  const affirmative = (value: string) => {
    const text = normalizeExtra(value).replace(/sem (?:cobranca|custo) adicional/g, 'incluido');
    return boat.test(text) && !/\bnao\b|\bsem\b|\bexceto\b|\ba parte\b|cobrad|opcional|sob consulta/.test(text);
  };
  const clauses = (value: string) => value.split(/[.!?;]\s+|\n+/);
  if ([...(pkg?.includes || []), ...(pkg?.benefits || [])].some(value => typeof value === 'string' && clauses(value).some(affirmative))) return true;
  const description = typeof pkg?.description === 'string' ? pkg.description : '';
  return clauses(description).some(clause => affirmative(clause)
    && /(?:\bbarco\b|catamara).{0,70}(?:inclus[oa]|incluid[oa]|sem (?:cobranca|custo) adicional)|(?:inclui|inclus[oa]|incluid[oa]).{0,70}(?:\bbarco\b|catamara)/.test(normalizeExtra(clause)));
}
// Presentation-only: keep package/room/other-extra amounts and catalog records
// intact. Rewrite a boat-specific clause, not the whole commercial message.
export function safeBoatCopy(value: string, includedBoat = false) {
  let boatContext = false;
  return String(value).split(/(\n+|;\s*|[.!?](?!\d)\s*|,\s*(?=(?:passeio|barco|catamarã|kit|mesa|pacote|hospedagem)\b)|\s+e\s+(?=(?:o |a )?(?:passeio|barco|catamarã|kit|mesa|pacote|hospedagem)\b))/i)
    .map(clause => {
      const s = normalizeExtra(clause);
      if (!/[a-z0-9]/.test(s)) return clause;
      const mentionsBoat = /\bbarco\b|catamara/.test(s);
      const continuation = boatContext && !mentionsBoat && /^\s*[•*-]?\s*(?:valor|preco|custo|duracao|horarios?|saida)\s*[:—-]/.test(s);
      if (!mentionsBoat && !continuation) { boatContext = false; return clause; }
      boatContext = true;
      const money = /r\$\s*[\d.,]+|\b\d+(?:[.,]\d+)?\s*reais\b/.test(s);
      const timed = /\b\d+\s*(?:h|horas?|minutos?)\b|mare cheia/.test(s);
      const inclusion = /inclu|sem (?:cobranca|custo) adicional/.test(s);
      // "Pacote R$2500 com barco incluído" is a package amount, not a
      // boat tariff. A separate explicit boat price remains sanitizable.
      const boatAt = continuation ? 0 : s.search(/\bbarco\b|catamara/);
      const before = s.slice(0, boatAt);
      const after = s.slice(boatAt);
      const packageAmount = money && /pacote\b[^$]*\bcom(?: o)? (?:passeio de )?$/.test(before)
        && !/custa|preco|valor|cobrad/.test(after.split(/r\$|\breais\b/)[0]);
      if (packageAmount && !timed) return clause;
      const onlyOtherAmount = money && !/r\$|\breais\b/.test(after)
        && /pacote|kit|mesa posta|hospedagem|diaria/.test(before);
      if (onlyOtherAmount && !timed && (includedBoat || !inclusion)) return clause;
      if (!money && !timed && (includedBoat || !inclusion)) return clause;
      if (onlyOtherAmount) {
        // Preserve the unrelated amount before the boat mention.
        return clause.slice(0, boatAt) + 'barco com terceiros, sob consulta à recepção';
      }
      const previousAmount = /r\$|\breais\b/.test(before) && /pacote|kit|mesa posta|hospedagem|diaria/.test(before);
      const subjectAt = previousAmount ? before.search(/(?:passeio de |extra de |valor do )?$/) : 0;
      const prefix = previousAmount ? clause.slice(0, subjectAt) : clause.match(/^\s*[•*-]?\s*/)?.[0] || '';
      return prefix + (includedBoat
        ? 'Passeio de barco incluído no pacote, sem cobrança adicional; horários, duração e disponibilidade com a recepção'
        : 'Passeio de barco com terceiros, sob consulta; valores, horários, duração e disponibilidade com a recepção');
    }).join('');
}
export function safeBoatPackageCopy<T extends { includes?: string[]; benefits?: string[]; description?: string }>(pkg: T): T {
  const included = explicitPackageBoatBenefit(pkg);
  return { ...pkg,
    ...(pkg.description ? { description: safeBoatCopy(pkg.description, included) } : {}),
    ...(pkg.includes ? { includes: pkg.includes.map(text => safeBoatCopy(text, included)) } : {}),
    ...(pkg.benefits ? { benefits: pkg.benefits.map(text => safeBoatCopy(text, included)) } : {}),
  };
}
// Existing Hotel Solar ManyChat media, visually verified in the named flows.
// The motor's current image takes precedence whenever it is configured.
const MANYCHAT_MEDIA: Record<string,string> = {
  BARCO:'https://manybot-thumbnails.s3.eu-central-1.amazonaws.com/fb156918594386969/ca/big_16d23168ec3efa6761410c2d4ddb80e2.png',
  BIKE:'https://manybot-thumbnails.s3.eu-central-1.amazonaws.com/fb156918594386969/ca/big_ac17283c8e6ce7cd2846389ecd0ee075.jpeg',
};
// Official photos visually verified on 2026-09-08 in estrutura.html, the
// homepage and experiencias.html. This is not a per-message web search.
const OFFICIAL_MEDIA: Record<string,string> = {
  PARQUE:'https://www.hotelsolar.tur.br/assets/images/parquinho.webp',
  PISCINA:'https://www.hotelsolar.tur.br/assets/images/editada-piscina.webp',
  // This photo shows one of the two hydro pools, not both.
  HIDRO:'https://www.hotelsolar.tur.br/assets/images/hidromassagem.webp',
  BIKE:'https://www.hotelsolar.tur.br/assets/images/bike.webp',
};
function validImageUrl(image:string) {
  if (/^\/[^/\s]/.test(image)) return true;
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) return true;
  try {const url=new URL(image);return url.protocol==='https:'&&!!url.hostname&&!url.username&&!url.password;}
  catch {return false;}
}
export const extraImages = (extra?:ExtraRecord,code='') => [...new Set([
  extra?.image_url,extra?.imageUrl,MANYCHAT_MEDIA[code],OFFICIAL_MEDIA[code],
].filter((image):image is string=>typeof image==='string').map(image=>image.trim()).filter(validImageUrl))];
export const extraImage = (extra?:ExtraRecord,code='') => extraImages(extra,code)[0] || '';
export function extraCaption(code:string,extras:ExtraRecord[],includedBoat=false) {
  const extra=extras.find(e=>extraCode(e.name || '')===code);
  if(code==='PARQUE') return 'Parque infantil do Hotel Solar 📷';
  if(code==='PISCINA') return 'Piscina principal do Hotel Solar 📷';
  if(code==='HIDRO') return 'Uma das piscinas de hidromassagem do Hotel Solar 📷';
  if(code==='BIKE') return '🚲 Bicicletas\nCortesia gratuita da Cia. Marítima e do Hotel Solar, exclusiva para hóspedes. Retirada na recepção mediante formulário.';
  if(code==='BARCO') return 'Passeio de barco com terceiros, sob consulta.\n'+(includedBoat
    ? 'Já incluído no pacote informado, sem cobrança adicional. Horários, duração e disponibilidade devem ser consultados com a recepção.'
    : 'Valores, horários, duração e disponibilidade devem ser consultados com a recepção.');
  const price=Number(extra?.price);
  const value=Number.isFinite(price)&&price>=0 ? price.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : 'Valor a confirmar com a recepção';
  if(code==='MESA') return `Mesa Posta\nUma decoração especial para o jantar.\n${value} pela decoração/montagem; o consumo do jantar é cobrado à parte.`;
  return `Kit Lua de Mel/Celebração\nUma preparação especial com decoração, flores, chocolates e espumante.\n${value}.`;
}
export function requestedExtraCodes(message:string,assistant:string,requestedBefore:string[]=[]) {
  const s=normalizeExtra(message);
  if (/nao quero|sem extras|remov|retir|cancel|reclam|reembolso/.test(s)) return [];
  const explicitPhoto=extraPhotoRequest(message);
  const all=/\b(extras|servicos adicionais|servicos extras|experiencias)\b/.test(s);
  const direct=extraCodes(message);
  // Unknown photo subjects must not turn an older assistant offer into an
  // unrelated picture. Context resolution uses customer-derived subjects.
  if(explicitPhoto && !all && !direct.length) return [];
  if(!direct.length && /\b(pacotes?|feriados?|aptos?|apartamentos?|quartos?|loft|suite)\b/.test(s) && (explicitPhoto || /pacotes?|feriados?/.test(s))) return [];
  const source=all ? SERVICE_CODES : direct.length ? direct : extraCodes(assistant).filter(code=>SERVICE_CODES.includes(code));
  // Leisure-space questions keep their informative answer unless the client
  // actually asks for photos. Proactive offers remain limited to the services.
  return source.filter(code=>explicitPhoto || SERVICE_CODES.includes(code) && !requestedBefore.includes(code));
}
export function extraMediaResult(codes:string[],extras:ExtraRecord[],includedBoat=false) {
  const active=extras.filter(e=>e.active!==false);
  const withPhotos=codes.filter(code=>extraImage(active.find(e=>extraCode(e.name||'')===code),code));
  const without=codes.filter(code=>!withPhotos.includes(code));
  const chosen=withPhotos[0];
  const missingText=without.map(code=>extraCaption(code,active,includedBoat)+'\nAinda não há foto cadastrada desse serviço para enviar.').join('\n\n');
  const caption=chosen ? extraCaption(chosen,active,includedBoat)+(missingText?'\n\n'+missingText:'') : missingText;
  return {quote_request:chosen?`EXTRA_ID|${chosen}|${withPhotos.slice(1).join(',')}|${includedBoat?'INCLUDED':'PAID'}`:'ROOM_LIST',quote_text:caption,conversation_text:caption,matched:true,match_type:'extra_media',extra_codes:codes,photo_codes:withPhotos,availability_checked:false};
}
export function nextExtraMedia(reference:string,extras:ExtraRecord[]) {
  const parts=reference.split('|');
  const codes=[...new Set((parts[2]||'').split(','))].filter(c=>EXTRA_MEDIA_CODES.some(code=>code===c));
  if(!codes.length) return {quote_request:'ROOM_DONE',quote_text:'',conversation_text:''};
  const result=extraMediaResult(codes,extras,parts[3]==='INCLUDED');
  return result.photo_codes.length ? result : {quote_request:'ROOM_DONE',quote_text:'',conversation_text:''};
}
