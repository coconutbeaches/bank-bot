import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function getCounts() {
  const { count: total } = await supabase
    .from('payment_slips')
    .select('*', { count: 'exact', head: true });
  
  const { count: withRecip } = await supabase
    .from('payment_slips')
    .select('*', { count: 'exact', head: true })
    .not('recipient', 'is', null);
  
  const without = total! - withRecip!;
  
  console.log('=== FINAL DATABASE STATS ===\n');
  console.log(`Total records: ${total}`);
  console.log(`With recipient: ${withRecip} (${((withRecip! / total!) * 100).toFixed(1)}%)`);
  console.log(`Without recipient: ${without} (${((without / total!) * 100).toFixed(1)}%)`);
}

getCounts().catch(console.error);
