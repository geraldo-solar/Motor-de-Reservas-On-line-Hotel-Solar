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

    if (request.method === 'GET') {
        const hasKey = !!(process.env.VITE_BREVO_API_KEY || process.env.BREVO_API_KEY);
        return response.status(200).json({
            status: 'online',
            provider: 'Brevo',
            configured: hasKey,
            message: hasKey ? 'Ready to send' : 'MISSING_API_KEY'
        });
    }

    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method not allowed' });
    }

    const { to, subject, htmlContent, sender } = request.body;

    if (!to || !subject || !htmlContent || !sender) {
        return response.status(400).json({ error: 'Missing required fields' });
    }

    // Obter chave da API do ambiente (Suporta VITE_ prefixo ou sem, para compatibilidade)
    const apiKey = process.env.VITE_BREVO_API_KEY || process.env.BREVO_API_KEY;

    if (!apiKey) {
        console.error('BREVO_API_KEY not configured in server environment');
        return response.status(500).json({ error: 'Server misconfiguration: Missing email API key' });
    }

    try {
        const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                sender,
                to,
                subject,
                htmlContent,
            }),
        });

        if (!brevoResponse.ok) {
            const errorText = await brevoResponse.text();
            console.error('Brevo API Error:', brevoResponse.status, errorText);
            return response.status(brevoResponse.status).json({ error: 'Failed to send email', details: errorText });
        }

        const data = await brevoResponse.json();
        return response.status(200).json(data);
    } catch (error: any) {
        console.error('Internal Server Error:', error);
        return response.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
