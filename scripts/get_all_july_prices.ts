import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkJulyPackages() {
  const fileData = fs.readFileSync(path.resolve(process.cwd(), 'july_migration.json'), 'utf-8');
  const allPackages = JSON.parse(fileData);
  
  // Filter only weekends (length = 3 nights) -> exclude "Semana da Família"
  const packages = allPackages.filter(p => p.id !== 'jul-family');
  
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

      const sortedRooms = [...rooms].sort((a,b) => a.base_price - b.base_price);

      sortedRooms.forEach(room => {
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
    
        if (available) {
            console.log(`- ${room.name}: R$ ${totalPrice}`);
        } else {
            console.log(`- ${room.name}: Esgotado/Fechado`);
        }
      });
  });
}

checkJulyPackages();
