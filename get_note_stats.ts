import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function getNoteStats() {
  const { data: all, error } = await supabase
    .from('payment_slips')
    .select('note');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  const total = all?.length || 0;
  const withNote = all?.filter(r => r.note).length || 0;
  const withoutNote = total - withNote;
  
  console.log('=== NOTE STATISTICS ===\n');
  console.log(`Total records: ${total}`);
  console.log(`With note: ${withNote} (${((withNote / total) * 100).toFixed(1)}%)`);
  console.log(`Without note: ${withoutNote} (${((withoutNote / total) * 100).toFixed(1)}%)`);
  
  // Count unique notes
  const uniqueNotes = new Set(all?.filter(r => r.note).map(r => r.note));
  console.log(`\nUnique notes: ${uniqueNotes.size}`);
  
  // Count frequency of notes
  const noteCounts: Record<string, number> = {};
  all?.filter(r => r.note).forEach(r => {
    noteCounts[r.note!] = (noteCounts[r.note!] || 0) + 1;
  });
  
  const sorted = Object.entries(noteCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20);
  
  console.log(`\nTop 20 most common notes:`);
  sorted.forEach(([note, count], i) => {
    console.log(`${(i + 1).toString().padStart(2)}. "${note}": ${count} times`);
  });
}

getNoteStats().catch(console.error);
