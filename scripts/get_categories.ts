import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
  const { data: tables, error } = await supabase.rpc('get_tables_info');
  // Since we might not have RPC, let's try querying `room_types` or `room_categories`
  const { data: cat1 } = await supabase.from('room_categories').select('*');
  if (cat1) console.log("room_categories:", cat1);
  
  const { data: cat2 } = await supabase.from('room_types').select('*');
  if (cat2) console.log("room_types:", cat2);
  
  const { data: cat3 } = await supabase.from('hotel_rooms').select('*');
  if (cat3) console.log("hotel_rooms:", cat3);
}

checkTables();
