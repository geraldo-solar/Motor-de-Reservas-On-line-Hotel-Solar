const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
    const { data, error } = await supabase.from('room_types').select('*').limit(1);
    if (error) {
        console.error(error);
    } else {
        console.log('Columns of room_types:', Object.keys(data[0] || {}));
    }
}
check();
