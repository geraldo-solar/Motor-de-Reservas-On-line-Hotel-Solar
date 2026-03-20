import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function getDetails() {
  const { data: rooms, error } = await supabase.from('room_types').select('*').eq('active', true);
  
  if (error) {
      console.error("Erro ao buscar:", error);
      return;
  }
  
  rooms.forEach(r => {
      console.log(`\n### ${r.name}`);
      console.log(`- Descrição: ${r.description || 'Não cadastrado'}`);
      console.log(`- Metragem: ${r.area_sqm || r.size || 'Não cadastrado'}`);
      console.log(`- Comodidades Extras/Setup: ${JSON.stringify(r.amenities || r.features || {})}`);
      console.log(`- Ocupação Mín/Máx: ${r.min_occupancy || 1} a ${r.max_occupancy || 'N/A'}`);
  });
}

getDetails();
