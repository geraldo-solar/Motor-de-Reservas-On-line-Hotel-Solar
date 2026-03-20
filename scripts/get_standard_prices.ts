import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStandardPrices() {
  const { data: rooms } = await supabase.from('room_types').select('*').eq('active', true);
  
  const getPriceForDate = (room, dateIso) => {
    const override = room.overrides?.find(o => o.dateIso === dateIso);
    return override?.price !== undefined ? override.price : room.base_price;
  };
  
  const sortedRooms = [...rooms].sort((a,b) => a.base_price - b.base_price);
  
  // Datas comuns no 1º semestre (fora de feriado)
  // Terça-feira, 12 de Maio de 2026 (Meio de semana)
  const weekdayIso = '2026-05-12';
  
  // Sábado, 16 de Maio de 2026 (Final de semana)
  const weekendIso = '2026-05-16';

  console.log("Valores para Diárias na Baixa Temporada (Ex: Maio 2026 fora de feriados)\n");

  console.log("--- DIA DE SEMANA (Domingo a Quinta) ---");
  sortedRooms.forEach(room => {
    let price = getPriceForDate(room, weekdayIso);
    console.log(`- ${room.name}: R$ ${price}`);
  });
  
  console.log("\n--- FINAL DE SEMANA (Sexta e Sábado) ---");
  sortedRooms.forEach(room => {
    let price = getPriceForDate(room, weekendIso);
    console.log(`- ${room.name}: R$ ${price}`);
  });
}

checkStandardPrices();
