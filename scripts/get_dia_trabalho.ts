import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDiaDoTrabalho() {
  const { data: packages, error } = await supabase
    .from('packages')
    .select('*')
    .ilike('name', '%trabalho%');
    
  if (error) {
    console.error("Error fetching packages", error);
    return;
  }
  
  if (packages && packages.length > 0) {
    console.log("Pacotes encontrados:");
    packages.forEach(pkg => {
      console.log(`- ${pkg.name}: ${pkg.start_iso_date} a ${pkg.end_iso_date}`);
      console.log(JSON.stringify(pkg.room_prices, null, 2));
    });
  } else {
    console.log("Nenhum pacote 'trabalho' encontrado. Tentando 'trabalhador'...");
    const { data: packages2 } = await supabase
      .from('packages')
      .select('*')
      .ilike('name', '%trabalhador%');
      
    if (packages2 && packages2.length > 0) {
       packages2.forEach(pkg => {
        console.log(`- ${pkg.name}: ${pkg.start_iso_date} a ${pkg.end_iso_date}`);
        console.log(JSON.stringify(pkg.room_prices, null, 2));
      });
    } else {
      console.log("Nenhum pacote encontrado.");
    }
  }
}

checkDiaDoTrabalho();
