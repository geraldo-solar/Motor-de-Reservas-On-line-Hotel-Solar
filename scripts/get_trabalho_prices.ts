import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDiaDoTrabalhoPrices() {
  const { data: pkg } = await supabase
    .from('packages')
    .select('*')
    .ilike('name', '%namorado%')
    .single();
    
  if (!pkg) {
    console.error("Package not found");
    return;
  }
  
  const startDate = new Date(pkg.start_iso_date);
  const endDate = new Date(pkg.end_iso_date);
  
  // Calculate number of nights
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  console.log(`Pacote: ${pkg.name} (${pkg.start_iso_date} a ${pkg.end_iso_date}) - ${diffDays} diárias`);

  const { data: rooms } = await supabase.from('room_types').select('*').eq('active', true);
  
  const getPriceForDate = (room, dateIso) => {
    const override = room.overrides?.find(o => o.dateIso === dateIso);
    return override?.price !== undefined ? override.price : room.base_price;
  };

  rooms.forEach(room => {
    let totalPrice = 0;
    let available = true;
    
    // Check price and availability for each night
    for (let i = 0; i < diffDays; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(currentDate.getDate() + i);
        const dateIso = currentDate.toISOString().split('T')[0];
        
        const override = room.overrides?.find(o => o.dateIso === dateIso);
        if (override?.isClosed) {
            available = false;
        }
        totalPrice += getPriceForDate(room, dateIso);
    }
    
    // Apply package discount percentage if any
    if (pkg.discount_percentage) {
        totalPrice = totalPrice - (totalPrice * (pkg.discount_percentage / 100));
    }

    if (available) {
        console.log(`- ${room.name}: R$ ${totalPrice}`);
    } else {
        console.log(`- ${room.name}: Esgotado/Fechado`);
    }
  });
}

checkDiaDoTrabalhoPrices();
