import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDates() {
  // Get recent dates
  const { data: recent } = await supabase
    .from('payment_slips')
    .select('date_time, file_name, raw_text')
    .order('date_time', { ascending: false })
    .limit(5);
  
  console.log('=== MOST RECENT DATES ===\n');
  recent?.forEach(r => {
    console.log(`Date: ${r.date_time}`);
    console.log(`File: ${r.file_name}`);
    const textPreview = r.raw_text?.substring(0, 150).replace(/\n/g, ' ');
    console.log(`Raw text: ${textPreview}...\n`);
  });
  
  // Get old dates
  const { data: old } = await supabase
    .from('payment_slips')
    .select('date_time, file_name, raw_text')
    .order('date_time', { ascending: true })
    .limit(5);
  
  console.log('\n=== OLDEST DATES ===\n');
  old?.forEach(r => {
    console.log(`Date: ${r.date_time}`);
    console.log(`File: ${r.file_name}`);
    const textPreview = r.raw_text?.substring(0, 150).replace(/\n/g, ' ');
    console.log(`Raw text: ${textPreview}...\n`);
  });
  
  // Get date range stats
  const { data: all } = await supabase
    .from('payment_slips')
    .select('date_time');
  
  const dates = all?.map(r => new Date(r.date_time)).filter(d => !isNaN(d.getTime())) || [];
  const years = dates.map(d => d.getFullYear());
  const yearCounts: Record<number, number> = {};
  
  years.forEach(year => {
    yearCounts[year] = (yearCounts[year] || 0) + 1;
  });
  
  console.log('\n=== YEAR DISTRIBUTION ===\n');
  Object.entries(yearCounts).sort().forEach(([year, count]) => {
    console.log(`${year}: ${count} transactions`);
  });
}

checkDates().catch(console.error);
