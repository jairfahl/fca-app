const path = require('path');
const dotenv = require('dotenv');
const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;

const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;

if (!url || !anon) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY ausentes');
if (!email || !password) throw new Error('TEST_EMAIL / TEST_PASSWORD ausentes');

const supabase = createClient(url, anon, { auth: { persistSession: false } });

(async () => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  console.log(data.session.access_token);
})();
