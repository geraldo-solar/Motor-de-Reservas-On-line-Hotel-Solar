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

async function dumpPackages() {
  const { data: packages, error } = await supabase.from('packages').select('*').eq('active', true);
  if (error) {
    console.error(error);
    return;
  }
  
  if (!packages || packages.length === 0) {
      console.log("Nenhum pacote ativo encontrado.");
      return;
  }

  console.log("\n=== TEXTO PRONTO PARA O CÉREBRO DA IA ===\n");
  console.log("Copie o texto abaixo e cole lá nas Instruções do seu Assistente na OpenAI (ou adicione no final do hotel_solar_chatbot_knowledge_base.md):\n");
  console.log("--- INÍCIO DA CÓPIA ---");
  console.log("### PACOTES ESPECIAIS E PROGRAMAÇÕES ATIVAS DA TEMPORADA ###");
  console.log("O Hotel Solar possui os seguintes pacotes especiais com suas respectivas programações e benefícios inclusos. Quando o hóspede perguntar sobre detalhes, programação ou benefícios de um desses pacotes, use as informações abaixo para encantar e detalhar tudo que ele terá direito:\n");

  for (const p of packages) {
    console.log(`#### Pacote: ${p.name}`);
    console.log(`Período de validade formal: ${p.start_iso_date} até ${p.end_iso_date}`);
    if (p.description) {
        console.log(`\n**Descrição:**`);
        console.log(`${p.description}`);
    }
    if (p.benefits && p.benefits.length > 0) {
        console.log(`\n**Benefícios do Pacote:**`);
        p.benefits.forEach((b: string) => console.log(`- ${b}`));
    }
    if (p.includes && p.includes.length > 0) {
        console.log(`\n**Programação Inclusa:**`);
        p.includes.forEach((i: string) => console.log(`- ${i}`));
    }
    console.log("\n-------------------------------------------------");
  }
  console.log("--- FIM DA CÓPIA ---");
}

dumpPackages();
