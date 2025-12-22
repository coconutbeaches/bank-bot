/*
Minimal CLI to parse Bangkok Bank transfer slips from images using Google OCR
and insert structured data into Supabase `payment_slips`.

Env vars required:
  - SUPABASE_URL
  - SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)
  - GOOGLE_APPLICATION_CREDENTIALS (path to Google Cloud credentials JSON)

Usage:
  export SUPABASE_URL="https://your-project.supabase.co"
  export SUPABASE_ANON_KEY="your-key-here"
  export GOOGLE_APPLICATION_CREDENTIALS="/path/to/credentials.json"
  
  npx ts-node --transpile-only process_bbl_slips.ts \
    --dir "~/Desktop/BangkokBankSlips" \
    --batch 50

Notes:
 - Processes .jpg/.jpeg sequentially.
 - Skips rows where file_name already exists.
 - Logs every N files with count, last amount, and total THB so far.
*/

import fs from 'fs';
import path from 'path';
import os from 'os';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import FormData from 'form-data';

type SlipRecord = {
  file_name: string;
  date_time: string | null;
  amount_thb: number | null;
  sender: string | null;
  recipient: string | null;
  note: string | null;
  bank_ref: string | null;
  transaction_ref: string | null;
  raw_text: string | null;
};

function expandHome(p: string) {
  if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1));
  return p;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '');
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
      out[key] = val;
    }
  }
  return out;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function listImages(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (ext === '.jpg' || ext === '.jpeg') files.push(path.join(dir, e.name));
    }
  }
  files.sort();
  return files;
}

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

async function createSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
}

async function ensureTableExists() {
  // No-op here; assume table payment_slips exists per user instructions.
}

async function getExistingFilenames(supabase: SupabaseClient<any, 'public', any>, filenames: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  // Query in chunks to avoid URL length limits
  const chunkSize = 500;
  for (let i = 0; i < filenames.length; i += chunkSize) {
    const chunk = filenames.slice(i, i + chunkSize);
    const { data, error } = await (supabase as any)
      .from('payment_slips')
      .select('file_name')
      .in('file_name', chunk);
    if (error) throw error;
    for (const row of data as { file_name: string }[]) existing.add(row.file_name);
  }
  return existing;
}

// Google OCR using Vision API
async function extractWithGoogleOcr(filePath: string, retries = 3): Promise<string> {
  const { ImageAnnotatorClient } = require('@google-cloud/vision');
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Use Google Cloud credentials from environment variable
      const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (!credsPath) {
        throw new Error('GOOGLE_APPLICATION_CREDENTIALS environment variable not set');
      }
      
      const client = new ImageAnnotatorClient({ keyFilename: credsPath });
      
      // Read image file
      const imageBuffer = await fs.promises.readFile(filePath);
      
      // Perform OCR
      const [result] = await client.documentTextDetection({ image: { content: imageBuffer } });
      const fullText = result?.fullTextAnnotation?.text || '';
      
      return fullText;
    } catch (e: any) {
      if (attempt < retries) {
        console.log(`[Retry ${attempt}/${retries}] Error: ${e.message?.slice(0, 50)}, retrying in ${attempt * 2}s...`);
        await sleep(attempt * 2000);
        continue;
      }
      throw e;
    }
  }
  throw new Error('Max retries exceeded');
}

function parseSlipFromText(text: string, filename: string): SlipRecord {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const full = lines.join('\n');

  // Multiple date format variations used by Bangkok Bank over the years
  const dateRegexes = [
    // "23 Jun 24,18:03" (modern format, note no space before time)
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{2,4}),?(\d{1,2}:\d{2})/i,
    // "14 Feb 18, 18:37" (older format with space)
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{2,4}),\s+(\d{1,2}:\d{2})/i,
    // "19/06/24 20:18" or "19-06-2024 20:18"
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})[\s,]+(\d{1,2}:\d{2})/,
    // "2024-06-19 20:18" (ISO format)
    /(\d{4}-\d{2}-\d{2})[\s]+(\d{2}:\d{2})/,
    // Just date without time
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{2,4})/i,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
  ];
  let date_time: string | null = null;
  for (const r of dateRegexes) {
    const m = full.match(r);
    if (m) {
      try {
        if (r.source.includes('Jan|Feb')) {
          // Parse: "19 Jun 24, 20:18"
          const day = m[1];
          const month = m[2];
          let year = m[3];
          const time = m[4] || '00:00';
          // Convert 2-digit year to 4-digit
          if (year.length === 2) {
            const yr = parseInt(year);
            year = yr > 50 ? '19' + year : '20' + year;
          }
          // Convert month name to number
          const monthMap: Record<string, string> = {
            jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
            jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
          };
          const monthNum = monthMap[month.toLowerCase().substring(0, 3)];
          if (monthNum) {
            date_time = `${year}-${monthNum}-${day.padStart(2, '0')} ${time}:00`;
            break;
          }
        } else if (m[2]) {
          // Has time component
          date_time = m[1] + ' ' + m[2] + ':00';
          break;
        } else {
          // Just date, no time
          date_time = m[1];
          break;
        }
      } catch (e) {
        // Skip this regex and try next one
        continue;
      }
    }
  }

  // Amount variations: "250.00 THB", "THB 250.00", "250 Baht", "Amount: 250.00"
  const amountRegexes: RegExp[] = [
    /([0-9,]+\.?[0-9]*)\s*(?:THB|Baht|฿)/i,
    /(?:THB|Baht|฿)\s*([0-9,]+\.?[0-9]*)/i,
    /Amount[:\s]+([0-9,]+\.?[0-9]*)/i,
    /Total[:\s]+([0-9,]+\.?[0-9]*)/i,
  ];
  let amount_thb: number | null = null;
  for (const r of amountRegexes) {
    const m = full.match(r);
    if (m) {
      const n = Number(m[1].replace(/,/g, ''));
      if (!Number.isNaN(n) && n > 0) { amount_thb = n; break; }
    }
  }

  let sender: string | null = null;
  let recipient: string | null = null;
  let note: string | null = null;
  let bank_ref: string | null = null;
  let transaction_ref: string | null = null;

  // IMPROVED RECIPIENT EXTRACTION
  // Pattern 1: "ttb NAME" or "Utb NAME" before account number
  const recipientPattern1 = /(?:ttb|utb|ub)\s*([A-Z][A-Z\s]+?)\s+\d{3}-\d-/i;
  let match = text.match(recipientPattern1);
  if (match) {
    const name = match[1].trim().replace(/\s+/g, ' ');
    if (!name.includes('MR TYLER') && !name.includes('THB') && name.length > 3) {
      recipient = name;
    }
  }
  
  // Pattern 2: Bill payment - Thai company name AFTER bullet point •
  if (!recipient) {
    const recipientPattern2Thai = /•[\s\n]*([\u0E00-\u0E7F\s\(\)]+?)\s*(?:Biller ID|Service Code)/i;
    match = text.match(recipientPattern2Thai);
    if (match) {
      const name = match[1].trim().replace(/\s+/g, ' ');
      if (name.length >= 5) recipient = name;
    }
  }
  
  // Pattern 3: Bill payment - English shop/company name AFTER bullet point •
  if (!recipient) {
    const recipientPattern2Eng = /•[\s\n]*([A-Z][A-Za-z0-9\s\+\(\)]+?)\s*Biller ID/i;
    match = text.match(recipientPattern2Eng);
    if (match) {
      const name = match[1].trim().replace(/\s+/g, ' ');
      if (name.length >= 3 && !name.match(/xxx\d{3}/) && !name.includes('Bangkok Bank')) {
        recipient = name;
      }
    }
  }
  
  // Pattern 4: Bill payment without bullet
  if (!recipient) {
    const recipientPattern2Simple = /Bangkok Bank[\s\n]+([A-Z][A-Za-z0-9\s\+]+?)\s+Biller ID/i;
    match = text.match(recipientPattern2Simple);
    if (match) {
      const name = match[1].trim().replace(/\s+/g, ' ');
      const exclude = ['MR TYLER', 'Amount', 'Fee', 'Transaction', 'From', 'successful', 'To'];
      if (name.length >= 3 && !name.match(/xxx\d{3}/) && !exclude.some(ex => name.includes(ex))) {
        recipient = name;
      }
    }
  }
  
  // Pattern 5: Thai name before account number
  if (!recipient) {
    const recipientPattern3 = /(?:ttb|utb|ub)?\s*([\u0E00-\u0E7F\s]{5,50}?)\s+\d{3}-\d-/i;
    match = text.match(recipientPattern3);
    if (match) {
      const thaiName = match[1].trim().replace(/\s+/g, ' ');
      if (thaiName.length >= 5) recipient = thaiName;
    }
  }
  
  // Pattern 6: Name between two account numbers (fallback)
  if (!recipient) {
    const accountPattern = /\d{3}-\d-xxx\d{3}/g;
    const accounts = [...text.matchAll(accountPattern)];
    if (accounts.length >= 2) {
      const firstAcctPos = accounts[0].index!;
      const secondAcctPos = accounts[1].index!;
      const betweenAccounts = text.substring(firstAcctPos + 15, secondAcctPos);
      const nameMatch = betweenAccounts.match(/([A-Z][A-Z\s]{7,49})/);
      if (nameMatch) {
        const name = nameMatch[1].trim().replace(/\s+/g, ' ');
        const exclude = ['bangkok bank', 'tmbthanachart bank', 'transaction', 'successful', 'amount', 'fee', 'to', 'from'];
        if (!exclude.some(ex => name.toLowerCase().includes(ex)) && !name.includes('MR TYLER')) {
          recipient = name;
        }
      }
    }
  }
  
  // Fallback: Old line-by-line parsing for recipient
  if (!recipient) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^(To|Recipient|Payee)[:\s]/i.test(line)) {
        recipient = line.replace(/^(To|Recipient|Payee)[:\s]+/i, '').trim();
      } else if (/^(MR\.|MS\.|MRS\.|MISS|DR\.|K\.|นาย|นาง|น\.ส\.)\s+/i.test(line)) {
        recipient = line;
      } else if (/^[A-Z][A-Z\s.]{10,}$/.test(line) && line.length < 100) {
        recipient = line;
      } else if (/^[ก-ฮ][ก-ฮะ-์\s]{8,}$/.test(line) && line.length < 100) {
        recipient = line;
      }
      if (recipient) break;
    }
  }

  // Sender (keeping for completeness)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!sender && /^(From|Sender)[:\s]/i.test(line)) {
      sender = line.replace(/^(From|Sender)[:\s]+/i, '').trim();
      break;
    }
  }

  // IMPROVED NOTE EXTRACTION
  // Pattern 1: "Note\n<note text>\nBank reference" (most common)
  const notePattern1 = /Note[\s\n]+(.*?)[\s\n]+(?:Bank reference|Transaction reference|Scan to verify)/is;
  match = text.match(notePattern1);
  if (match) {
    const noteText = match[1].trim().replace(/\s+/g, ' ');
    if (noteText && noteText.length > 0 && noteText.length < 200 && !noteText.match(/^\d+$/)) {
      note = noteText;
    }
  }
  
  // Pattern 2: "Note\n<note text>" at end (fallback)
  if (!note) {
    const notePattern2 = /Note[\s\n]+(.*?)(?:\n|$)/is;
    match = text.match(notePattern2);
    if (match) {
      const noteText = match[1].trim().replace(/\s+/g, ' ');
      const exclude = ['Bank reference', 'Transaction reference', 'Scan to verify', 'Fee'];
      if (noteText && noteText.length > 0 && noteText.length < 200 && !exclude.some(ex => noteText.includes(ex))) {
        note = noteText;
      }
    }
  }
  
  // Fallback: Old line-by-line note parsing
  if (!note) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^(Note|Description|Remark|For|Message)$/i.test(line)) {
        if (i + 1 < lines.length) note = lines[i + 1];
      } else if (/^(Note|Description|Remark|For|Message)[:\s]/i.test(line)) {
        const after = line.replace(/^(Note|Description|Remark|For|Message)[:\s]+/i, '').trim();
        if (after) note = after;
      }
      if (note) break;
    }
  }

  // Bank reference
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!bank_ref) {
      if (/Bank\s+(?:reference|ref)[.\s]+no[.:\s]/i.test(line)) {
        const bankMatch = line.match(/no[.:\s]+([A-Z0-9]{4,20})/i);
        if (bankMatch) bank_ref = bankMatch[1];
      } else if (/^(Ref|Reference)[:\s.]/i.test(line)) {
        const bankMatch = line.match(/[:\s]([A-Z0-9]{4,20})/i);
        if (bankMatch) bank_ref = bankMatch[1];
      }
    }
    if (bank_ref) break;
  }

  // Transaction reference: long numeric/alphanumeric string
  const trxPatterns = [
    /Transaction\s+(?:reference|ref|ID|No)[:\s]*([A-Z0-9]{15,})/i,
    /Reference\s+No[.:\s]*([A-Z0-9]{15,})/i,
    /(\d{20,30})/, // Just a very long number
  ];
  for (const pat of trxPatterns) {
    const m = full.match(pat);
    if (m && m[1]) {
      transaction_ref = m[1];
      break;
    }
  }

  return {
    file_name: filename,
    date_time,
    amount_thb,
    sender: sender || null,
    recipient: recipient || null,
    note: note || null,
    bank_ref: bank_ref || null,
    transaction_ref: transaction_ref || null,
    raw_text: text, // Store OCR text for debugging
  };
}

async function extractFromImage(filepath: string): Promise<SlipRecord> {
  const text = await extractWithGoogleOcr(filepath);
  return parseSlipFromText(text, path.basename(filepath));
}

async function insertRecord(supabase: SupabaseClient<any, 'public', any>, rec: SlipRecord) {
  const { data, error } = await (supabase as any)
    .from('payment_slips')
    .insert(rec)
    .select();
  if (error) throw error;
  return data?.[0] as SlipRecord;
}

async function main() {
  const args = parseArgs();
  const dirArg = args.dir || process.env.SLIPS_DIRECTORY || '~/Desktop/BangkokBankSlips';
  const dir = expandHome(dirArg);
  const logEvery = Number(args.batch || 50);

  if (!(await fileExists(dir))) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  const supabase = await createSupabase();
  await ensureTableExists();

  const files = listImages(dir);
  if (files.length === 0) {
    console.log('No .jpg/.jpeg files found.');
    return;
  }

  // Pre-fetch existing file_names to skip
  const existing = await getExistingFilenames(supabase, files.map(f => path.basename(f)));

  let processed = 0;
  let totalTHB = 0;
  let lastAmount: number | null = null;
  let insertedCount = 0;

  for (const file of files) {
    const base = path.basename(file);
    if (existing.has(base)) {
      processed++;
      continue;
    }
    try {
      const rec = await extractFromImage(file);
      const ins = await insertRecord(supabase, rec);
      insertedCount++;
      if (ins && typeof ins.amount_thb === 'number') {
        totalTHB += ins.amount_thb;
        lastAmount = ins.amount_thb;
      } else if (rec.amount_thb != null) {
        totalTHB += rec.amount_thb;
        lastAmount = rec.amount_thb;
      }
    } catch (e: any) {
      console.error(`Error processing ${base}: ${e.message || e}`);
    }
    processed++;
    if (processed % logEvery === 0) {
      console.log(`[Progress] files=${processed}, last_amount=${lastAmount ?? 'null'}, total_thb=${totalTHB.toFixed(2)}`);
      // Friendly tiny delay to avoid rate spikes
      await sleep(200);
    }
  }

  console.log(`[Done] processed=${processed}, inserted=${insertedCount}, total_thb=${totalTHB.toFixed(2)}`);
}

// Polyfill fetch for Node < 18
declare const global: any;
if (typeof (global as any).fetch === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const undici = require('undici');
  (global as any).fetch = undici.fetch;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
