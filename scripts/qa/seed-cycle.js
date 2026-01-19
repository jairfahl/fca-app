require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const COMPANY_ID = '00000000-0000-0000-0000-000000000001';
const OPEN_CYCLE_ID = '95368a5c-5136-4f7f-9457-195079257c70';
const CLOSED_CYCLE_ID = '447dc6a1-a48f-4d44-9310-9c22cb980562';

async function seed() {
    console.log('Cleaning up existing cycles...');
    await supabase.from('assessment_cycle').delete().eq('company_id', COMPANY_ID);

    console.log('Seeding OPEN and CLOSED cycles...');
    const cycles = [
        {
            assessment_cycle_id: OPEN_CYCLE_ID,
            company_id: COMPANY_ID,
            status: 'in_progress',
            started_at: new Date().toISOString(),
            created_at: new Date().toISOString()
        },
        {
            assessment_cycle_id: CLOSED_CYCLE_ID,
            company_id: COMPANY_ID,
            status: 'completed',
            started_at: new Date(Date.now() - 86400000).toISOString(), // Yesterday
            completed_at: new Date().toISOString(),
            created_at: new Date(Date.now() - 86400000).toISOString()
        }
    ];

    const { error } = await supabase.from('assessment_cycle').insert(cycles);

    if (error) {
        console.error('Error seeding cycles:', error);
        process.exit(1);
    }

    // Insert Scores for Closed Cycle
    console.log('Seeding scores and actions for CLOSED cycle...');
    const { data: processes } = await supabase.from('process').select('process_id').limit(5);

    if (processes && processes.length > 0) {
        // 1. Process Scores - CLOSED
        const scoresClosed = processes.map(p => ({
            assessment_cycle_id: CLOSED_CYCLE_ID,
            process_id: p.process_id,
            score: Math.floor(Math.random() * 100),
            maturity_level: 'iniciante',
            calculated_at: new Date().toISOString()
        }));
        await supabase.from('process_score').upsert(scoresClosed, { onConflict: 'assessment_cycle_id, process_id' });

        // 2. Insert dummy conflict data
        const processId = processes[0].process_id;
        const rec = {
            process_id: processId,
            maturity_level: 'iniciante',
            recommendation_text: 'Dummy Rec for Conflict',
            version: 1,
            is_current: true,
            valid_from: new Date().toISOString()
        };
        const { data: recData, error: recError } = await supabase.from('recommendation').insert(rec).select().single();
        if (recError) console.log('Rec insert error (might exist):', recError.message);

        let recId = recData?.recommendation_id;
        if (!recId) {
            const { data: existing } = await supabase.from('recommendation').select('recommendation_id').eq('process_id', processId).eq('recommendation_text', 'Dummy Rec for Conflict').maybeSingle();
            recId = existing?.recommendation_id;
        }

        if (recId) {
            const action = {
                recommendation_id: recId,
                action_title: 'Dummy Action',
                action_description: 'For conflict test',
                version: 1,
                is_current: true,
                valid_from: new Date().toISOString()
            };
            const { data: actData, error: actError } = await supabase.from('action_catalog').insert(action).select().single();
            if (actError) console.log('Action insert error:', actError.message);

            let actId = actData?.action_catalog_id;
            if (!actId) {
                const { data: existingAct } = await supabase.from('action_catalog').select('action_catalog_id').eq('recommendation_id', recId).maybeSingle();
                actId = existingAct?.action_catalog_id;
            }

            if (actId) {
                const selected = {
                    assessment_cycle_id: CLOSED_CYCLE_ID,
                    action_catalog_id: actId,
                    // recommendation_id: recId,
                    status: 'pending',
                    created_at: new Date().toISOString()
                };
                await supabase.from('selected_action').upsert(selected, { onConflict: 'assessment_cycle_id, action_catalog_id' });
                console.log('Seeded pending action for conflict check.');
            }
        }
    }

    // Insert Scores for OPEN Cycle
    console.log('Seeding scores/recs for OPEN cycle...');
    if (processes && processes.length > 0) {
        const scoresOpen = processes.map(p => ({
            assessment_cycle_id: OPEN_CYCLE_ID,
            process_id: p.process_id,
            score: 50,
            maturity_level: 'iniciante',
            calculated_at: new Date().toISOString()
        }));
        await supabase.from('process_score').upsert(scoresOpen, { onConflict: 'assessment_cycle_id, process_id' });

        for (const p of processes) {
            const rec = {
                process_id: p.process_id,
                maturity_level: 'iniciante',
                recommendation_text: `Rec for ${p.process_id}`,
                version: 1,
                is_current: true,
                valid_from: new Date().toISOString()
            };

            // Try insert or ignore
            const { data: recData, error: recError } = await supabase.from('recommendation').insert(rec).select().single();
            if (recError) {
                // Ignore
            }

            let recId = recData?.recommendation_id;
            if (!recId) {
                const { data: existing } = await supabase.from('recommendation').select('recommendation_id').eq('process_id', p.process_id).eq('recommendation_text', `Rec for ${p.process_id}`).maybeSingle();
                recId = existing?.recommendation_id;
            }

            if (recId) {
                const action = {
                    recommendation_id: recId,
                    action_title: `Action for ${p.process_id}`,
                    action_description: 'Desc',
                    version: 1,
                    is_current: true,
                    valid_from: new Date().toISOString()
                };
                await supabase.from('action_catalog').insert(action);
            }
        }
    }

    console.log('Cycles seeded successfully!');
    console.log(`OPEN Cycle: ${OPEN_CYCLE_ID}`);
    console.log(`CLOSED Cycle: ${CLOSED_CYCLE_ID}`);
}

seed();
