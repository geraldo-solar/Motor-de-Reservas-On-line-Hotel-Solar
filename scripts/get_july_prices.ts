import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkJulyPackages() {
  const { data: allPackages, error } = await supabase
    .from('packages')
    .select('*')
    .order('start_iso_date', { ascending: true });
    
  console.log("ALL PACKAGES:", allPackages?.map(p => ({name: p.name, start: p.start_iso_date, end: p.end_iso_date, cat: p.category})));
  
  const packages = allPackages?.filter(p => p.start_iso_date.startsWith('2026-07') || p.name.toLowerCase().includes('julho'));
    
  if (error || !packages || packages.length === 0) {
    console.log("No july packages found matching 'julho'. Checking by dates.");
    // Fallback?
    return;
  }
  
  const { data: rooms } = await supabase.from('room_types').select('*').eq('active', true);
  
  const getPriceForDate = (room, dateIso) => {
    const override = room.overrides?.find(o => o.dateIso === dateIso);
    return override?.price !== undefined ? override.price : room.base_price;
  };

  packages.forEach(pkg => {
      const startDate = new Date(pkg.start_iso_date);
      const endDate = new Date(pkg.end_iso_date);
      
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      console.log(`\nPacote: ${pkg.name} (${pkg.start_iso_date} a ${pkg.end_iso_date}) - ${diffDays} diárias`);

      rooms.forEach(room => {
        let totalPrice = 0;
        let available = true;
        
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
        
        if (pkg.discount_percentage) {
            totalPrice = totalPrice - (totalPrice * (pkg.discount_percentage / 100));
        }
    
        if (available) {
            console.log(`- ${room.name}: R$ ${totalPrice}`);
        } else {
            console.log(`- ${room.name}: Esgotado/Fechado`);
        }
      });
  });
}

checkJulyPackages();
