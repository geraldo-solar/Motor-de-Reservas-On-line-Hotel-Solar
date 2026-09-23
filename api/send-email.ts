import type { VercelRequest, VercelResponse } from '@vercel/node';

// Envio dos e-mails de reserva (confirmação, pré-check-in, pagamento,
// cancelamento, aviso ao hotel).
//
// Até 23/09 esta rota mandava qualquer e-mail, para qualquer destinatário,
// com qualquer remetente, pela conta do Brevo do hotel — qualquer pessoa na
// internet podia usá-la para mandar golpe "do Hotel Solar". Tinha também a
// chave do Brevo escrita no código e mostrava pedaços dela num GET.
//
// Agora:
//   - o remetente é sempre o do hotel (o que vem de fora é ignorado);
//   - cada envio informa a reserva, e só pode ir para o e-mail do hóspede
//     dessa reserva ou para o endereço interno do hotel;
//   - a chave vem só da variável de ambiente do servidor.
//
// Ainda falta (VEN-10, fase 2): o conteúdo ser montado aqui no servidor, e
// não no navegador.

const REMETENTE = { name: 'Hotel Solar', email: 'reserva@hotelsolar.tur.br' };
const NOMES_ACEITOS = new Set(['Hotel Solar', 'Sistema de Reservas']);
const ENDERECOS_DO_HOTEL = new Set(['reserva@hotelsolar.tur.br']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORIGENS = new Set([
    'https://reservas.hotelsolar.tur.br',
    'https://motor-de-reservas-on-line-hotel-sol.vercel.app',
]);

const normalizar = (email: unknown) => String(email || '').trim().toLowerCase();

async function emailDoHospede(reservationId: string): Promise<string | null> {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    // Chave do servidor quando existir; a pública ainda lê reservas hoje e
    // deixa de ler na fase 3 do VEN-10 (aí a do servidor passa a ser exigida).
    const chave = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !chave) return null;
    const r = await fetch(`${url}/rest/v1/reservations?id=eq.${reservationId}&select=main_guest`, {
        headers: { apikey: chave, Authorization: `Bearer ${chave}` },
    });
    if (!r.ok) return null;
    const linhas = await r.json().catch(() => []);
    const hospede = Array.isArray(linhas) ? linhas[0]?.main_guest : null;
    return hospede?.email ? normalizar(hospede.email) : null;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
    const origem = String(request.headers.origin || '');
    response.setHeader('Access-Control-Allow-Origin', ORIGENS.has(origem) ? origem : 'https://reservas.hotelsolar.tur.br');
    response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Vary', 'Origin');

    if (request.method === 'OPTIONS') return response.status(204).end();
    if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });

    const { to, subject, htmlContent, sender, reservationId } = request.body || {};
    const destinatarios = Array.isArray(to) ? to : [];
    if (!destinatarios.length || destinatarios.length > 3 || typeof subject !== 'string' || typeof htmlContent !== 'string') {
        return response.status(400).json({ error: 'Missing required fields' });
    }
    if (subject.length > 200 || htmlContent.length > 200_000) {
        return response.status(413).json({ error: 'Email too large' });
    }
    if (typeof reservationId !== 'string' || !UUID.test(reservationId)) {
        return response.status(400).json({ error: 'reservationId required' });
    }

    const apiKey = process.env.BREVO_API_KEY || process.env.VITE_BREVO_API_KEY;
    if (!apiKey) {
        console.error('BREVO_API_KEY not configured in server environment');
        return response.status(500).json({ error: 'Server misconfiguration' });
    }

    // Só o hóspede desta reserva ou o endereço interno do hotel.
    const hospede = await emailDoHospede(reservationId);
    const recusado = destinatarios.find((d: any) => {
        const e = normalizar(d?.email);
        return !ENDERECOS_DO_HOTEL.has(e) && e !== hospede;
    });
    if (recusado) {
        console.warn('[send-email] Destinatário fora da reserva recusado');
        return response.status(403).json({ error: 'Recipient not allowed' });
    }

    const nome = NOMES_ACEITOS.has(String(sender?.name)) ? String(sender.name) : REMETENTE.name;

    try {
        const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { accept: 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
            body: JSON.stringify({
                sender: { name: nome, email: REMETENTE.email },
                to: destinatarios.map((d: any) => ({ email: normalizar(d.email), name: String(d?.name || '').slice(0, 120) })),
                subject,
                htmlContent,
            }),
        });
        if (!brevoResponse.ok) {
            console.error('Brevo API Error:', brevoResponse.status, (await brevoResponse.text()).slice(0, 300));
            return response.status(502).json({ error: 'Failed to send email' });
        }
        return response.status(200).json(await brevoResponse.json());
    } catch (error: any) {
        console.error('Internal Server Error:', error?.message);
        return response.status(500).json({ error: 'Internal Server Error' });
    }
}
