import { childPolicyQuestion, childAgeFollowup } from './packageChildInquiry.js';
import { publicEventInquiry, publicEventWeekdayReference } from './publicEvents.js';
import { hotelPhoneInquiry } from './hotelContact.js';
import { explicitHumanRequest } from './humanIntent.js';
import { existingReservationInquiry } from './existingReservation.js';
import { guestServiceRequest } from './guestService.js';
import { paymentStatusInquiry } from './paymentStatus.js';
import { paymentSupportInquiry } from './paymentSupport.js';
import { multiRoomRequest,roomAlternativeComparison } from './lodgingScope.js';
import {roomDetailInquiry} from './roomMedia.js';

// A catalog reference is conversational context, never a quote or consent.
export type PackageContext = {id: string; name: string; start_date: string; end_date: string; updated_at: number};
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s?/,.-]/g, ' ').replace(/\s+/g, ' ').trim();
export function readPackageContext(value: any, now = Date.now()): PackageContext | undefined {
  if (!value || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id)
    || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 180 || /@|\b(?:\d[.\s-]*){11,}\b/.test(value.name)
    || !Number.isFinite(value.updated_at) || value.updated_at <= 0 || now < value.updated_at || now - value.updated_at > 30 * 60000) return;
  for (const key of ['start_date', 'end_date']) {
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(value[key] || '')) return;
    const date = new Date(`${value[key]}T12:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value[key]) return;
  }
  if (value.end_date <= value.start_date) return;
  return {id:value.id, name:value.name.trim(), start_date:value.start_date, end_date:value.end_date, updated_at:value.updated_at};
}
export function packageInquiry(message: string) {
  return /\b(pacotes?|feriados?|reveillon|natal|ano novo|virada|carnaval|pascoa|finados|corpus christi|dia das criancas|dia das maes|dia dos pais|dia dos namorados)\b/.test(norm(message));
}
export function namedPackageInquiry(message: string) {
  return /\b(reveillon|natal|ano novo|virada|carnaval|pascoa|finados|corpus christi|dia das criancas|dia das maes|dia dos pais|dia dos namorados|ostrabeach|independencia)\b/.test(norm(message));
}

/** A fresh catalog question replaces the old stay/topic, not the family.
 * Current package inclusions, occupancy, dates and commercial follow-ups are
 * not new discovery simply because they repeat the package's name. */
export function packageDiscoveryRequest(message:string,value?:unknown,now=Date.now()):boolean {
  const s=norm(message),focus=readPackageContext(value,now);
  if(!packageInquiry(message)&&!namedPackageInquiry(message))return false;
  if(hotelPhoneInquiry(message)||explicitHumanRequest(message)||existingReservationInquiry(message)
    ||guestServiceRequest(message)||paymentStatusInquiry(message)||paymentSupportInquiry(message)
    ||multiRoomRequest(message)||roomAlternativeComparison(message))return false;
  if(/\b(?:telefone|fone|ligacao|ligar|telefonar)\b/.test(s))return false;
  if(/\b(?:fotos?|fotografias?|imagem|imagens|videos?|galeria|album|cardapio|menu|reserva solar|solar 73|restaurante|day[ -]?use|comprovante|paguei|reembolso|cancelar minha reserva)\b/.test(s)
    ||/\bnao (?:quero|queremos|preciso|precisamos|gostaria|desejo)\b/.test(s))return false;
  if(packageOccupancyFollowup(message,focus,now)||packageInclusionFollowup(message,focus,now)||packageRoomDetailFollowup(message,focus,now)
    ||childPolicyQuestion(message))return false;
  // A holiday mentioned in a hotel FAQ is only when the visit happens.
  // Do not erase a stay for "Wi-Fi no Réveillon?" or breakfast/check-in hours.
  if(/\b(?:wifi|wi-fi|internet|senha|estacionamento|garagem|pets?|cachorros?|animais|bercos?|acessibilidade|cadeirantes?|banheiro adaptado)\b/.test(s)
    ||/\b(?:horarios?|que horas|como funciona)\b/.test(s)
      &&/\b(?:cafe|almoco|jantar|piscinas?|check[ -]?in|check[ -]?out|entrada|saida)\b/.test(s))return false;
  if(/\bproxim[oa]s?\b/.test(s))return /\bpacotes?\b/.test(s)
    ||/\b(?:qual|quais|que|quando)\b.{0,25}\bproxim[oa]s? feriados?\b/.test(s);
  const named=s.match(/\b(?:reveillon|ano novo|virada|natal|carnaval|pascoa|finados|corpus christi|dia das criancas|dia das maes|dia dos pais|dia dos namorados|ostrabeach|independencia)\b/g)||[];
  if(named.length){
    if(!focus)return true;
    const current=norm(focus.name);
    if(named.some(name=>/^(?:reveillon|ano novo|virada)$/.test(name)
      ?!/\b(?:reveillon|ano novo|virada)\b/.test(current):!current.includes(name)))return true;
    const years=s.match(/\b20\d{2}\b/g)||[];
    return years.some(year=>!current.includes(year)&&focus.start_date.slice(0,4)!==year&&focus.end_date.slice(0,4)!==year);
  }
  // "Esse pacote" still means the current subject, not a request to list all.
  if(/\b(?:esse|este|desse|deste|nesse|neste|aquele|daquele) pacote\b/.test(s))return false;
  return /\b(?:quais|que|outros?|novos?|alguns?) pacotes\b|\b(?:algum|outro|novo) pacote\b|\bpacotes (?:disponiveis|ativos|especiais|de feriado)\b|\b(?:quais|que) feriados\b/.test(s)
    || /\b(?:pacotes|feriados)\b/.test(s)&&/\b(?:mostrar|mostre|ver|conhecer|consultar|lista|listar|oferecem|tem|temos|ha|disponiveis)\b/.test(s);
}

export function packageAcknowledgment(message:string):boolean {
  return /^(?:entendi|entendido|otimo|perfeito|certo|obrigad[oa])(?:[, ]+(?:sim|obrigad[oa]))?[.!]*$/.test(norm(message));
}

/** Inclusion questions retain a fresh package, not a visitor-meal context.
 * Explicit visits/restaurants, other packages and real-time shows stay out. */
export function packageInclusionFollowup(message:string,value:unknown,now=Date.now()):boolean {
  const focus=readPackageContext(value,now),s=norm(message);
  if(!focus||newTripRequest(message))return false;
  if(/\b(?:nao hospedes?|nao (?:estou |estamos |sou |somos )?hospedad[oa]s?|sem hospedagem|avuls[oa]s?|visitantes?|day[ -]?use|restaurante|reserva solar|solar 73|cardapio|fotos?|hoje|amanha)\b/.test(s))return false;
  const named=/\b(?:reveillon|virada|ano novo|natal|carnaval|pascoa|dia das criancas)\b/.exec(s)?.[0];
  if(named) {
    const group=(v:string)=>/\b(?:reveillon|virada|ano novo)\b/.test(v)?'new-year':v;
    if(group(named)==='new-year'?!/\b(?:reveillon|virada|ano novo)\b/.test(norm(focus.name)):!norm(focus.name).includes(named))return false;
  }
  return /\b(?:inclui|incluid[oa]s?|inclus[oa]s?|inclusoes|separad[oa]s?|a parte)\b/.test(s)
    && /\b(?:pacote|cafe(?: da manha)?|ceia|festa|virada|open bar|almoco|jantar)\b/.test(s);
}

export function focusedPackageNameReference(message:string,value:unknown,now=Date.now()):boolean {
  const focus=readPackageContext(value,now),s=norm(message);
  return !!focus&&packageInclusionFollowup(message,focus,now)
    && /\b(?:reveillon|virada|ano novo)\b/.test(s)
    && /\b(?:reveillon|virada|ano novo)\b/.test(norm(focus.name));
}

/** Keep the active package while answering a specific room characteristic,
 * without treating beds/view as a recommendation, new quote or chosen room. */
export function packageRoomDetailFollowup(message:string,value:unknown,now=Date.now()):boolean {
  const focus=readPackageContext(value,now),s=norm(message);
  if(!focus||newTripRequest(message)||!roomDetailInquiry(message))return false;
  const names=s.match(/\b(?:reveillon|ano novo|virada|natal|carnaval|pascoa|finados|corpus christi|dia das criancas|dia das maes|dia dos pais|dia dos namorados|ostrabeach|independencia)\b/g)||[];
  const current=norm(focus.name);
  if(names.some(name=>/^(?:reveillon|ano novo|virada)$/.test(name)?!/\b(?:reveillon|ano novo|virada)\b/.test(current):!current.includes(name)))return false;
  return !(s.match(/\b20\d{2}\b/g)||[]).some(year=>!current.includes(year)&&!focus.start_date.startsWith(year)&&!focus.end_date.startsWith(year));
}

/** A declared party or an apartment-capacity question is a focused package
 * continuation even when the customer repeats its name. This does not parse
 * ages, choose dates or authorize booking; the family controller owns facts. */
export function packageOccupancyFollowup(message:string,value:unknown,now=Date.now()):boolean {
  const focus=readPackageContext(value,now),s=norm(message);
  if(!focus||newTripRequest(message)||!s||s.length>1000)return false;
  if(/\b(?:outro assunto|esquece|esqueca|mudar de assunto|nao quero esse|nao quero o pacote|fotos?|fotografias?|imagem|imagens|videos?|galeria|album|cardapio|menu|reserva solar|solar 73|restaurante|day[ -]?use|avuls[oa]s?|visitantes?|cafe|almoco|jantar|ceia|festa|playground|piscinas?|hidromassagem|bicicletas?|bikes?|comprovante|paguei|pagamento|reembolso|cancelar minha reserva|manutencao)\b/.test(s))return false;
  const names=s.match(/\b(?:reveillon|ano novo|virada|natal|carnaval|pascoa|finados|corpus christi|dia das criancas|dia das maes|dia dos pais|dia dos namorados|ostrabeach|independencia)\b/g)||[];
  const focusName=norm(focus.name);
  const years=s.match(/\b20\d{2}\b/g)||[];
  if(years.some(year=>!focusName.includes(year)&&focus.start_date.slice(0,4)!==year&&focus.end_date.slice(0,4)!==year))return false;
  if(names.some(name=>/^(?:reveillon|ano novo|virada)$/.test(name)
    ?!/\b(?:reveillon|ano novo|virada)\b/.test(focusName):!focusName.includes(name)))return false;
  if(childAgeFollowup(message))return true;
  // An unlabelled list can preserve a package, but only the pending-family
  // parser may decide that these numbers are ages rather than other data.
  if(/^(?:(?:as idades sao|idades|eles tem|elas tem|tem|sao)[: ]+)?\d{1,2}(?:\s*(?:,|e)\s*\d{1,2}){1,5}(?:\s*anos)?[.!?]*$/.test(s))return true;
  const count='(?:\\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)';
  const composition=new RegExp(`\\b${count}\\s*(?:pessoas|hospedes|adult[oa]s?|criancas?|filh[oa]s?|bebes?)\\b`).test(s)
    || /\b(?:somos|seremos|vamos em)\s+(?:um )?casal\b|\b(?:casal|minha esposa|meu marido)\b.{0,35}\b(?:filh[oa]s?|criancas?|bebe)\b/.test(s)
    || /^(?:(?:no caso|entao)[, ]+)?(?:e |somos |sera |seremos |vai ser |vamos )?(?:apenas |so )?eu e (?:uma? |minha? )amig[oa][.!]*$/.test(s);
  const capacity=/\b(?:apartamentos?|aptos?|quartos?|suites?|loft|acomodacoes|acomodacao)\b/.test(s)
    && /\b(?:cabem|cabe|caber|comporta|comportam|acomoda|acomodam|dividir|divididos?|separad[oa]s?|juntos|todos|capacidade|quantas pessoas|quantos hospedes|formato)\b/.test(s);
  const commercial=/\b(?:valor|valores|preco|precos|custa|custaria|orcamento|cotacao|quanto fica|quanto sai|indica|indicam|indicado|recomenda|recomendam|melhor|sugere|sugestao)\b/.test(s);
  return capacity||composition&&!commercial;
}
export function newTripRequest(message: string) {
  const s = norm(message);
  return /\b(outro periodo|outras datas|outra estadia|outra viagem)\b/.test(s)
    && (/\b(quero|prefiro|vou|vamos|mudar|trocar|desejo)\b/.test(s) || /^(outro periodo|outras datas|outra estadia|outra viagem)[.!]*$/.test(s));
}
/** Keep the package available for clarification without choosing its dates. */
export function packageWeekdayClarification(message: string, value: unknown, now = Date.now()): string | undefined {
  if (!readPackageContext(value, now) || !publicEventInquiry(message)
    || publicEventWeekdayReference(message) !== 'ambiguous') return;
  const weekday = norm(message).match(/\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/)?.[1];
  const label = weekday === 'sabado' ? 'sábado' : weekday === 'terca' ? 'terça-feira'
    : weekday && !['domingo'].includes(weekday) ? `${weekday}-feira` : 'domingo';
  const masculine = weekday === 'sabado' || weekday === 'domingo';
  return `Você quer saber a programação ${masculine ? 'do' : 'da'} ${label} do pacote que estávamos conversando ou ${masculine ? 'do próximo' : 'da próxima'} ${label}? Se preferir, informe a data desejada.`;
}
/** Expand only a short answer to an active, validated weekday question. */
export function packageWeekdayReply(message: string, previousQuestion: string): string | undefined {
  if (typeof previousQuestion !== 'string' || !/\bprogramacao\b/.test(norm(previousQuestion))) return;
  const weekday = norm(previousQuestion).match(/\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/)?.[1];
  if (!weekday) return;
  const label = (value: string) => value === 'sabado' ? 'sábado' : value === 'terca' ? 'terça-feira'
    : value === 'domingo' ? 'domingo' : `${value}-feira`;
  const next = (value: string) => `Qual a programação ${['sabado','domingo'].includes(value) ? 'do próximo' : 'da próxima'} ${label(value)}?`;
  const s = norm(message).replace(/[.!?]+$/g, '').trim();
  if (/^(?:sim|nao|\d{1,2})$/.test(s)) return previousQuestion;
  if (/^(?:(?:o|a|do|da|no|na) )?proxim[oa]$/.test(s)) return next(weekday);
  const namedNext = /^(?:(?:o|a|do|da|no|na) )?proxim[oa] (domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:[- ]feira)?$/.exec(s);
  if (namedNext) return next(namedNext[1]);
  const packageChoice = /^(?:(?:o|a|do|da|no|na) )?(?:(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:[- ]feira)? do )?pacote$/.exec(s);
  if (packageChoice) return `Qual a programação de ${label(packageChoice[1] || weekday)} do pacote?`;
  if (/^(?:hoje|amanha)$/.test(s)) return `Qual a programação de ${s === 'amanha' ? 'amanhã' : 'hoje'}?`;
  const date = /^(?:dia )?(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?$/.exec(s);
  if (date) {
    const iso = `${date[3] || '2000'}-${date[2].padStart(2, '0')}-${date[1].padStart(2, '0')}`;
    const parsed = new Date(`${iso}T12:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) return previousQuestion;
    return `Qual a programação do hotel em ${date[1]}/${date[2]}${date[3] ? `/${date[3]}` : ''}?`;
  }
  return undefined;
}
export function packageFollowup(message: string) {
  const s = norm(message);
  if (newTripRequest(message)) return false;
  if(roomDetailInquiry(message))return true;
  if(packageAcknowledgment(message))return true;
  // A present-calendar reference must not borrow the active package's dates.
  // Unqualified weekdays are handled by packageWeekdayClarification instead.
  const weekdayReference = publicEventWeekdayReference(message);
  if (publicEventInquiry(message) && weekdayReference !== undefined && weekdayReference !== 'package') return false;
  if (/\b(comprovante|paguei)\b|pagamento.{0,30}(confirmad|recebid)|(?:confirmad|recebid).{0,30}pagamento/.test(s)) return false;
  if (/\b(fotos?|imagens?|fotografias?|galeria|album|cardapio|menu|reserva solar|solar 73|academia|playground|parquinho|piscinas?|hidromassagem|bicicletas?|bikes?)\b/.test(s)) return false;
  if (/\b(outro assunto|esquece|esqueca|mudar de assunto|nao quero esse|nao quero o pacote)\b/.test(s)) return false;
  if(/\b(?:incluid[oa]s?|separad[oa]s?|a parte)\b/.test(s)
    && /\b(?:pacote|cafe|ceia|festa|virada|open bar|almoco|jantar)\b/.test(s))return true;
  if (weekdayReference === 'package') return true;
  if (childPolicyQuestion(message) || childAgeFollowup(message)) return true;
  if (/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(s)) return true;
  return /\b(indica|indicam|recomenda|recomendam|melhor|sugere|sugestao|pessoas|hospedes|adultos?|casal|criancas?|filh[oa]s?|bebe|familia|valores?|precos?|custa|custos?|mais barato|mais economico|quanto|pagamento|parcelamento|parcelar|parcelas|inclui|inclus[oa]s?|inclusoes|ceia|open bar|programacao|horarios?|barco|catamara|regras|periodo|noites|diarias|datas|entrada|saida|loft|suites?|quartos?|acomodacoes|acomodacao|informacoes|detalhes|reservar|prosseguir)\b/.test(s)
    || /^(sim|nao|pode ser|quero|pode mostrar|quais opcoes|\d{1,2})[.!?]*$/.test(s);
}
export function packageBookingRequest(message: string) {
  const s = norm(message);
  return !/\?|\b(qual|quais|quanto|como|indica|recomenda|nao|talvez|depois|saber|informacoes|detalhes|valores|precos|comparar|conhecer|ver|mostrar|consultar|inclui|inclusoes)\b/.test(s)
    && !/^(quero|pode ser)[.!]*$/.test(s)
    && /\b(reservar|prosseguir|quero|prefiro|escolho|escolhi|aceito|pode ser|fico com|vou ficar|vou querer)\b/.test(s);
}
export function packageRecommendationInquiry(message: string) {
  if(roomDetailInquiry(message))return false;
  return /\b(indica|indicam|recomenda|recomendam|melhor|sugere|sugestao|pessoas|hospedes|adultos?|casal|filh[oa]s?|familia|valores?|precos?|custa|mais barato|mais economico|loft|suites?|quartos?|acomodacoes|acomodacao)\b/.test(norm(message));
}
