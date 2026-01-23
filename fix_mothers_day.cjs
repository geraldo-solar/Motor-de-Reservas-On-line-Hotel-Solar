
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixMothersDay() {
    console.log('Fetching packages...');
    const { data: packages, error } = await supabase.from('packages').select('*');

    if (error) {
        console.error('Error fetching packages:', error);
        return;
    }

    const mothersDay = packages.find(p => p.name.includes('Mães'));

    if (mothersDay) {
        console.log('Found Mother\'s Day package:', mothersDay);
        // Mother's Day 2026 is May 10.
        // Let's set it to May 8 to May 10.
        const newStartDate = '2026-05-08';
        const newEndDate = '2026-05-10';

        console.log(`Updating to ${newStartDate} - ${newEndDate}...`);

        const { error: updateError } = await supabase
            .from('packages')
            .update({
                start_date: newStartDate,
                end_date: newEndDate,
                start_iso_date: newStartDate,
                end_iso_date: newEndDate
            })
            .eq('id', mothersDay.id);

        if (updateError) {
            console.error('Error updating package:', updateError);
        } else {
            console.log('Successfully updated Mother\'s Day package!');
        }
    } else {
        console.log('Mother\'s Day package not found.');
    }
}

fixMothersDay();
