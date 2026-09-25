import type { VercelRequest, VercelResponse } from '@vercel/node';
import { bancoDoServidor, chaveDoBanco } from '../utils/bancoDoServidor.js';
import {
  COLUNAS_DO_SITE, cancelamentoDoSite, codigoCurto, conferirReservaDoSite, cupomParaOSite, ehCodigoCurto,
  ehRascunhoDoChatbot, ehUuid, estoqueAjustado, fichaDoHospede, fichaQuePodeSerCompletada, linhasPorQuarto,
  reservaLimpa, soDigitos,
} from '../utils/reservaDoSite.js';
import { type ContextoDaCompra, enviarCompraParaMeta } from '../utils/metaConversoesServidor.js';

// Reservas do site público, pelo servidor (VEN-10, fase 2).
//
// GET ?id=  — resposta antiga (achou? situação? forma de pagamento?), mantida
//             para quem já chamava esta rota.
// POST { acao } — o que o site faz com reservas sem tocar no banco pelo
//             navegador: buscar, criar, cancelar, pré-check-in e cupom.
// Tudo numa rota só porque o plano da Vercel limita o número de rotas.

type Banco = ReturnType<typeof bancoDoServidor>;
const MOTIVO_DO_CLIENTE = 'Cancelamento realizado pelo cliente';

async function reservasDoNumero(db: Banco, id: string) {
  const { data: principal, error } = await db.from('reservations').select(COLUNAS_DO_SITE).eq('id', id).maybeSingle();
  if (error) throw error;
  const grupoId = (principal as any)?.group_id || (principal ? null : id);
  let grupo: any[] = [];
  if (grupoId) {
    const r = await db.from('reservations').select(COLUNAS_DO_SITE).eq('group_id', grupoId);
    if (r.error) throw r.error;
    grupo = r.data || [];
  }
  return { reserva: principal || null, grupo };
}

async function buscar(db: Banco, corpo: any) {
  const id = String(corpo?.id || '').trim();
  if (ehUuid(id)) return { status: 200, json: await reservasDoNumero(db, id.toLowerCase()) };

  // Código curto digitado pelo hóspede: só junto com o e-mail da reserva.
  const codigo = String(corpo?.codigo || '').trim().toUpperCase().replace(/-/g, '');
  const email = String(corpo?.email || '').trim().toLowerCase();
  if (!ehCodigoCurto(codigo) || !email.includes('@')) {
    return { status: 400, json: { error: 'Informe o número da reserva (8 caracteres) e o e-mail usado na reserva.' } };
  }
  const { data, error } = await db.from('reservations').select(COLUNAS_DO_SITE).ilike('main_guest->>email', email).limit(200);
  if (error) throw error;
  const achada = (data || []).find((r: any) => codigoCurto(r.id) === codigo || (r.group_id && codigoCurto(r.group_id) === codigo));
  if (!achada) return { status: 404, json: { error: 'Reserva não encontrada. Confira o número e o e-mail.' } };
  return { status: 200, json: await reservasDoNumero(db, (achada as any).id) };
}

async function mexerNoEstoque(db: Banco, quartos: Array<{ id?: string }>, entrada: string, saida: string, operacao: 'reservar' | 'devolver') {
  for (const quarto of quartos) {
    if (!ehUuid(quarto?.id)) continue;
    try {
      const { data: tipo } = await db.from('room_types').select('overrides, total_quantity, base_price').eq('id', quarto.id).maybeSingle();
      if (!tipo) continue;
      await db.from('room_types').update({ overrides: estoqueAjustado(tipo, entrada, saida, operacao) }).eq('id', quarto.id);
    } catch (err) {
      console.error('[reserva-site] estoque não ajustado:', quarto.id, err);
    }
  }
}

async function criar(db: Banco, corpo: any, contexto: ContextoDaCompra) {
  const motivo = conferirReservaDoSite(corpo?.reserva);
  if (motivo) return { status: 400, json: { error: motivo } };
  const reserva = reservaLimpa(corpo.reserva);
  const linhas = linhasPorQuarto(reserva, 'Motor de Reservas');

  const { data: existente, error } = await db.from('reservations').select('id, observations, status, main_guest').eq('id', reserva.id).maybeSingle();
  if (error) throw error;

  if (existente) {
    if (ehRascunhoDoChatbot(existente)) {
      // O chatbot já gravou a reserva e já tirou do estoque: só completa.
      const r = await db.from('reservations').upsert(linhas, { onConflict: 'id' });
      if (r.error) throw r.error;
      await enviarCompraParaMeta(reserva, contexto);
      return { status: 200, json: { ok: true } };
    }
    // Mesmo pedido reenviado (a conexão caiu depois de gravar): já está salvo.
    const mesmoHospede = String((existente as any).main_guest?.email || '').toLowerCase() === reserva.mainGuest.email.toLowerCase();
    if (mesmoHospede) return { status: 200, json: { ok: true, jaGravada: true } };
    return { status: 409, json: { error: 'Número de reserva já usado. Recarregue a página e tente de novo.' } };
  }

  // O estoque não é mexido aqui: o próprio banco tira 1 por dia quando a
  // reserva entra (conferido em 23/09). O site tirava de novo, e cada
  // reserva feita no site consumia 2 por dia. No cancelamento o banco não
  // devolve, por isso `cancelar` devolve.
  const r = await db.from('reservations').insert(linhas);
  if (r.error) throw r.error;
  // Reenvio da mesma reserva (acima) não chega aqui: a compra vai uma vez.
  await enviarCompraParaMeta(reserva, contexto);
  return { status: 200, json: { ok: true } };
}

async function cancelar(db: Banco, corpo: any) {
  const id = String(corpo?.id || '').trim().toLowerCase();
  if (!ehUuid(id)) return { status: 400, json: { error: 'Reserva inválida.' } };
  const { data: linha, error } = await db.from('reservations').select(COLUNAS_DO_SITE).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!linha) return { status: 404, json: { error: 'Reserva não encontrada.' } };
  const atual: any = linha;
  if (['CANCELED', 'CANCELLED'].includes(String(atual.status || '').toUpperCase())) {
    return { status: 409, json: { error: 'Esta reserva já foi cancelada anteriormente.' } };
  }

  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Belem' });
  const plano = cancelamentoDoSite(atual, Array.isArray(corpo.quartos) ? corpo.quartos : [], Array.isArray(corpo.extras) ? corpo.extras : [], hoje);

  if (plano.tipo === 'nada') return { status: 400, json: { error: 'Marque o que deseja cancelar.' } };

  if (plano.tipo === 'total') {
    const r = await db.from('reservations').update({ status: 'CANCELED', cancellation_reason: MOTIVO_DO_CLIENTE, card_details: null }).eq('id', id);
    if (r.error) throw r.error;
    await mexerNoEstoque(db, Array.isArray(atual.rooms) ? atual.rooms : [], atual.check_in, atual.check_out, 'devolver');
  } else {
    const r = await db.from('reservations').update(plano.alteracao).eq('id', id);
    if (r.error) throw r.error;
    await mexerNoEstoque(db, plano.quartosDevolvidos, atual.check_in, atual.check_out, 'devolver');
  }

  const { data: depois } = await db.from('reservations').select(COLUNAS_DO_SITE).eq('id', id).maybeSingle();
  return {
    status: 200,
    json: {
      tipo: plano.tipo,
      reserva: depois,
      cancelados: plano.tipo === 'parcial' ? { rooms: plano.canceladosQuartos, extras: plano.canceladosExtras } : undefined,
    },
  };
}

async function fichaExistente(db: Banco, cpf: string, nome: string): Promise<string | null> {
  const digitos = soDigitos(cpf);
  let porCpf: any = null;
  if (digitos.length === 11 || digitos.length === 14) {
    const formatado = digitos.length === 11
      ? digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
      : digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    const { data } = await db.from('guests').select('id')
      .or(`document.eq.${digitos},cpf_cnpj.eq.${digitos},document.eq.${formatado},cpf_cnpj.eq.${formatado}`)
      .limit(1).maybeSingle();
    porCpf = data;
  }
  let porNome: any = null;
  if (!porCpf && nome.trim()) {
    const { data } = await db.from('guests').select('id, document, cpf_cnpj').ilike('full_name', nome.trim().replace(/[%_\\]/g, '\\$&')).limit(1).maybeSingle();
    porNome = data;
  }
  return fichaQuePodeSerCompletada(porCpf, porNome);
}

async function gravarFicha(db: Banco, ficha: Record<string, string>): Promise<string | null> {
  const existente = await fichaExistente(db, ficha.cpf_cnpj || ficha.document || '', ficha.full_name || ficha.name || '');
  if (existente) {
    const r = await db.from('guests').update(ficha).eq('id', existente);
    if (r.error) throw r.error;
    return existente;
  }
  const { data, error } = await db.from('guests').insert([ficha]).select('id').single();
  if (error) throw error;
  return (data as any)?.id || null;
}

const jsonPequeno = (valor: unknown, max: number) => {
  try { return JSON.stringify(valor ?? null).length <= max; } catch { return false; }
};

async function preCheckin(db: Banco, corpo: any) {
  const id = String(corpo?.id || '').trim().toLowerCase();
  if (!ehUuid(id)) return { status: 400, json: { error: 'Reserva inválida.' } };
  const { data: linha, error } = await db.from('reservations').select('id, status, group_id').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!linha) return { status: 404, json: { error: 'Reserva não encontrada.' } };
  const atual: any = linha;
  if (['CANCELED', 'CANCELLED'].includes(String(atual.status || '').toUpperCase())) {
    return { status: 409, json: { error: 'Esta reserva foi cancelada.' } };
  }

  // Só as linhas desta reserva (ou do seu grupo) podem ser atualizadas.
  const permitidas = new Set<string>([id]);
  if (atual.group_id) {
    const { data } = await db.from('reservations').select('id').eq('group_id', atual.group_id);
    (data || []).forEach((r: any) => permitidas.add(String(r.id)));
  }

  // Titular: completa a ficha de mesmo CPF (ou a ficha sem documento que o
  // ERP criou com o nome), ou cria uma nova.
  const titular = fichaDoHospede(corpo.hospede);
  if (titular.full_name || titular.name) await gravarFicha(db, titular);

  // Acompanhantes com CPF viram ficha no cadastro de hóspedes.
  const acompanhantes = Array.isArray(corpo.acompanhantes) ? corpo.acompanhantes.slice(0, 20) : [];
  for (const dados of acompanhantes) {
    const ficha = fichaDoHospede(dados);
    if ((ficha.full_name || ficha.name) && soDigitos(ficha.cpf_cnpj || ficha.document)) await gravarFicha(db, ficha);
  }

  const quartos = Array.isArray(corpo.quartos) ? corpo.quartos.slice(0, 10) : [];
  for (const q of quartos) {
    const qid = String(q?.id || '').toLowerCase();
    if (!permitidas.has(qid)) continue;
    if (!jsonPequeno(q.main_guest, 5000) || !jsonPequeno(q.additional_guests, 20000)) continue;
    const r = await db.from('reservations').update({
      pre_checkin_sent: true,
      main_guest: q.main_guest,
      additional_guests: Array.isArray(q.additional_guests) ? q.additional_guests : [],
    }).eq('id', qid);
    if (r.error) throw r.error;
  }
  return { status: 200, json: { ok: true } };
}

async function cupom(db: Banco, corpo: any) {
  const codigo = String(corpo?.codigo || '').toUpperCase().trim();
  if (!codigo || codigo.length > 40) return { status: 400, json: { error: 'Cupom inválido ou expirado.' } };
  const { data, error } = await db.from('discount_codes').select('*').eq('code', codigo).limit(1).maybeSingle();
  if (error) throw error;
  if (!data || (data as any).active === false) return { status: 404, json: { error: 'Cupom inválido ou expirado.' } };
  return { status: 200, json: { cupom: cupomParaOSite(data) } };
}

const ACOES: Record<string, (db: Banco, corpo: any, contexto: ContextoDaCompra) => Promise<{ status: number; json: unknown }>> = {
  buscar, criar, cancelar, 'pre-checkin': preCheckin, cupom,
};

const cabecalho = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor) || '';

/** O que a Meta usa para ligar a reserva ao clique no anúncio. */
function contextoDaCompra(req: VercelRequest): ContextoDaCompra {
  return {
    cookies: cabecalho(req.headers.cookie),
    ip: cabecalho(req.headers['x-forwarded-for']).split(',')[0].trim() || cabecalho(req.headers['x-real-ip']),
    navegador: cabecalho(req.headers['user-agent']).slice(0, 500),
    host: cabecalho(req.headers['x-forwarded-host']) || cabecalho(req.headers.host),
    pagina: cabecalho(req.headers.referer).slice(0, 1000),
    agoraMs: Date.now(),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let db: Banco;
  try {
    db = bancoDoServidor();
  } catch {
    return res.status(503).json({ error: 'Serviço de reservas indisponível.' });
  }

  if (req.method === 'GET') {
    if (req.query.banco !== undefined) return res.status(200).json({ chave: chaveDoBanco() });
    const id = String(req.query.id || '');
    if (!id) return res.status(400).json({ error: 'Missing reservation id' });
    if (!ehUuid(id)) return res.status(200).json({ found: false });
    try {
      const { data } = await db.from('reservations').select('id, status, payment_method').eq('id', id).maybeSingle();
      if (!data) return res.status(200).json({ found: false });
      return res.status(200).json({ found: true, status: (data as any).status, paymentMethod: (data as any).payment_method });
    } catch (err) {
      console.error('[API/Check-Reservation] Error:', err);
      return res.status(500).json({ error: 'Erro ao consultar a reserva.' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const corpo = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  const acao = ACOES[String(corpo.acao || '')];
  if (!acao) return res.status(400).json({ error: 'Ação desconhecida.' });
  try {
    const r = await acao(db, corpo, contextoDaCompra(req));
    return res.status(r.status).json(r.json);
  } catch (err) {
    console.error(`[reserva-site] ${corpo.acao}:`, err);
    return res.status(500).json({ error: 'Não foi possível concluir agora. Tente de novo em instantes.' });
  }
}
