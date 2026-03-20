import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
}

const supabase = createClient(supabaseUrl!, supabaseKey!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Missing reservation id' });
  }

  try {
    const { data, error } = await supabase
      .from('reservations')
      .select('id, status, payment_method')
      .eq('id', id)
      .single();

    if (error || !data) {
      // Not found means the user didn't finish the draft link checkout
      return res.status(200).json({ found: false });
    }

    // Found means the user completed the checkout form
    return res.status(200).json({ found: true, status: data.status, paymentMethod: data.payment_method });

  } catch (err: any) {
    console.error('[API/Check-Reservation] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
