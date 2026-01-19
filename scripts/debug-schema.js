require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspect() {
    console.log('Checking existing recommendations...');
    const { data: recs, error: rError } = await supabase.from('recommendation').select('*').limit(1);

    if (rError) console.log('Rec Fetch Error:', rError.message);
    else if (recs && recs.length > 0) {
        console.log('Found recommendation:', recs[0]);
        console.log('Maturity Level used:', recs[0].maturity_level);
    } else {
        console.log('No recommendations found in DB.');
    }
    console.log('Inspecting process table...');
    const { data: pData } = await supabase.from('process').select('*').limit(1);
    console.log('Process sample:', pData);

    console.log('Querying pg_constraint...');
    // We cannot join easily with restricted client, so fetch all constraints and filter in JS if possible
    // or assume we can filter by conname
    const { data: rawConstraints, error: pgError } = await supabase
        .from('pg_constraint')
        .select('*')
        .eq('conname', 'recommendation_maturity');

    if (pgError) console.log('PG Constraint Error:', pgError.message);
    else console.log('Raw Constraints:', rawConstraints);

    // If we can't select from pg_constraint (often blocked), we are stuck.
    // Try one more guess: "1", "2", "3" strings? (Already tried 1,2,3 numbers and strings?)
    // Step 1546 tried 'Level 1', 'level_1'.
    // Step 1511 tried '1', '2', '3' (strings in array, but passed as strings?)
    // In Step 1541: levels = [..., 1, 2, 3].
    // I should try STRING '1', '2', '3' explicitly.

    const levels = ['1', '2', '3']; // Explicit strings
    for (const lvl of levels) {
        const { error } = await supabase.from('recommendation').insert({
            process_id: pData[0].process_id,
            maturity_level: lvl, // passed as string
            recommendation_text: 'Test',
            version: 1,
            is_current: true,
            valid_from: new Date().toISOString()
        });

        if (error) {
            console.log(`Level '${lvl}': Failed (${error.message})`);
        } else {
            console.log(`Level '${lvl}': SUCCESS!`);
            await supabase.from('recommendation').delete().eq('recommendation_text', 'Test');
        }
    }
    for (const lvl of levels) {
        const { error } = await supabase.from('recommendation').insert({
            process_id: pData[0].process_id,
            maturity_level: lvl,
            recommendation_text: 'Test',
            version: 1,
            is_current: true,
            valid_from: new Date().toISOString()
        });

        if (error) {
            console.log(`Level '${lvl}': Failed (${error.message})`);
        } else {
            console.log(`Level '${lvl}': SUCCESS!`);
            await supabase.from('recommendation').delete().eq('recommendation_text', 'Test');
        }
    }
}

inspect();
