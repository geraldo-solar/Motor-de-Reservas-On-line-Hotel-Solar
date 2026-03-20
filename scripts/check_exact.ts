import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkIds() {
  const ids = ['57c42a0d-1cd2-403f-b743-21ef4f87c389', '340cb380-f7d2-48df-b31a-b0fd984f6341'];
  
  const { data: found } = await supabase.from('room_types').select('*').in('id', ids);
  
  if (found && found.length > 0) {
    found.forEach(f => console.log(f.name, f.id));
  } else {
    // maybe try searching by name or just fetch all
    const { data: all } = await supabase.from('room_types').select('id, name');
    console.log("All rooms:", all.map(a => `${a.name}: ${a.id}`));
  }
}

checkIds();
