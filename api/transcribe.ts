import type { VercelRequest, VercelResponse } from '@vercel/node';
import { transcribeAudio } from '../utils/audioTranscription.js';
import { AUDIO_RETRY } from '../utils/audioInput.js';

// Kept for existing integrations. The general attendance uses the same
// transcription function inside conversation-control's prepare operation.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({error:'Use POST'});
  if (!req.body?.audioUrl) return res.status(400).json({error:'Missing audioUrl'});
  if (!req.headers?.authorization) return res.status(401).json({error:'Missing Authorization'});
  try {
    const text = await transcribeAudio(String(req.body.audioUrl), req.headers.authorization);
    return res.status(200).json({message:'Success',status:'ok',text});
  } catch {
    // ManyChat maps only HTTP 200 responses. Never expose provider errors,
    // signed media links or credentials to a contact.
    return res.status(200).json({message:AUDIO_RETRY,status:'error',text:''});
  }
}
