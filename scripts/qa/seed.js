#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

// Fixed test IDs for reproducibility
const TEST_COMPANY_ID = 'c0000000-0000-0000-0000-000000000001';
const TEST_CYCLE_ID = 'a0000000-0000-0000-0000-000000000001';
const TEST_SEGMENT_ID = 's0000000-0000-0000-0000-000000000001';

const REQUIRED_TABLES = ['companies', 'segments'];

async function checkSchema(supabase) {
    console.log('Verifying Supabase schema...');

    // We can't easily check information_schema with supabase-js directly unless we use rpc or just try to select.
    // simpler strategy: Try to LIMIT 1 from each table.

    for (const table of REQUIRED_TABLES) {
        const { error } = await supabase.from(table).select('*').limit(1);
        if (error) {
            console.error(`FATAL: Missing required table public.${table}`);
            console.error(`Supabase Error: ${error.message}`);
            if (error.code === '42P01') { // undefined_table
                console.error('\nAction Required: Run Supabase migrations / ensure schema is deployed to the Supabase project referenced by .env');
            }
            process.exit(1);
        }
    }
    console.log('✓ Schema verification passed');
}

async function seed() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        await checkSchema(supabase);

        console.log('Seeding QA test data...');

        // Check if segment exists, create if not
        const { data: existingSegment, error: segmentFetchError } = await supabase
            .from('segments')
            .select('segment_id')
            .eq('segment_id', TEST_SEGMENT_ID)
            .single();

        if (segmentFetchError && segmentFetchError.code !== 'PGRST116') { // PGRST116 is "The result contains 0 rows"
            throw new Error(`Error fetching segment: ${segmentFetchError.message}`);
        }

        if (!existingSegment) {
            const { error: segmentError } = await supabase
                .from('segments')
                .insert({
                    segment_id: TEST_SEGMENT_ID,
                    name: 'QA Test Segment',
                    display_name: 'Comércio QA'
                });

            if (segmentError) {
                console.error('Error creating segment:', segmentError.message);
                process.exit(1);
            }
            console.log(`✓ Created test segment (ID: ${TEST_SEGMENT_ID})`);
        } else {
            console.log(`✓ Test segment already exists (ID: ${TEST_SEGMENT_ID})`);
        }

        // Scenario S1: Company exists, no active cycle
        const { error: companyError } = await supabase
            .from('companies')
            .upsert({
                company_id: TEST_COMPANY_ID,
                display_name: 'QA Test Company',
                segment_id: TEST_SEGMENT_ID
            });

        if (companyError) {
            console.error('Error creating company:', companyError.message);
            process.exit(1);
        }
        console.log(`✓ Created/updated test company (S1) (ID: ${TEST_COMPANY_ID})`);


        // Scenario S2: Active cycle exists (optional, controlled by --with-cycle flag)
        if (process.argv.includes('--with-cycle')) {
            // Check table existence first just to be safe if it's not in REQUIRED_TABLES (it's implicit)
            const { error: checkCycleTable } = await supabase.from('assessment_cycles').select('*').limit(1);
            if (checkCycleTable) {
                console.error('FATAL: Missing table public.assessment_cycles needed for --with-cycle');
                process.exit(1);
            }

            const { error: cycleError } = await supabase
                .from('assessment_cycles')
                .upsert({
                    assessment_cycle_id: TEST_CYCLE_ID,
                    company_id: TEST_COMPANY_ID,
                    status: 'active',
                    diagnostic_status: 'pending'
                });

            if (cycleError) {
                console.error('Error creating cycle:', cycleError.message);
                process.exit(1);
            }
            console.log(`✓ Created/updated active cycle (S2) (ID: ${TEST_CYCLE_ID})`);
        } else {
            console.log('ℹ Skipped cycle creation (use --with-cycle to create S2)');
        }

        console.log('\nQA seed complete');
        console.log('Scenarios:');
        console.log('  S1 (no cycle): Default - company exists, no active cycle');
        console.log('  S2 (with cycle): Use --with-cycle flag');
    } catch (error) {
        console.error('Error during seed:', error.message);
        process.exit(1);
    }
}

seed();
