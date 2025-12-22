import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function extractRecipient(rawText: string): string | null {
  if (!rawText) return null;
  
  // Clean up the text
  const text = rawText.replace(/\r/g, '');
  
  // Pattern 1: "ttb NAME" or "Utb NAME" or "UtbNAME" before account number
  // Example: "ttb WITTHAYA SAEN\n743-2-xxx593" or "UtbWEERAYUT SITT\n655-2-xxx194"
  const pattern1 = /(?:ttb|utb|ub)\s*([A-Z][A-Z\s]+?)\s+\d{3}-\d-/i;
  let match = text.match(pattern1);
  if (match) {
    const name = match[1].trim().replace(/\s+/g, ' ');
    // Ensure it's not capturing sender info (MR TYLER)
    if (!name.includes('MR TYLER') && !name.includes('THB') && name.length > 3) {
      return name;
    }
  }
  
  // Pattern 2: Bill payment - Thai company name AFTER bullet point •
  // Example: "733-0-xxx836\nBangkok Bank\n•\nบริษัท ซีพี แอ็กซ์ตร้า จำกัด (มหาชน)\nService Code:..."
  const pattern2Thai = /•[\s\n]*([\u0E00-\u0E7F\s\(\)]+?)\s*(?:Biller ID|Service Code)/i;
  match = text.match(pattern2Thai);
  if (match) {
    const name = match[1].trim().replace(/\s+/g, ' ');
    if (name.length >= 5) {
      return name;
    }
  }
  
  // Pattern 2b: Bill payment - English shop/company name AFTER bullet point •
  // Example: "733-0-xxx836\nBangkok Bank\n•\nK+ shop (PTTST...)\nBiller ID:..."
  const pattern2Eng = /•[\s\n]*([A-Z][A-Za-z0-9\s\+\(\)]+?)\s*Biller ID/i;
  match = text.match(pattern2Eng);
  if (match) {
    const name = match[1].trim().replace(/\s+/g, ' ');
    // Validate - should not contain account patterns
    if (name.length >= 3 && !name.match(/xxx\d{3}/) && !name.includes('Bangkok Bank')) {
      return name;
    }
  }
  
  // Pattern 2c: Bill payment without bullet - between "Bangkok Bank" and "Biller ID"
  // Example: "Bangkok Bank\nShop Steel\nBiller ID:..."
  const pattern2Simple = /Bangkok Bank[\s\n]+([A-Z][A-Za-z0-9\s\+]+?)\s+Biller ID/i;
  match = text.match(pattern2Simple);
  if (match) {
    const name = match[1].trim().replace(/\s+/g, ' ');
    const exclude = ['MR TYLER', 'Amount', 'Fee', 'Transaction', 'From', 'successful', 'To'];
    if (name.length >= 3 && !name.match(/xxx\d{3}/) && !exclude.some(ex => name.includes(ex))) {
      return name;
    }
  }
  
  // Pattern 3: Thai name before account number
  // Unicode range for Thai: \u0E00-\u0E7F
  const pattern3 = /(?:ttb|utb|ub)?\s*([\u0E00-\u0E7F\s]{5,50}?)\s+\d{3}-\d-/i;
  match = text.match(pattern3);
  if (match) {
    const thaiName = match[1].trim().replace(/\s+/g, ' ');
    if (thaiName.length >= 5) {  // Minimum Thai name length
      return thaiName;
    }
  }
  
  // Pattern 4: Name after second occurrence of account pattern (recipient account, not sender)
  // The slip format is: Sender name -> sender account -> Recipient name -> recipient account
  const accountPattern = /\d{3}-\d-xxx\d{3}/g;
  const accounts = [...text.matchAll(accountPattern)];
  
  if (accounts.length >= 2) {
    // Look for name between first and second account
    const firstAcctPos = accounts[0].index!;
    const secondAcctPos = accounts[1].index!;
    const betweenAccounts = text.substring(firstAcctPos + 15, secondAcctPos);
    
    // Extract name (uppercase letters and spaces, 8-50 chars)
    const nameMatch = betweenAccounts.match(/([A-Z][A-Z\s]{7,49})/);
    if (nameMatch) {
      const name = nameMatch[1].trim().replace(/\s+/g, ' ');
      const exclude = ['bangkok bank', 'tmbthanachart bank', 'transaction', 'successful', 'amount', 'fee', 'to', 'from'];
      if (!exclude.some(ex => name.toLowerCase().includes(ex)) && !name.includes('MR TYLER')) {
        return name;
      }
    }
  }
  
  return null;
}

async function fillMissingRecipients() {
  console.log('Fetching records with missing recipients...');
  
  const { data: records, error } = await supabase
    .from('payment_slips')
    .select('id, file_name, raw_text, amount_thb')
    .is('recipient', null);
  
  if (error) {
    console.error('Error fetching records:', error);
    return;
  }
  
  console.log(`Found ${records?.length || 0} records missing recipients\n`);
  
  let extracted = 0;
  let failed = 0;
  const updates: Array<{ id: number; recipient: string }> = [];
  
  // Test extraction first
  console.log('Preview of first 10 extractions:');
  for (let i = 0; i < Math.min(10, records?.length || 0); i++) {
    const record = records[i];
    const recipient = extractRecipient(record.raw_text);
    console.log(`\n${i + 1}. ${record.file_name} (${record.amount_thb} THB)`);
    console.log(`   Extracted: ${recipient || '(none)'}`);
    if (recipient) {
      console.log(`   Preview: ${record.raw_text.substring(0, 200).replace(/\n/g, ' ')}`);
    }
  }
  
  console.log('\n\nProcessing all records...');
  
  // Process all records
  for (const record of records || []) {
    const recipient = extractRecipient(record.raw_text);
    if (recipient) {
      updates.push({ id: record.id, recipient });
      extracted++;
    } else {
      failed++;
    }
  }
  
  console.log(`\nExtraction complete:`);
  console.log(`  - Can extract: ${extracted}`);
  console.log(`  - Cannot extract: ${failed}`);
  console.log(`\nApplying updates...`);
  
  // Update in batches
  const batchSize = 100;
  let updated = 0;
  
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    
    for (const update of batch) {
      const { error } = await supabase
        .from('payment_slips')
        .update({ recipient: update.recipient })
        .eq('id', update.id);
      
      if (error) {
        console.error(`Error updating ${update.id}:`, error);
      } else {
        updated++;
      }
    }
    
    console.log(`Updated ${updated} / ${updates.length} records...`);
  }
  
  console.log(`\n✓ Complete! Updated ${updated} recipients.`);
  
  // Show final stats
  const { data: stats } = await supabase
    .from('payment_slips')
    .select('recipient', { count: 'exact' });
  
  const { count: totalCount } = await supabase
    .from('payment_slips')
    .select('*', { count: 'exact', head: true });
  
  const withRecipient = stats?.filter(r => r.recipient).length || 0;
  const withoutRecipient = (totalCount || 0) - withRecipient;
  
  console.log(`\nFinal statistics:`);
  console.log(`  - Total records: ${totalCount}`);
  console.log(`  - With recipient: ${withRecipient} (${((withRecipient / (totalCount || 1)) * 100).toFixed(1)}%)`);
  console.log(`  - Missing recipient: ${withoutRecipient} (${((withoutRecipient / (totalCount || 1)) * 100).toFixed(1)}%)`);
}

fillMissingRecipients().catch(console.error);
