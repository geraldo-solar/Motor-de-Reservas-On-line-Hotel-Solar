import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSemanaSanta() {
  const { data: all_rooms, error } = await supabase.from('rooms').select('*');
  
  const { data: all_cats } = await supabase.from('room_categories').select('*');
  
  const { data: all_types } = await supabase.from('room_types').select('*');
  
  const { data: hotel_rooms } = await supabase.from('hotel_rooms').select('*');

  const targetIds = ['57c42a0d-1cd2-403f-b743-21ef4f87c389', '340cb380-f7d2-48df-b31a-b0fd984f6341'];
  
  if (all_rooms) {
    all_rooms.forEach(t => { if (targetIds.includes(t.id)) console.log("rooms:", t); });
  }
  if (all_cats) {
    all_cats.forEach(t => { if (targetIds.includes(t.id)) console.log("room_categories:", t); });
  }
  if (all_types) {
    all_types.forEach(t => { if (targetIds.includes(t.id)) console.log("room_types:", t); });
  }
  if (hotel_rooms) {
    hotel_rooms.forEach(t => { if (targetIds.includes(t.id)) console.log("hotel_rooms:", t); });
  }
}

checkSemanaSanta();
