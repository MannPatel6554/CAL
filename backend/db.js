const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing SUPABASE_URL or SUPABASE_KEY in backend environment variables.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
