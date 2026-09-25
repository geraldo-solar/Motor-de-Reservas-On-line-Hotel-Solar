// Compra do motor de reservas na API de Conversões da Meta (lado servidor).
//
// O navegador também manda a compra pelo pixel, mas bloqueador de anúncio,
// iOS e aba fechada cedo derrubam parte desses eventos. O servidor manda de
// novo com o mesmo event_id; a Meta junta os dois e conta uma vez só.
//
// Mesmas regras do site (Site Hotel Solar/api/capture-lead): dados pessoais
// só com hash SHA-256 depois de normalizar; fbp, fbc, IP e navegador em claro,
// como a Meta pede; o token vai no corpo, nunca na URL.

import { createHash } from 'node:crypto';
import { META_PIXEL_ID, dadosDaCompra, ehHostDeProducao, idDoEventoDeCompra } from './metaEventos.js';

const META_GRAPH_URL = 'https://graph.facebook.com';

export type ContextoDaCompra = {
  cookies: string;
  ip: string;
  navegador: string;
  host: string;
  pagina: string;
  agoraMs: number;
};

export type ResultadoDaCompra = 'enviado' | 'sem_token' | 'fora_de_producao' | 'falhou';

type Ambiente = Record<string, string | undefined>;

type ReservaDoServidor = {
  id: string;
  checkIn: string;
  checkOut: string;
  totalPrice: number;
  rooms?: Array<{ id?: string; priceSnapshot?: number }>;
  mainGuest?: { name?: string; email?: string; phone?: string };
};

const sha256 = (valor: string) => createHash('sha256').update(valor, 'utf8').digest('hex');

const hashDoEmail = (valor: unknown) => {
  const email = String(valor ?? '').trim().toLowerCase();
  return email.includes('@') ? sha256(email) : '';
};

/** Celular brasileiro com DDI, só dígitos (5591988887777), como a Meta casa. */
export function telefoneNormalizado(valor: unknown): string {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) return digitos;
  return '';
}

/** Minúsculas e sem acento: "João" e "joao" precisam virar o mesmo hash. */
const nomeNormalizado = (valor: string) =>
  valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

function lerCookie(cabecalho: string, nome: string): string {
  for (const parte of String(cabecalho || '').split(';')) {
    const i = parte.indexOf('=');
    if (i === -1 || parte.slice(0, i).trim() !== nome) continue;
    try {
      return decodeURIComponent(parte.slice(i + 1).trim());
    } catch {
      return '';
    }
  }
  return '';
}

function fbclidDaPagina(pagina: string): string {
  try {
    return new URL(pagina).searchParams.get('fbclid') || '';
  } catch {
    return '';
  }
}

export function eventoDeCompra(reserva: ReservaDoServidor, contexto: ContextoDaCompra) {
  const hospede = reserva.mainGuest || {};
  const partesDoNome = String(hospede.name || '').trim().split(/\s+/).filter(Boolean);
  const primeiro = partesDoNome.length ? nomeNormalizado(partesDoNome[0]) : '';
  const ultimo = partesDoNome.length > 1 ? nomeNormalizado(partesDoNome[partesDoNome.length - 1]) : '';

  const userData: Record<string, unknown> = { country: [sha256('br')] };
  const email = hashDoEmail(hospede.email);
  const telefone = telefoneNormalizado(hospede.phone);
  if (email) userData.em = [email];
  if (telefone) userData.ph = [sha256(telefone)];
  if (primeiro) userData.fn = [sha256(primeiro)];
  if (ultimo) userData.ln = [sha256(ultimo)];

  // O pixel grava _fbc quando a pessoa chega por um anúncio; se o cookie não
  // existir, o fbclid da página ainda identifica o clique.
  const fbclid = fbclidDaPagina(contexto.pagina);
  const fbc = lerCookie(contexto.cookies, '_fbc') || (fbclid ? `fb.1.${contexto.agoraMs}.${fbclid}` : '');
  const fbp = lerCookie(contexto.cookies, '_fbp');
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;
  if (contexto.ip) userData.client_ip_address = contexto.ip;
  if (contexto.navegador) userData.client_user_agent = contexto.navegador;

  return {
    event_name: 'Purchase',
    event_time: Math.floor(contexto.agoraMs / 1000),
    event_id: idDoEventoDeCompra(reserva.id),
    action_source: 'website',
    ...(contexto.pagina ? { event_source_url: contexto.pagina } : {}),
    user_data: userData,
    custom_data: dadosDaCompra(reserva),
  };
}

/**
 * Nunca lança erro nem segura a reserva: se a Meta falhar ou demorar, a
 * reserva já está gravada e o hóspede segue para a tela de confirmação.
 */
export async function enviarCompraParaMeta(
  reserva: ReservaDoServidor,
  contexto: ContextoDaCompra,
  ambiente: Ambiente = process.env,
  buscar: typeof fetch = fetch,
): Promise<ResultadoDaCompra> {
  const token = String(ambiente.META_CAPI_TOKEN || '').trim();
  if (!token) return 'sem_token';
  const codigoDeTeste = String(ambiente.META_TEST_EVENT_CODE || '').trim().slice(0, 40);
  // Prévia da Vercel e computador local só mandam com código de teste, que
  // cai na aba "Testar eventos" e não entra nas campanhas.
  if (!ehHostDeProducao(contexto.host) && !codigoDeTeste) return 'fora_de_producao';

  const pixel = String(ambiente.META_PIXEL_ID || '').trim() || META_PIXEL_ID;
  const versao = String(ambiente.META_API_VERSION || '').trim() || 'v21.0';
  try {
    const resposta = await buscar(`${META_GRAPH_URL}/${versao}/${pixel}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        access_token: token,
        ...(codigoDeTeste ? { test_event_code: codigoDeTeste } : {}),
        data: [eventoDeCompra(reserva, contexto)],
      }),
      signal: AbortSignal.timeout(3000),
      redirect: 'error',
    });
    if (!resposta.ok) {
      // Só o status: o corpo do erro da Meta repete parte do que foi enviado.
      console.error(JSON.stringify({ message: 'Meta CAPI recusou a compra', status: resposta.status }));
      return 'falhou';
    }
    return 'enviado';
  } catch (erro) {
    console.error(JSON.stringify({ message: 'Meta CAPI indisponível', erro: (erro as Error)?.name || 'erro' }));
    return 'falhou';
  }
}
