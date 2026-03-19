import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Configura CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  const { audioUrl } = req.body;
  const authHeader = req.headers.authorization;

  if (!audioUrl) {
    return res.status(400).json({ error: 'Missing audioUrl in body.' });
  }
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header (Bearer token).' });
  }

  try {
    // 1. Baixar o arquivo de áudio da URL enviada pelo Manychat
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      throw new Error(`Failed to download audio from URL: ${audioRes.statusText}`);
    }

    const arrayBuffer = await audioRes.arrayBuffer();
    
    // WhatsApp/Manychat áudios geralmente chegam em OGG
    const blob = new Blob([arrayBuffer], { type: 'audio/ogg' });

    // 2. Montar FormData para o Whisper (OpenAI)
    const formData = new FormData();
    formData.append('file', blob, 'audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt'); // Força português

    // 3. Enviar form-data com o buffer gravado diretamente para a API do Whisper
    const openAiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': authHeader
        // O Fetch nativo constrói sozinho o Content-Type: multipart/form-data com o boundary do FormData
      },
      body: formData
    });

    const data = await openAiRes.json() as { text?: string, error?: any };

    if (!openAiRes.ok) {
        console.error("OpenAI Whisper Error:", data);
        return res.status(500).json({ error: data.error?.message || 'OpenAI API Error' });
    }

    // Devolve o texto traduzido formatado bonitinho
    return res.status(200).json({ 
        message: 'Success', 
        text: data.text 
    });

  } catch (error: any) {
    console.error("Transcription Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
