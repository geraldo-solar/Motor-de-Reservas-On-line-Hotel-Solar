export type ExtraRecord = {id:string; name?:string; price?:number; image_url?:string; imageUrl?:string; active?:boolean};
export const normalizeExtra = (v:string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const EXTRA_MEDIA_CODES = ['BARCO','MESA','LUA','BIKE','PARQUE','PISCINA'] as const;
const SERVICE_CODES = ['BARCO','MESA','LUA','BIKE'];
export const extraPhotoRequest = (text:string) => /\b(fotos?|fotografias?|imagem|imagens|galeria|album)\b/.test(normalizeExtra(text));
export const extraCodes = (text:string) => {
  const s=normalizeExtra(text);
  return Object.entries({BARCO:/\bbarco\b|catamara/,MESA:/mesa posta/,LUA:/lua de mel|kit celebracao|kit romantico/,BIKE:/biciclet|\bbikes?\b/,PARQUE:/\b(parque infantil|parquinhos?|playground)\b/,PISCINA:/\bpiscinas?\b/})
    .map(([code,re])=>({code,index:s.search(re)})).filter(match=>match.index>=0).sort((a,b)=>a.index-b.index).map(match=>match.code);
};
export const extraCode = (name:string) => extraCodes(name)[0];
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
  if(code==='PISCINA') return 'Piscinas do Hotel Solar 📷';
  if(code==='BIKE') return '🚲 Bicicletas\nCortesia gratuita da Cia. Marítima e do Hotel Solar, exclusiva para hóspedes. Retirada na recepção mediante formulário.';
  if(code==='BARCO') return 'Passeio de barco\nPasseio pelos manguezais, com saída no trapiche do hotel e parada na Praia Ponta do Espadarte. Duração aproximada de 2h, na maré cheia.\n'+(includedBoat?'Já incluído no pacote informado, sem cobrança adicional.':'R$ 350,00 por grupo de até 4 pessoas. Para mais participantes, a recepção confirma o valor.');
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
