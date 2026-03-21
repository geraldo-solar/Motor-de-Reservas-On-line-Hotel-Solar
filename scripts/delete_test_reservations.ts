import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function deleteTestReservations() {
  console.log("Buscando reservas de teste...");
  
  // Buscar todas as reservas para filtrar no client (já que jsonb filter pode ser verboso ou ter limitacões dependo de como a col foi criada)
  const { data: reservations, error } = await supabase.from('reservations').select('id, main_guest');
  
  if (error) {
    console.error("Erro ao buscar reservas:", error);
    return;
  }

  const toDelete = reservations.filter(res => {
    const name = res.main_guest?.name?.toLowerCase() || '';
    return name.includes('antigravity');
  });

  console.log(`Encontradas ${toDelete.length} reserva(s) para deletar.`);

  if (toDelete.length === 0) {
    console.log("Nenhuma reserva encontrada com esses critérios.");
    return;
  }

  for (const res of toDelete) {
    console.log(`Deletando reserva ID: ${res.id} (Nome: ${res.main_guest?.name})`);
    const { error: deleteError } = await supabase.from('reservations').delete().eq('id', res.id);
    if (deleteError) {
      console.error(`Erro ao deletar ${res.id}:`, deleteError);
    } else {
      console.log(`Sucesso ao deletar ${res.id}`);
    }
  }
}

deleteTestReservations();
