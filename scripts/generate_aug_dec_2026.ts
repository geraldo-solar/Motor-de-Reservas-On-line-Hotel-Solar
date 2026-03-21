import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

const WEEKDAY_PRICES: Record<string, number> = {
  "Suíte Casal": 410,
  "Suíte Triplo": 490,
  "Suíte Sacada Vista Mar": 599,
  "Suíte Quádruplo": 599,
  "Suíte Varanda Térreo": 650,
  "LOFT": 910
};

const WEEKEND_PRICES: Record<string, number> = {
  "Suíte Casal": 610,
  "Suíte Triplo": 710,
  "Suíte Sacada Vista Mar": 810,
  "Suíte Quádruplo": 810,
  "Suíte Varanda Térreo": 920,
  "LOFT": 1450
};

async function applyOverrides() {
  const { data: rooms } = await supabase.from('room_types').select('*').eq('active', true);
  if (!rooms) return;

  const startDate = new Date('2026-08-01T12:00:00-03:00');
  const endDate = new Date('2026-12-28T12:00:00-03:00');

  let totalDates = 0;

  for (const room of rooms) {
    let baseOverrides = room.overrides || [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const iso = currentDate.toISOString().split('T')[0];
      const day = currentDate.getDay();
      
      const isWeekend = day === 5 || day === 6;
      const priceToUse = isWeekend 
         ? WEEKEND_PRICES[room.name] || room.base_price 
         : WEEKDAY_PRICES[room.name] || room.base_price;

      // Removes previous override for this date if it exists
      baseOverrides = baseOverrides.filter((o: any) => o.dateIso !== iso);

      // Add the new blocked override
      baseOverrides.push({
        dateIso: iso,
        price: priceToUse,
        isClosed: true
      });

      if (room.id === rooms[0].id) totalDates++;

      currentDate.setDate(currentDate.getDate() + 1);
    }

    const { error } = await supabase.from('room_types').update({ overrides: baseOverrides }).eq('id', room.id);
    if (!error) {
      console.log(`✅ ${room.name} atualizado com novas restrições de calendário! (${baseOverrides.length} dias na tabela)`);
    } else {
      console.error(`❌ Erro no ${room.name}:`, error);
    }
  }
}

applyOverrides();
