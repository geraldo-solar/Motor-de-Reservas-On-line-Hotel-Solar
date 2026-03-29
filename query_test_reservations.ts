import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
// For reliable deletions, sometimes we might need service role key if RLS blocks delete. Let's try anon key first.
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function queryReservations() {
  console.log("Querying reservations with name 'Geraldo' or 'Luiza Barros'...");
  
  const { data, error } = await supabase
    .from('reservations')
    .select('id, created_at, main_guest, check_in, check_out')
    .or("main_guest->>name.ilike.%Geraldo%,main_guest->>name.ilike.%Luiza%Barros%");

  if (error) {
      console.error("Error querying:", error);
  } else {
      console.log("Found reservations:", JSON.stringify(data, null, 2));
  }
}

queryReservations();
