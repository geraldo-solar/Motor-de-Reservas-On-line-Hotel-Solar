export type ExtraRecord = {id:string; name?:string; price?:number; image_url?:string; imageUrl?:string; active?:boolean};
export const normalizeExtra = (v:string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const extraCodes = (text:string) => {
  const s=normalizeExtra(text);
  return Object.entries({BARCO:/\bbarco\b|catamara/,MESA:/mesa posta/,LUA:/lua de mel|kit celebracao|kit romantico/,BIKE:/biciclet|\bbikes?\b/}).filter(([,re])=>re.test(s)).map(([code])=>code);
};
export const extraCode = (name:string) => extraCodes(name)[0];
// Existing Hotel Solar ManyChat media, visually verified in the named flows.
// The motor's current image takes precedence whenever it is configured.
const MANYCHAT_MEDIA: Record<string,string> = {
  BARCO:'https://manybot-thumbnails.s3.eu-central-1.amazonaws.com/fb156918594386969/ca/big_16d23168ec3efa6761410c2d4ddb80e2.png',
  BIKE:'https://manybot-thumbnails.s3.eu-central-1.amazonaws.com/fb156918594386969/ca/big_ac17283c8e6ce7cd2846389ecd0ee075.jpeg',
};
export const extraImage = (extra?:ExtraRecord,code='') => {
  const image=String(extra?.image_url || extra?.imageUrl || MANYCHAT_MEDIA[code] || '').trim();
  return /^(https:\/\/|\/[^/]|data:image\/)/.test(image) ? image : '';
};
export function extraCaption(code:string,extras:ExtraRecord[],includedBoat=false) {
  const extra=extras.find(e=>extraCode(e.name || '')===code);
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
  const explicitPhoto=/fotos?|imagens|galeria/.test(s);
  const all=/\b(extras|servicos adicionais|servicos extras|experiencias)\b/.test(s);
  const direct=extraCodes(message);
  if(!direct.length && /\b(pacotes?|feriados?|aptos?|apartamentos?|quartos?|loft|suite)\b/.test(s) && /fotos?|imagens|pacotes?|feriados?/.test(s)) return [];
  const source=all ? ['BARCO','MESA','LUA','BIKE'] : direct.length ? direct : extraCodes(assistant);
  return source.filter(code=>explicitPhoto || !requestedBefore.includes(code));
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
  const codes=[...new Set((parts[2]||'').split(','))].filter(c=>['BARCO','MESA','LUA','BIKE'].includes(c));
  if(!codes.length) return {quote_request:'ROOM_DONE',quote_text:'',conversation_text:''};
  const result=extraMediaResult(codes,extras,parts[3]==='INCLUDED');
  return result.photo_codes.length ? result : {quote_request:'ROOM_DONE',quote_text:'',conversation_text:''};
}
