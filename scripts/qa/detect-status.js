require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function detect() {
    console.log('Detecting valid status...');

    // 1. Create dummy selected action
    // Need cycleId, catalogId, userId. 
    // We'll use existing ones from logs or just hardcode if valid.
    /*
    const cycleId = '95368a5c-5136-4f7f-9457-195079257c70';
    const catalogId ...
    */

    // Better: update existing one we created?
    const actionId = 'ce9a207c-4bd6-47b4-8f71-8aa327370c90';

    const candidates = ['in_progress', 'started', 'ongoing', 'doing', 'running', 'active', 'em_andamento'];

    for (const status of candidates) {
        const { error } = await supabase
            .from('selected_action')
            .update({ status })
            .eq('selected_action_id', actionId);

        if (!error) {
            console.log(`VALID STATUS: ${status}`);
            break;
        } else {
            console.log(`Invalid: ${status} - ${error.message}`);
        }
    }
}

detect();
