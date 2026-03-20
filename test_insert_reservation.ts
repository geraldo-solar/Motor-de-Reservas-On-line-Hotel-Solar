import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function testInsert() {
  const reservationId = crypto.randomUUID();
  const dataToSave = {
      id: reservationId,
      created_at: new Date().toISOString(),
      check_in: "2026-10-10",
      check_out: "2026-10-12",
      nights: 2,
      main_guest: {
        name: "Teste AI Chatbot",
        email: "teste@ai.com",
        phone: "91999999999",
        cpf: "00000000000"
      },
      additional_guests: [
        { name: "Acompanhante 1", roomName: "Suíte Casal" }
      ],
      observations: "[ORIGEM: AI CHATBOT] Reserva de teste para verificar RLS.",
      rooms: [
        { id: "test-room-id", name: "Suíte Casal", priceSnapshot: 500 }
      ],
      extras: [],
      total_price: 1000,
      payment_method: 'PIX',
      status: 'PENDING'
  };

  console.log("Tentando inserir reserva de teste...");
  const { data, error } = await supabase.from('reservations').insert(dataToSave).select();

  if (error) {
      console.error("ERRO DE INSERT:", error);
  } else {
      console.log("SUCESSO! Reserva inserida:", data);
      
      // Limpar teste
      console.log("Limpando reserva de teste...");
      await supabase.from('reservations').delete().eq('id', reservationId);
  }
}

testInsert();
