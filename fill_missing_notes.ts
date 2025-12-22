import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function extractNote(rawText: string): string | null {
  if (!rawText) return null;
  
  // Pattern 1: "Note\n<note text>\nBank reference"
  // This is the most common format
  const pattern1 = /Note[\s\n]+(.*?)[\s\n]+(?:Bank reference|Transaction reference|Scan to verify)/is;
  let match = rawText.match(pattern1);
  if (match) {
    const note = match[1].trim().replace(/\s+/g, ' ');
    // Filter out common non-note text
    if (note && note.length > 0 && note.length < 200 && !note.match(/^\d+$/)) {
      return note;
    }
  }
  
  // Pattern 2: "Note\n<note text>\n" at end of text
  const pattern2 = /Note[\s\n]+(.*?)(?:\n|$)/is;
  match = rawText.match(pattern2);
  if (match) {
    const note = match[1].trim().replace(/\s+/g, ' ');
    const exclude = ['Bank reference', 'Transaction reference', 'Scan to verify', 'Fee'];
    if (note && note.length > 0 && note.length < 200 && !exclude.some(ex => note.includes(ex))) {
      return note;
    }
  }
  
  return null;
}

async function fillMissingNotes() {
  console.log('Fetching records with missing notes...');
  
  const { data: records, error } = await supabase
    .from('payment_slips')
    .select('id, file_name, raw_text, amount_thb, note')
    .is('note', null);
  
  if (error) {
    console.error('Error fetching records:', error);
    return;
  }
  
  console.log(`Found ${records?.length || 0} records missing notes\n`);
  
  let extracted = 0;
  let failed = 0;
  const updates: Array<{ id: number; note: string }> = [];
  
  // Test extraction first
  console.log('Preview of first 10 extractions:');
  for (let i = 0; i < Math.min(10, records?.length || 0); i++) {
    const record = records[i];
    const note = extractNote(record.raw_text);
    console.log(`\n${i + 1}. ${record.file_name} (${record.amount_thb} THB)`);
    console.log(`   Extracted note: ${note || '(none)'}`);
    if (note) {
      console.log(`   Text preview: ${record.raw_text.substring(0, 200).replace(/\n/g, ' ')}`);
    }
  }
  
  console.log('\n\nProcessing all records...');
  
  // Process all records
  for (const record of records || []) {
    const note = extractNote(record.raw_text);
    if (note) {
      updates.push({ id: record.id, note });
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
        .update({ note: update.note })
        .eq('id', update.id);
      
      if (error) {
        console.error(`Error updating ${update.id}:`, error);
      } else {
        updated++;
      }
    }
    
    console.log(`Updated ${updated} / ${updates.length} records...`);
  }
  
  console.log(`\n✓ Complete! Updated ${updated} notes.`);
  
  // Show final stats
  const { count: total } = await supabase
    .from('payment_slips')
    .select('*', { count: 'exact', head: true });
  
  const { count: withNote } = await supabase
    .from('payment_slips')
    .select('*', { count: 'exact', head: true })
    .not('note', 'is', null);
  
  const withoutNote = total! - withNote!;
  
  console.log(`\nFinal statistics:`);
  console.log(`  - Total records: ${total}`);
  console.log(`  - With note: ${withNote} (${((withNote! / total!) * 100).toFixed(1)}%)`);
  console.log(`  - Missing note: ${withoutNote} (${((withoutNote / total!) * 100).toFixed(1)}%)`);
}

fillMissingNotes().catch(console.error);
