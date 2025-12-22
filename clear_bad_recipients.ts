import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function clearBadRecipients() {
  console.log('Clearing bad recipient extractions...');
  
  // Clear recipients that include obvious mistakes
  const badPatterns = [
    'THB MR TYLER',
    'Bangkok Bank Shop',
    'Bangkok Bank ttb',
    'ttb WITTHAYA', // Will be re-extracted without prefix
    'xxx836 Bangkok Bank', // Incorrectly captured account number
  ];
  
  let cleared = 0;
  
  for (const pattern of badPatterns) {
    const { data, error } = await supabase
      .from('payment_slips')
      .update({ recipient: null })
      .ilike('recipient', `%${pattern}%`)
      .select('id');
    
    if (error) {
      console.error(`Error clearing pattern "${pattern}":`, error);
    } else {
      const count = data?.length || 0;
      cleared += count;
      console.log(`Cleared ${count} records matching "${pattern}"`);
    }
  }
  
  console.log(`\nTotal cleared: ${cleared} records`);
}

clearBadRecipients().catch(console.error);
