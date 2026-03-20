import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSemanaSanta() {
  const { data: packages } = await supabase
    .from('packages')
    .select('*')
    .ilike('name', '%semana santa%');
  
  const pkg = packages[0];
  
  const { data: roomTypes } = await supabase
    .from('room_types')
    .select('id, name');
    
  const typeMap = roomTypes.reduce((acc, curr) => {
    acc[curr.id] = curr.name;
    return acc;
  }, {});
  
  console.log(`Pacote: ${pkg.name} (${pkg.start_iso_date} a ${pkg.end_iso_date})`);
  console.log("Valores por quarto:");
  pkg.room_prices.forEach(rp => {
    if (rp.price > 0) {
      console.log(`- ${typeMap[rp.roomId] || rp.roomId}: R$ ${rp.price}`);
    }
  });
}

checkSemanaSanta();
