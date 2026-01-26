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

    const { email, attributes, listIds, updateEnabled, ext_id, tags } = request.body;

    if (!email) {
        return response.status(400).json({ error: 'Missing email' });
    }

    const apiKey = process.env.VITE_BREVO_API_KEY || process.env.BREVO_API_KEY;

    if (!apiKey) {
        return response.status(500).json({ error: 'Server misconfiguration: Missing email API key' });
    }

    try {
        const brevoResponse = await fetch('https://api.brevo.com/v3/contacts', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                email,
                attributes,
                listIds,
                updateEnabled,
                ext_id,
                tags
            }),
        });

        if (!brevoResponse.ok) {
            // Se já existe (400), muitas vezes é "Duplicate", então tentamos update? O parametro updateEnabled já deveria tratar isso na API Contacts do Brevo (v3). 
            // Mas se falhar, retornamos o erro.
            const errorText = await brevoResponse.text();
            console.error('Brevo Contacts API Error:', brevoResponse.status, errorText);
            return response.status(brevoResponse.status).json({ error: 'Failed to sync contact', details: errorText });
        }

        const data = await brevoResponse.json();
        return response.status(200).json(data);
    } catch (error: any) {
        console.error('Internal Server Error:', error);
        return response.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
