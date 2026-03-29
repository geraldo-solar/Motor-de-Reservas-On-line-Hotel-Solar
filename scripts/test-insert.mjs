import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/geraldobarros/Documents/Motor de Reservas/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Starting Supabase Insert...");
  const dataToSave = {
    id: 'res-' + Math.random().toString(36).substring(2, 10),
    created_at: new Date().toISOString(),
    check_in: "2026-03-20",
    check_out: "2026-03-21",
    nights: 1,
    main_guest: { name: "Antigravity Timeout Test" },
    additional_guests: [],
    observations: "Testing infinite hang",
    rooms: [],
    extras: [],
    total_price: 100,
    payment_method: 'PIX',
    status: 'PENDING'
  };

  const start = Date.now();
  try {
    const { data, error } = await supabase.from('reservations').insert(dataToSave).select().single();
    console.log(`Finished in ${Date.now() - start}ms`, { data, error });
  } catch (e) {
    console.error(`Crashed in ${Date.now() - start}ms`, e);
  }
}

run();
