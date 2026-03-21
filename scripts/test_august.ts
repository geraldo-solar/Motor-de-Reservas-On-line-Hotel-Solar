import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function check() {
  const { data: room } = await supabase.from('room_types').select('name, overrides').eq('name', 'Suíte Casal').single();
  const aug1 = room.overrides.find((o: any) => o.dateIso === '2026-08-01');
  const aug2 = room.overrides.find((o: any) => o.dateIso === '2026-08-02');
  console.log("Aug 1 (Sat):", aug1);
  console.log("Aug 2 (Sun):", aug2);
}
check();
