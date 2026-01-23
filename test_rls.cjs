const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testUpdate() {
    // Pegar o primeiro quarto
    const { data: rooms } = await supabase.from('room_types').select('*').limit(1);
    if (!rooms || rooms.length === 0) {
        console.log('No rooms found');
        return;
    }
    const room = rooms[0];
    console.log('Testing update for room:', room.name, 'ID:', room.id);

    // Tentar atualizar o overrides (adicionando um dado bobo ou apenas salvando o mesmo)
    const { error } = await supabase.from('room_types').update({ updated_at: new Date().toISOString() }).eq('id', room.id);

    if (error) {
        console.error('Update FAILED (expected if RLS is on):', error.message);
    } else {
        console.log('Update SUCCEEDED! RLS is likely not blocking updates with Anon key.');
    }
}

testUpdate();
