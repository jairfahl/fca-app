// Suppress stderr/stdout for dotenv
const originalLog = console.log;
console.log = function () { };
require('dotenv').config();
console.log = originalLog;

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findAndReset() {
    const { data: action } = await supabase
        .from('selected_action')
        .select('selected_action_id')
        .limit(1)
        .maybeSingle();

    if (action) {
        // Clear evidence and reset to pending
        await supabase.from('action_evidence').delete().eq('selected_action_id', action.selected_action_id);
        await supabase.from('selected_action').update({ status: 'pending', completed_at: null }).eq('selected_action_id', action.selected_action_id);
        process.stdout.write(action.selected_action_id);
    } else {
        process.exit(1);
    }
}

findAndReset();
