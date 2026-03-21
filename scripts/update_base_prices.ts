import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function updateBasePrices() {
  const newPrices = {
    "Suíte Casal": 370,
    "Suíte Triplo": 440,
    "Suíte Sacada Vista Mar": 540,
    "Suíte Quádruplo": 540,
    "Suíte Varanda Térreo": 585,
    "LOFT": 830
  };

  for (const [name, price] of Object.entries(newPrices)) {
    const { data: rooms } = await supabase.from('room_types').select('id').eq('name', name);
    if (rooms && rooms.length > 0) {
      await supabase.from('room_types').update({ base_price: price }).eq('id', rooms[0].id);
      console.log(`Updated ${name} to ${price}`);
    } else {
      console.log(`Room ${name} not found`);
    }
  }
}
updateBasePrices();
