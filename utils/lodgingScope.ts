import { eventInquiry } from './hotelInfo.js';

const values: Record<string, number> = {um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10};

// The current conversational quote prices one accommodation. An explicit
// request for several rooms needs the reception's multi-room verification;
// never silently treat all guests as occupants of a single apartment.
export function multiRoomRequest(message: string): boolean {
  const s=String(message || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  if (eventInquiry(message) || /\b(fotos?|fotografias?|imagem|imagens|videos?|galeria|album|politica|capacidade)\b/.test(s)) return false;
  if (/\bnao (?:quero|preciso|desejo|vamos|vou)\b|\b(?:apenas|somente|so) (?:um|1) (?:quarto|apartamento|apto|suite)\b/.test(s)) return false;
  const roomCount=/\b(\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+(?:quartos?|apartamentos?|aptos?|suites?)\b/g;
  const requests=[...s.matchAll(roomCount)];
  if (!requests.some(m=>(values[m[1]] || Number(m[1]))>1)) return false;
  const transaction=/\b(orcamento|cotacao|cotar|reservar|reserva|hospedar|hospedagem|valor|preco|disponibilidade)\b/.test(s);
  if (/\b(?:saber|conhecer|entender|informacoes|detalhes)\b/.test(s) && !transaction) return false;
  const asksBooking=transaction || /\b(preciso|quero|queria|gostaria)\b/.test(s);
  const shortAnswer=/^(?:para )?(?:\d{1,2}|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+(?:quartos?|apartamentos?|aptos?|suites?)(?:\s+(?:duplos?|triplos?|separados?|de casal))?[.!]?$/.test(s);
  return asksBooking || shortAnswer;
}
