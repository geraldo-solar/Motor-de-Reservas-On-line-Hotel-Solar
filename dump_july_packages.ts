import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("No Supabase credentials in environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function dumpJulyPackages() {
  const { data: packages, error } = await supabase
    .from('packages')
    .select('*')
    .or('start_iso_date.gte.2026-07-01,name.ilike.%julho%'); // Fetch any package starting in July or with 'julho' in name

  if (error) {
    console.error(error);
    return;
  }
  
  if (!packages || packages.length === 0) {
      console.log("Nenhum pacote de Julho encontrado no banco de dados.");
      return;
  }

  console.log("\n=== TEXTO DE JULHO PRONTO PARA A IA ===\n");

  for (const p of packages) {
    if (p.start_iso_date.startsWith('2026-07') || p.name.toLowerCase().includes('julho')) {
      console.log(`#### Pacote: ${p.name}`);
      console.log(`Período de validade formal: ${p.start_iso_date} até ${p.end_iso_date}`);
      if (p.description) {
          console.log(`**Descrição:** ${p.description}`);
      }
      if (p.benefits && p.benefits.length > 0) {
          console.log(`**Benefícios Inclusos:**`);
          p.benefits.forEach((b: string) => console.log(`- ${b}`));
      }
      if (p.includes && p.includes.length > 0) {
          console.log(`**Programação Inclusa:**`);
          p.includes.forEach((i: string) => console.log(`- ${i}`));
      }
      console.log("\n-------------------------------------------------");
    }
  }
  console.log("--- FIM DA CÓPIA ---");
}

dumpJulyPackages();
