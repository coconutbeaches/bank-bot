import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMissingRecipients() {
  const { data, error } = await supabase
    .from('payment_slips')
    .select('raw_text, amount_thb, date_time, file_name')
    .is('recipient', null)
    .limit(10);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`Found ${data?.length} sample records missing recipients:\n`);
  
  data?.forEach((record, i) => {
    console.log(`\n========== Record ${i + 1} ==========`);
    console.log(`File: ${record.file_name}`);
    console.log(`Amount: ${record.amount_thb}`);
    console.log(`Date: ${record.date_time}`);
    console.log(`\nRaw OCR Text:\n${record.raw_text}\n`);
    console.log('=' .repeat(50));
  });
}

checkMissingRecipients();
