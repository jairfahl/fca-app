const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load env from repo root first (single source of truth)
const repoRootEnv = path.resolve(__dirname, '../../../../.env');
const envCandidates = [
  repoRootEnv,
  path.resolve(process.cwd(), '.env')
];

let envLoaded = false;
for (const p of envCandidates) {
  if (fs.existsSync(p)) {
    const result = dotenv.config({ path: p });
    if (!result.error) {
      envLoaded = true;
      console.log(`[ENV] API dotenv path: ${p}`);
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

try {
  const url = new URL(SUPABASE_URL);
  console.log('[ENV] API SUPABASE_URL_HOST=', url.host);
} catch {
  console.log('[ENV] API SUPABASE_URL_HOST=INVALID');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false
  }
});

module.exports = { supabase };
