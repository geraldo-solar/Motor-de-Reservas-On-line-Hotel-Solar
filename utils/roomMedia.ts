export type MediaRoom = { id: string; name?: string; images?: unknown; image_urls?: unknown; imageUrls?: unknown;
  capacity?: unknown; description?: unknown; features?: unknown };
const norm = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const photoWords = /\b(fotos?|fotografias?|imagem|imagens|galeria|album)\b/;
const roomAliases = (room: MediaRoom) => [...new Set([norm(room.name || ''),norm(room.name || '').replace(/^suite\s+/, '')])].filter(name=>name.length>=4);
const roomMentioned = (message: string, room: MediaRoom) => roomAliases(room).some(name=>new RegExp(`\\b${name}\\b`).test(message));

// Comparison subjects are not necessarily photo subjects. A later "só do
// Loft" or "não precisa mandar fotos" narrows/cancels media, not comparison.
function requestedPhotoRooms(message: string, mentioned: MediaRoom[]): MediaRoom[] {
  const plain=message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const clauses=plain.split(/[.!?;\n]+|\b(?:mas|porem)\b|,(?=\s*(?:nao|so|apenas|somente)\b)/).map(norm).filter(Boolean);
  const photoRefusal=/\b(?:nao (?:quero|queremos|preciso|precisamos|desejo|desejamos|precisa|precisam)(?:\s+(?:ver|receber|mandar|enviar|de|que|voce|voces|me|nos|as|essas|mais|nenhuma|nenhumas))*|nao (?:mande|envie|mostre)(?:\s+(?:me|nos|as|essas|mais))*|sem(?:\s+(?:as|essas))*)\s+(?:fotos?|fotografias?|imagem|imagens|galeria|album)\b/;
  let selected=mentioned,sawPhoto=false;
  for(const clause of clauses){
    const photo=photoWords.test(clause);
    const named=mentioned.filter(room=>roomMentioned(clause,room));
    if(photo&&photoRefusal.test(clause)){
      selected=named.length?selected.filter(room=>!named.includes(room)):[];
      sawPhoto=true;continue;
    }
    const negated=named.filter(room=>roomAliases(room).some(name=>new RegExp(`\\b(?:nao|nem)(?:\\s+(?:d[aoe]s?|a|o|suite))*\\s+${name}\\b`).test(clause)));
    const positive=named.filter(room=>!negated.includes(room));
    if(photo){
      selected=positive.length?positive:selected.filter(room=>!negated.includes(room));
      sawPhoto=true;
    } else if(sawPhoto&&/\b(?:so|apenas|somente)\b/.test(clause)&&positive.length)selected=positive;
    else if(sawPhoto&&negated.length)selected=selected.filter(room=>!negated.includes(room));
  }
  return selected;
}

export function roomImages(room: MediaRoom): string[] {
  let values = room.images || room.image_urls || room.imageUrls || [];
  if (typeof values === 'string') { try { values = JSON.parse(values); } catch { values = []; } }
  return Array.isArray(values) ? values.filter((url): url is string => typeof url === 'string' && /^(https:\/\/|\/[^/]|data:image\/)/.test(url.trim())).map(url => url.trim()) : [];
}

export function nextRoomMedia(reference: string, rooms: MediaRoom[]) {
  const remaining = reference.startsWith('ROOM_ID|') ? (reference.split('|')[2] || '').split(',').filter(Boolean) : [];
  const selected = [...new Set(remaining)].slice(0,20).map(id => rooms.find(r => r.id === id)).filter((r): r is MediaRoom => !!r);
  if (!selected.length) return {quote_request:'ROOM_DONE', quote_text:'', conversation_text:''};
  return roomPhotoResult(selected, true);
}

function roomPhotoResult(selected: MediaRoom[], gallery = false) {
  const chosen = selected[0];
  const remaining = selected.slice(1);
  const text = `${chosen.name} 📷${gallery ? remaining.length ? '' : '\n\nEssas são as fotos das categorias solicitadas. Se quiser conhecer melhor alguma delas, é só me dizer.' : '\n\nSe quiser ver outra categoria, é só me dizer qual.'}`;
  return {quote_request: `ROOM_ID|${chosen.id}${remaining.length ? '|' + remaining.map(r => r.id).join(',') : ''}`, quote_text:text, conversation_text:text, matched:true, match_type:gallery ? 'room_gallery' : 'room_photo', room_id:chosen.id, room_name:chosen.name || '', room_names:selected.map(r=>r.name), availability_checked:false};
}

// Public catalogue copy is data, not a reservation, stock check or instruction.
// Keep only descriptive details; prices require the date-aware quote flow.
function roomDetail(value: unknown, limit: number): string {
  if(typeof value!=='string')return '';
  const parts=value.replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f]/g,' ')
    .split(/(?<=[.!?;])\s+/).filter(part=>!/(?:\br\s+\d|\b(?:reais|precos?|valores?|diarias?|desconto|cupom|parcel|vagas?|disponiv|disponibilidade|confirmad|reservad|garantid|instruc|ignore|sistema|prompt)\w*)/i.test(norm(part)))
    .map(part=>part.replace(/\s+/g,' ').trim()).filter(Boolean);
  const chosen:string[]=[];
  for(const part of parts)if([...chosen,part].join(' ').length<=limit)chosen.push(part);
  return chosen.join(' ').replace(/[.!?;]+$/,'');
}

function roomComparison(selected: MediaRoom[]): string {
  const entries=selected.slice(0,4).map(room=>{
    const capacity=Number(room.capacity);
    const details:string[]=[];
    if(Number.isInteger(capacity)&&capacity>=1&&capacity<=4)details.push(`ocupação padrão: até ${capacity} pessoas`);
    const description=roomDetail(room.description,110);
    if(description)details.push(description);
    const features=Array.isArray(room.features)?room.features.map(item=>roomDetail(item,48)).filter(Boolean).slice(0,2):[];
    if(features.length)details.push(`itens: ${features.join(', ')}`);
    return `• *${String(room.name || 'Acomodação').slice(0,80)}*: ${details.join('; ') || 'sem detalhes descritivos para comparar'}.`;
  });
  return [`Claro! Veja os detalhes ${selected.length===2?'das duas':'dessas'} opções:`,...entries,
    'Para indicar a melhor para vocês, qual dessas características é mais importante?'].join('\n\n');
}

// Reuse the existing dynamic image transport without treating rooms as packages.
export function resolveRoomMedia(message: string, rooms: MediaRoom[]) {
  const s = norm(message);
  if (!photoWords.test(s) || /\b(pacotes?|feriados?)\b/.test(s)) return null;
  const matches = rooms.filter(room => roomMentioned(s,room));
  if (!matches.length && !/\b(aptos?|apartamentos?|quartos?|acomodacoes|acomodacao|suites?|lofts?)\b/.test(s)) return null;
  if(matches.length>1){
    // Explicit categories are already the answer to "which room?". Preserve
    // mention order and reuse the existing finite gallery transport.
    const requested=matches.slice().sort((a,b)=>s.indexOf(norm(a.name||'').replace(/^suite\s+/,''))-s.indexOf(norm(b.name||'').replace(/^suite\s+/,''))).slice(0,20);
    const photoRequested=requestedPhotoRooms(message,requested);
    const available=photoRequested.filter(room=>roomImages(room).length>0);
    const missing=photoRequested.filter(room=>!roomImages(room).length);
    const comparison=/\b(?:melhor|compar\w*|diferenc\w*|indic\w*|recomend\w*|escolh\w*|decidir|duvida)\b/.test(s);
    const intro=[comparison?roomComparison(requested):'',!photoRequested.length?'Tudo bem, não vou enviar fotos.':'',missing.length?`Não encontrei fotos cadastradas de ${missing.map(room=>room.name).join(', ').slice(0,180)} para enviar agora.`:''].filter(Boolean).join('\n\n');
    if(!available.length)return {quote_request:'ROOM_LIST',quote_text:intro,conversation_text:intro,matched:true,
      match_type:comparison?'room_comparison_information':'room_gallery_information',room_name:'',room_names:requested.map(room=>room.name),availability_checked:false};
    const result=roomPhotoResult(available,true);
    const text=[intro,result.conversation_text].filter(Boolean).join('\n\n').slice(0,1900);
    return {...result,quote_text:text,conversation_text:text,room_names:requested.map(room=>room.name),
      match_type:comparison?'room_comparison_gallery':'room_gallery'};
  }
  if(matches.length&&!requestedPhotoRooms(message,matches).length){
    const text='Tudo bem, não vou enviar fotos.';
    return {quote_request:'ROOM_LIST',quote_text:text,conversation_text:text,matched:true,match_type:'room_photo_information',room_name:'',availability_checked:false};
  }
  if (/\btod[oa]s\b/.test(s)) {
    const available = rooms.filter(room => roomImages(room).length > 0).slice(0,20);
    if (available.length) return roomPhotoResult(available, true);
  }
  const generic = /\b(aptos?|apartamentos?|quartos?|acomodacoes|acomodacao)\b/.test(s) && !/\b(suites?|lofts?)\b/.test(s);
  const chosen = matches.length === 1 ? matches[0] : matches.length === 0 && generic ? rooms.find(room => norm(room.name || '') === 'loft') : undefined;
  const hasImage = chosen && roomImages(chosen).length > 0;
  if (hasImage) return roomPhotoResult([chosen!]);
  const text = chosen
    ? hasImage
      ? `${matches.length ? '' : 'Vou começar pelo Loft. '}Esta é uma foto de ${chosen.name}, cadastrada no nosso motor de reservas. Se quiser conhecer outra categoria, me diga qual.`
      : `Não encontrei uma foto cadastrada de ${chosen.name} para enviar agora. Posso pedir à recepção para ajudar por aqui.`
    : `De qual acomodação você gostaria de ver fotos? Temos estas categorias cadastradas: ${rooms.map(room => room.name).filter(Boolean).join(', ')}.`;
  return {
    quote_request: hasImage ? `ROOM_ID|${chosen!.id}` : 'ROOM_LIST',
    quote_text: text, conversation_text: text, matched: true,
    match_type: hasImage ? 'room_photo' : 'room_photo_information',
    room_id: chosen?.id || '', room_name: chosen?.name || '',
    availability_checked: false,
  };
}
