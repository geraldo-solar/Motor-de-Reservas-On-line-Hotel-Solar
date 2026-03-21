import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function getPrices() {
  const { data: rooms, error } = await supabase.from('room_types').select('name, base_price, capacity').eq('active', true).order('base_price', { ascending: true });
  
  if (error) {
    console.error(error);
    return;
  }
  
  console.log("Valores Base de Diárias (Fora de Feriados/Promoções):\n");
  rooms.forEach(room => {
    const wd = room.base_price;
    const we = Math.round(room.base_price * 1.15);
    console.log(`- **${room.name}** (Até ${room.capacity} hóspedes):`);
    console.log(`  - Meio de semana (Dom a Qui): R$ ${wd}`);
    console.log(`  - Final de semana (Sex e Sáb): R$ ${we}\n`);
  });
}
getPrices();
