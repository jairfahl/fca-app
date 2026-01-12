#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

// Fixed test IDs for reproducibility
const TEST_COMPANY_ID = 'c0000000-0000-0000-0000-000000000001';
const TEST_CYCLE_ID = 'a0000000-0000-0000-0000-000000000001';
const TEST_SEGMENT_ID = 's0000000-0000-0000-0000-000000000001';

async function checkSchema(supabase) {
    console.log('Verifying Supabase schema...');

    const tablesToCheck = ['companies', 'segments'];

    // If --with-cycle is used, we need assessment_cycles table
    if (process.argv.includes('--with-cycle')) {
        tablesToCheck.push('assessment_cycles');
    }

    for (const table of tablesToCheck) {
        // Try to select 1 row to verify table existence
        const { error } = await supabase.from(table).select('*').limit(1);

        if (error) {
            console.error(`FATAL: Missing required table public.${table}`);
            if (error.code === '42P01') {
                // Explicitly log for missing table (Postgres code 42P01)
                console.error(`(Table public.${table} does not exist)`);
            } else {
                console.error(`Supabase Error: ${error.message}`);
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
            // Table existence for assessment_cycles is checked in checkSchema checks now

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
