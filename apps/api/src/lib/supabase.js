const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load env from repo root even when running from apps/api (workspaces)
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../../../.env')
];

let envLoaded = false;
for (const p of envCandidates) {
  if (fs.existsSync(p)) {
    const result = dotenv.config({ path: p });
    if (!result.error) {
      envLoaded = true;
      console.log(`[supabase.js] Loaded .env from: ${p}`);
      break;
    }
  }
}

if (!envLoaded) {
  console.warn('[supabase.js] WARNING: No .env file found in candidates:', envCandidates);
}

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar configuradas no .env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false
  }
});

module.exports = { supabase };
