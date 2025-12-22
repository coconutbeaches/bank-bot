import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function getStats() {
  // Get overall counts
  const { data: all, error: allError } = await supabase
    .from('payment_slips')
    .select('id, recipient, raw_text');
  
  if (allError) {
    console.error('Error:', allError);
    return;
  }
  
  const total = all?.length || 0;
  const withRecipient = all?.filter(r => r.recipient).length || 0;
  const withoutRecipient = total - withRecipient;
  const missingRawText = all?.filter(r => !r.raw_text || r.raw_text.trim() === '').length || 0;
  
  console.log('=== RECIPIENT EXTRACTION SUMMARY ===\n');
  console.log(`Total records: ${total}`);
  console.log(`\nWith recipient: ${withRecipient} (${((withRecipient / total) * 100).toFixed(1)}%)`);
  console.log(`Without recipient: ${withoutRecipient} (${((withoutRecipient / total) * 100).toFixed(1)}%)`);
  console.log(`\nMissing raw_text: ${missingRawText} (${((missingRawText / total) * 100).toFixed(1)}%)`);
  
  // Check if missing recipients have raw text
  const missingWithRaw = all?.filter(r => !r.recipient && r.raw_text && r.raw_text.trim() !== '').length || 0;
  console.log(`Missing recipient but have raw_text: ${missingWithRaw}`);
  
  // Get sample of unique recipients
  const uniqueRecipients = new Set(all?.filter(r => r.recipient).map(r => r.recipient));
  console.log(`\nUnique recipients found: ${uniqueRecipients.size}`);
  
  // Show top 10 most common recipients
  const recipientCounts: Record<string, number> = {};
  all?.filter(r => r.recipient).forEach(r => {
    recipientCounts[r.recipient!] = (recipientCounts[r.recipient!] || 0) + 1;
  });
  
  const sorted = Object.entries(recipientCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15);
  
  console.log(`\nTop 15 recipients by transaction count:`);
  sorted.forEach(([name, count], i) => {
    console.log(`${(i + 1).toString().padStart(2)}. ${name}: ${count} transactions`);
  });
}

getStats().catch(console.error);
