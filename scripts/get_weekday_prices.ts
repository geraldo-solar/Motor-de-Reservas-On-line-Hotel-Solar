import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkWeekdayPrices() {
  const { data: rooms } = await supabase.from('room_types').select('*').eq('active', true);
  
  const getPriceForDate = (room, dateIso) => {
    const override = room.overrides?.find(o => o.dateIso === dateIso);
    return override?.price !== undefined ? override.price : room.base_price;
  };
  
  const sortedRooms = [...rooms].sort((a,b) => a.base_price - b.base_price);
  const sampleStartDate = new Date('2026-07-05'); // Um domingo no pacote de semana da família
  const daysInStay = 4; // de Domingo (checkin) a Quinta (checkout) são 4 diárias
  
  console.log("Simulação de Valor para 4 Diárias (Domingo a Quinta-Feira em Julho):");

  sortedRooms.forEach(room => {
    let totalPrice = 0;
    let available = true;
        
    for (let i = 0; i < daysInStay; i++) {
        const currentDate = new Date(sampleStartDate);
        currentDate.setDate(currentDate.getDate() + i);
        const dateIso = currentDate.toISOString().split('T')[0];
        
        const override = room.overrides?.find(o => o.dateIso === dateIso);
        if (override?.isClosed) {
            available = false;
        }
        totalPrice += getPriceForDate(room, dateIso);
    }
    
    if (available) {
        console.log(`- ${room.name}: R$ ${totalPrice} (ou R$ ${totalPrice/4} a média da diária)`);
    } else {
        console.log(`- ${room.name}: Esgotado/Fechado`);
    }
  });
}

checkWeekdayPrices();
