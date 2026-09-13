const norm=(s:string)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
type InclusionPackage={name?:string;includes?:string[];benefits?:string[]};
type Subject='breakfast'|'celebration'|'ceia'|'open_bar'|'lunch'|'dinner';
function subject(message:string):Subject|undefined {
  const s=norm(message);
  if(/\bcafe(?: da manha)?\b/.test(s))return 'breakfast';
  if(/\b(?:festa|virada)\b/.test(s))return 'celebration';
  if(/\bceia\b/.test(s))return 'ceia';
  if(/\bopen bar\b/.test(s))return 'open_bar';
  if(/\balmoco\b/.test(s))return 'lunch';
  if(/\bjantar\b/.test(s))return 'dinner';
}

/** Explain only the requested registered inclusion. An absent record is not
 * proof of either inclusion or a separately charged ticket. */
export function packageInclusionReply(pkg:InclusionPackage,message:string,history:string[]=[]):string {
  let requested=subject(message);
  if(!requested&&/\b(?:separad[oa]|inclu[si])/.test(norm(message))) {
    requested=history.slice(-4).reverse().map(subject).find(Boolean);
  }
  const name=String(pkg.name||'pacote consultado').replace(/[\r\n]/g,' ').slice(0,150);
  if(!requested)return `Qual item você quer confirmar se está incluso no ${name}? Assim não confundo a hospedagem com um serviço separado.`;
  const patterns:Record<Subject,RegExp>={breakfast:/\bcafe(?: da manha)?\b/,celebration:/\bfesta\b/,ceia:/\bceia\b/,open_bar:/\bopen bar\b/,lunch:/\balmoco\b/,dinner:/\bjantar\b/};
  const relevant=(s:string)=>patterns[requested!].test(s);
  const items=[...(pkg.includes||[]),...(pkg.benefits||[])].map(v=>String(v).replace(/[\r\n\t]/g,' ').trim())
    .filter(v=>relevant(norm(v))&&!/\b(?:ignore|instrucoes|prompt|system|cupom|codigo|senha|token|chave)\b|https?:|www\.|@|\b(?:\d[.\s-]*){11,}\b/.test(norm(v)))
    .map(v=>v.slice(0,350)).slice(0,2);
  if(items.length)return `Para o ${name}, consta no cadastro:\n${items.map(v=>`• ${v}`).join('\n')}\n\nA recepção confirma as condições específicas. Essa informação não confirma disponibilidade nem reserva.`;
  const labels:Record<Subject,string>={breakfast:'o café da manhã',celebration:'a festa da virada',ceia:'a ceia',open_bar:'o open bar',lunch:'o almoço',dinner:'o jantar'};
  const label=labels[requested];
  return `Não tenho confirmação cadastrada de que ${label} esteja incluso no ${name}. Também não vou presumir cobrança separada. A recepção precisa conferir essa condição do pacote.`;
}
