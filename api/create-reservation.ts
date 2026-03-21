import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
// import { generateUUID } from '../utils/uuid';
// import { generateClientEmailHTML, generateHotelEmailHTML, HOTEL_CONFIG } from '../services/emailService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // TEST LEVEL 1: Check if basic handler runs despite all top-level imports existing.
  if (req.body?.testLevel === 1) {
    return res.status(200).json({ status: 'ok', level: 1 });
  }

  // Supabase setup moved inside handler to prevent Top-Level crashes
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    return res.status(500).json({ error: "Missing Supabase credentials" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // TEST LEVEL 2: Supabase client instantiated successfully without hanging Vercel
  if (req.body?.testLevel === 2) {
    return res.status(200).json({ status: 'ok', level: 2 });
  }

  // Transpiler Bisection Complete Block
  return res.status(200).json({ status: 'transpiler_passed' });
}
