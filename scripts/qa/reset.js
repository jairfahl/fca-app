#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

async function reset() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        console.log('Resetting QA test data...');

        // Delete in order to respect foreign keys
        await supabase.from('selected_actions').delete().neq('action_id', '00000000-0000-0000-0000-000000000000');
        console.log('✓ Cleared selected_actions');

        await supabase.from('user_goals').delete().neq('user_id', '00000000-0000-0000-0000-000000000000');
        console.log('✓ Cleared user_goals');

        await supabase.from('answers').delete().neq('answer_id', '00000000-0000-0000-0000-000000000000');
        console.log('✓ Cleared answers');

        await supabase.from('assessment_cycles').delete().neq('assessment_cycle_id', '00000000-0000-0000-0000-000000000000');
        console.log('✓ Cleared assessment_cycles');

        await supabase.from('companies').delete().neq('company_id', '00000000-0000-0000-0000-000000000000');
        console.log('✓ Cleared companies');

        console.log('QA reset complete');
    } catch (error) {
        console.error('Error during reset:', error.message);
        process.exit(1);
    }
}

reset();
