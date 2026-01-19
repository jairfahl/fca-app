require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectUserTable() {
    console.log('Inspecting "user" table...');
    // Select one row to see columns
    const { data, error } = await supabase.from('user').select('*').limit(1);

    if (error) {
        console.error('Select failed:', error);
    } else {
        console.log('Data sample:', data);
        if (data && data.length > 0) {
            console.log('Columns:', Object.keys(data[0]));
        } else {
            console.log('Table empty. Trying to insert with "user_id"...');
            // Try Insert with user_id
            const { error: insertError } = await supabase.from('user').insert({
                user_id: '8b91407a-1e0b-47df-a92c-9ecd6c6893be',
                email: 'qa-test@example.com',
                name: 'QA User'
            });
            if (insertError) {
                console.error('Insert with user_id failed:', insertError);
            } else {
                console.log('Insert with user_id succeeded!');
            }
        }
    }
}

inspectUserTable();
