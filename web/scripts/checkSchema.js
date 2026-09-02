require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function check() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(url, key);

  const { data, error } = await supabase.storage.createBucket('media', { public: true });
  console.log("createBucket:", error ? error.message : data);
}
check();
