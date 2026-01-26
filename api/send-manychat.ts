import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(request: VercelRequest, response: VercelResponse) {
    // Configurar CORS
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    response.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (request.method === 'OPTIONS') {
        response.status(200).end();
        return;
    }

    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method not allowed' });
    }

    const { endpoint, method = 'GET', body } = request.body;

    if (!endpoint) {
        return response.status(400).json({ error: 'Missing endpoint' });
    }

    // Obter chave da API
    const rawKey = process.env.VITE_MANYCHAT_API_KEY || process.env.MANYCHAT_API_KEY || '';

    if (request.method === 'GET') {
        const masked = rawKey.length > 10 ? `${rawKey.substring(0, 5)}...` : 'INVALID';
        return response.status(200).json({
            status: 'online',
            provider: 'Manychat',
            configured: !!rawKey,
            keyDebug: masked,
            "startsWithBearer": rawKey.startsWith('Bearer'), // Debug para saber se duplicou
            details: 'Envie POST com { endpoint, method, body }'
        });
    }

    if (!rawKey) {
        console.error('MANYCHAT_API_KEY not configured');
        return response.status(500).json({ error: 'Server misconfiguration: Missing Manychat API key' });
    }

    try {
        const url = `https://api.manychat.com${endpoint}`;

        // Limpar chave se usuário colou 'Bearer ' duplicado
        const token = rawKey.replace(/^Bearer\s+/i, '').trim();

        const headers: Record<string, string> = {
            'accept': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        if (method !== 'GET') {
            headers['content-type'] = 'application/json';
        }

        const fetchOptions: RequestInit = {
            method,
            headers
        };

        if (body && method !== 'GET') {
            fetchOptions.body = JSON.stringify(body);
        }

        const manychatResponse = await fetch(url, fetchOptions);
        const data = await manychatResponse.json();

        if (!manychatResponse.ok) {
            console.error('Manychat API Error:', manychatResponse.status, JSON.stringify(data));
            return response.status(manychatResponse.status).json(data);
        }

        return response.status(200).json(data);
    } catch (error: any) {
        console.error('Internal Server Error:', error);
        return response.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
