require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function bruteForce() {
    console.log('Fetching a process id...');
    const { data: pData } = await supabase.from('process').select('process_id').limit(1).single();
    if (!pData) {
        console.log('No process found.');
        return;
    }
    const pid = pData.process_id;

    const candidates = [
        'LOW', 'MEDIUM', 'HIGH',
        'Low', 'Medium', 'High',
        'low', 'medium', 'high',
        'BAIXO', 'MEDIO', 'ALTO',
        'Baixo', 'Medio', 'Alto',
        'baixo', 'medio', 'alto',
        'MÉDIO', 'Médio',
        'INICIANTE', 'INTERMEDIARIO', 'AVANCADO',
        'Iniciante', 'Intermediario', 'Avancado',
        'iniciante', 'intermediario', 'avancado',
        'BASIC', 'INTERMEDIATE', 'ADVANCED',
        'Basic', 'Intermediate', 'Advanced',
        'basic', 'intermediate', 'advanced',
        '1', '2', '3', '4', '5',
        'I', 'II', 'III', 'IV', 'V',
        'Level 1', 'Level 2', 'Level 3',
        'Nivel 1', 'Nivel 2', 'Nivel 3'
    ];

    console.log(`Testing ${candidates.length} candidates...`);

    for (const val of candidates) {
        process.stdout.write(`Testing '${val}'... `);
        const { error } = await supabase.from('recommendation').insert({
            process_id: pid,
            maturity_level: val,
            recommendation_text: `Test ${val}`,
            version: 1,
            is_current: true,
            valid_from: new Date().toISOString()
        });

        if (!error) {
            console.log('SUCCESS!');
            console.log(`VALID VALUE FOUND: "${val}"`);
            await supabase.from('recommendation').delete().eq('recommendation_text', `Test ${val}`);
            return;
        } else {
            console.log('X');
        }
    }
    console.log('All failed.');
}

bruteForce();
