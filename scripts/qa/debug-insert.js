require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaUserId = '8b91407a-1e0b-47df-a92c-9ecd6c6893be';
const cycleId = '95368a5c-5136-4f7f-9457-195079257c70'; // From curl
// Need valid action_catalog_id.
// I'll pick one from brute_force attempt or just query one.

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugInsert() {
    // 1. Get an action catalog id
    const { data: actions, error: actError } = await supabase.from('action_catalog').select('action_catalog_id').limit(1);
    if (actError || !actions.length) {
        console.error('Failed to get action catalog:', actError);
        return;
    }
    const actionCatalogId = actions[0].action_catalog_id;

    console.log('Attempting insert with:', {
        assessment_cycle_id: cycleId,
        action_catalog_id: actionCatalogId,
        user_id: qaUserId
    });

    const { data, error } = await supabase.from('selected_action').insert({
        assessment_cycle_id: cycleId,
        action_catalog_id: actionCatalogId,
        user_id: qaUserId,
        status: 'pending',
        created_at: new Date().toISOString()
    });

    if (error) {
        console.error('Insert Failed:', error);
    } else {
        console.log('Insert Succeeded!');
    }
}

debugInsert();
