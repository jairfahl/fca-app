require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedQaUser() {
    const qaUserId = '00000000-0000-0000-0000-000000000001';

    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase.auth.admin.getUserById(qaUserId);

    if (existingUser && existingUser.user) {
        console.log('QA User already exists.');
        return;
    }

    console.log('Creating QA User...');
    const { data, error } = await supabase.auth.admin.createUser({
        email: 'qa-test@example.com',
        email_confirm: true,
        user_metadata: { name: 'QA User' }
    });

    if (error) {
        console.error('Failed to create QA user:', error);
        // If createUser doesn't allow setting ID directly, we might need direct SQL or update afterward?
        // Wait, createUser returns a NEW ID. We need specific ID.
        // admin.createUser doesn't allow setting ID?
        // Let's try to update it? No, ID is primary key.
        // If we can't set ID, we should Use the ID it returns and update our QA_TEST_USER_ID constant?
        // Better: Update QA_TEST_USER_ID to match the created user.
    } else {
        console.log('QA User created with ID:', data.user.id);
        // BUT we hardcoded ...001 in code.
        // Can we update the user ID via SQL?
        // Or just change our code to use the ID we just created (or will create).
    }
}

// Actually, direct SQL might be better if we really want fixed ID.
// But we are using JS client.
// Let's rely on createUser returning an ID, and then we Update the Code.
// OR, we try to insert into auth.users via RPC or direct query if allowed?
// Supabase JS client doesn't allow direct insert to auth.users easily.

// STRATEGY CHANGE:
// 1. Create user (or get key).
// 2. Print ID.
// 3. I will update `qa.routes.ts` and `supabase-db-client.ts` with THIS ID.

seedQaUser();
