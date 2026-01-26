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
    const apiKey = process.env.VITE_MANYCHAT_API_KEY || process.env.MANYCHAT_API_KEY;

    if (!apiKey) {
        console.error('MANYCHAT_API_KEY not configured');
        return response.status(500).json({ error: 'Server misconfiguration: Missing Manychat API key' });
    }

    try {
        const url = `https://api.manychat.com${endpoint}`;

        // Manychat requer Token no Authorization header: "Bearer <token>"
        // VITE_MANYCHAT_API_KEY geralmente é "Bearer ..." ou apenas o token? 
        // O código original usava: headers: { 'Authorization': 'Bearer ' + API_KEY, ... }
        // Vamos assumir que a env var NÃO tem o 'Bearer ' ainda, igual ao original.

        const headers: Record<string, string> = {
            'accept': 'application/json',
            'Authorization': `Bearer ${apiKey}`
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
