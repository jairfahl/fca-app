#!/usr/bin/env node

console.log('QA Reset and Seed Commands - Setup Required');
console.log('='.repeat(60));
console.log('');
console.log('STATUS: NOT CONFIGURED');
console.log('');
console.log('These scripts require Supabase configuration in .env.local:');
console.log('');
console.log('  NEXT_PUBLIC_SUPABASE_URL=your_supabase_url');
console.log('  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key');
console.log('');
console.log('FUNCTIONALITY:');
console.log('  npm run qa:reset  -> Clears companies, cycles, actions data');
console.log('  npm run qa:seed   -> Seeds test company (default: no cycle)');
console.log('  npm run qa:seed -- --with-cycle -> Seeds with active cycle');
console.log('');
console.log('SCENARIOS:');
console.log('  S1 (no cycle): npm run qa:reset && npm run qa:seed');
console.log('  S2 (with cycle): npm run qa:reset && npm run qa:seed -- --with-cycle');
console.log('');
console.log('NOTE: Current backend implementation (POST /api/companies, GET /api/cycles/active)');
console.log('      does not persist data yet. These scripts are ready for when');
console.log('      database integration is implemented.');
console.log('');
