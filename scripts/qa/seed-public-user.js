require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaUserId = '8b91407a-1e0b-47df-a92c-9ecd6c6893be';

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedPublicUser() {
    console.log('Seeding public "user"...');
    // Try 'user' table
    const { data, error } = await supabase.from('user').insert({
        user_id: qaUserId,
        email: 'qa-test@example.com',
        name: 'QA User',
        role: 'admin',
        created_at: new Date().toISOString()
    });

    if (error) {
        console.error('Failed to insert into "user":', error);
        // Don't try users table unless 'user' completely fails with relation not found
    } else {
        console.log('Success in "user"');
    }
}

seedPublicUser();
