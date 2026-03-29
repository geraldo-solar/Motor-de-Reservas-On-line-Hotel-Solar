import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;

// We need the service role key to reliably delete records if RLS blocks anon key.
// I will try with SUPABASE_SERVICE_ROLE_KEY if it exists, otherwise fallback to anon.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function deleteReservations() {
  console.log("Deleting reservations with name 'Geraldo' or 'Luiza Barros'...");
  
  const { data: toDelete, error: selectError } = await supabase
    .from('reservations')
    .select('id, main_guest')
    .or("main_guest->>name.ilike.%Geraldo%,main_guest->>name.ilike.%Luiza%Barros%");

  if (selectError) {
      console.error("Error querying:", selectError);
      return;
  }

  if (!toDelete || toDelete.length === 0) {
      console.log("No reservations found to delete.");
      return;
  }

  console.log(`Found ${toDelete.length} reservations to delete.`);

  for (const res of toDelete) {
      const { error: deleteError } = await supabase
          .from('reservations')
          .delete()
          .eq('id', res.id);
      
      if (deleteError) {
          console.error(`Failed to delete ${res.id}:`, deleteError.message);
      } else {
          console.log(`Deleted reservation ${res.id} for ${res.main_guest.name}`);
      }
  }
}

deleteReservations();
