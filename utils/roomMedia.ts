export type MediaRoom = { id: string; name?: string; images?: unknown; image_urls?: unknown; imageUrls?: unknown };
const norm = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

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
  const text = `${chosen.name} 📷${gallery ? remaining.length ? '' : '\n\nEssas são as categorias com fotos cadastradas. Qual delas você gostaria de conhecer melhor?' : '\n\nSe quiser ver outra categoria, é só me dizer qual.'}`;
  return {quote_request: `ROOM_ID|${chosen.id}${remaining.length ? '|' + remaining.map(r => r.id).join(',') : ''}`, quote_text:text, conversation_text:text, matched:true, match_type:gallery ? 'room_gallery' : 'room_photo', room_id:chosen.id, room_name:chosen.name || '', room_names:selected.map(r=>r.name), availability_checked:false};
}

// Reuse the existing dynamic image transport without treating rooms as packages.
export function resolveRoomMedia(message: string, rooms: MediaRoom[]) {
  const s = norm(message);
  if (!/\b(fotos?|fotografias?|imagem|imagens|galeria|album)\b/.test(s) || /\b(pacotes?|feriados?)\b/.test(s)) return null;
  const matches = rooms.filter(room => {
    const name = norm(room.name || '');
    const short = name.replace(/^suite\s+/, '');
    return name && (s.includes(name) || (short.length >= 4 && s.includes(short)));
  });
  if (!matches.length && !/\b(aptos?|apartamentos?|quartos?|acomodacoes|acomodacao|suites?|lofts?)\b/.test(s)) return null;
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
