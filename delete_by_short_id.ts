import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function deleteReservation() {
  const shortId = "49722AC8".toLowerCase();
  console.log(`Searching for reservation with id starting with '${shortId}'...`);
  
  // Fetch all to find the matching UUID prefix
  let { data: allRes, error: selectError } = await supabase
    .from('reservations')
    .select('id, main_guest');

  if (selectError) {
      console.error("Error querying:", selectError);
      return;
  }

  const toDelete = allRes?.filter(r => r.id.toLowerCase().startsWith(shortId));

  if (!toDelete || toDelete.length === 0) {
      console.log(`No reservation found starting with ${shortId}.`);
      return;
  }

  console.log(`Found ${toDelete.length} reservation(s) to delete.`);

  for (const res of toDelete) {
      const { error: deleteError } = await supabase
          .from('reservations')
          .delete()
          .eq('id', res.id);
      
      if (deleteError) {
          console.error(`Failed to delete ${res.id}:`, deleteError.message);
      } else {
          console.log(`Deleted reservation ${res.id} for ${res.main_guest?.name}`);
      }
  }
}

deleteReservation();
