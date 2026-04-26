import { createClient } from '@supabase/supabase-js';
import { parseAmountValue } from './process_bbl_slips';

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

const LABELS = new Set([
  'ไปที่:',
  'หมายเลข e-wallet',
  'ชื่อเจ้าของ e-wallet',
  'ชื่อผู้ให้บริการ',
  'รหัสบริษัท / รหัสผู้ให้บริการ',
  'ชื่อบริษัท / ชื่อผู้ให้บริการ',
  'จาก:',
  'เลขที่บัญชี',
  'เลขที่บัญชี / หมายเลขบัตรเครดิต',
  'เลขที่อ้างอิง 1',
  'เลขที่อ้างอิง 2',
  'จำนวนเงิน (บาท)',
  'ค่าธรรมเนียม (บาท)',
  'บันทึก',
  'หมายเลขอ้างอิง',
  'วันที่',
  'To:',
  'e-wallet number',
  'e-wallet owner',
  'e-wallet provider name',
  'Service code / Payee ID',
  'Service name / Payee name',
  'From:',
  'Account no.',
  'Account no. / credit card no.',
  'Reference no. 1',
  'Reference no. 2',
  'Amount (Baht)',
  'Fee (Baht)',
  'Note',
  'Bank Reference No.',
  'Reference no.',
  'Date',
]);

function isLabel(line: string) {
  return LABELS.has(line);
}

function getNextValue(lines: string[], labels: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    if (labels.includes(lines[i])) {
      for (let j = i + 1; j < lines.length; j++) {
        if (!lines[j]) continue;
        if (isLabel(lines[j])) return null;
        return lines[j];
      }
      return null;
    }
  }
  return null;
}

function extractNameAddress(lines: string[]): string | null {
  let name: string | null = null;
  let address: string | null = null;
  for (const line of lines) {
    const nameMatch = line.match(/^Name:\s+(.+)$/);
    if (nameMatch && !name) name = nameMatch[1].trim();
    const addrMatch = line.match(/^Address:\s+(.+)$/);
    if (addrMatch && !address) address = addrMatch[1].trim();
  }
  if (!name && !address) return null;
  return [name, address].filter(Boolean).join(' | ');
}

function parseRawText(rawText: string) {
  const lines = rawText.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
  const sender = getNextValue(lines, [
    'เลขที่บัญชี / หมายเลขบัตรเครดิต',
    'Account no. / credit card no.',
    'เลขที่บัญชี',
    'Account no.',
  ]);
  const recipient =
    getNextValue(lines, [
      'ชื่อบริษัท / ชื่อผู้ให้บริการ',
      'Service name / Payee name',
    ]) ||
    getNextValue(lines, ['ชื่อเจ้าของ e-wallet', 'e-wallet owner']);
  const transactionRef = getNextValue(lines, ['เลขที่อ้างอิง 1', 'Reference no. 1']);
  const noteRaw = getNextValue(lines, ['บันทึก', 'Note']);
  const noteFromLabel = noteRaw && !isLabel(noteRaw) ? noteRaw : null;
  const nameAddress = extractNameAddress(lines);
  const note = noteFromLabel || nameAddress;
  const amountRaw = getNextValue(lines, ['จำนวนเงิน (บาท)', 'Amount (Baht)']);
  const bankRef = getNextValue(lines, ['หมายเลขอ้างอิง', 'Bank Reference No.', 'Reference no.']);
  return {
    sender,
    recipient,
    transaction_ref: transactionRef,
    note,
    amount_thb: amountRaw ? parseAmountValue(amountRaw) : null,
    bank_ref: bankRef,
  };
}

async function main() {
  const args = parseArgs();
  const dryRun = args['dry-run'] === 'true';
  const onlyId = args.id ? Number(args.id) : null;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error('Missing SUPABASE_URL or key');

  const supabase = createClient(supabaseUrl, supabaseKey);

  let query = supabase
    .from('payment_slips')
    .select('id, sender, recipient, transaction_ref, note, amount_thb, bank_ref, raw_text, source_type')
    .in('source_type', ['email', 'hybrid'])
    .not('raw_text', 'is', null)
    .order('id', { ascending: true });

  if (onlyId) query = query.eq('id', onlyId);

  const { data, error } = await query.limit(2000);
  if (error) throw error;
  if (!data) throw new Error('No rows returned');

  let updated = 0;
  let unchanged = 0;
  let fields = { sender: 0, recipient: 0, transaction_ref: 0, note: 0 };

  for (const row of data) {
    const parsed = parseRawText(row.raw_text);
    const update: Record<string, string | null> = {};

    if (!row.sender && parsed.sender) { update.sender = parsed.sender; fields.sender++; }
    if (!row.recipient && parsed.recipient) { update.recipient = parsed.recipient; fields.recipient++; }
    if (!row.transaction_ref && parsed.transaction_ref) { update.transaction_ref = parsed.transaction_ref; fields.transaction_ref++; }
    if (!row.note && parsed.note) { update.note = parsed.note; fields.note++; }

    if (Object.keys(update).length === 0) {
      unchanged++;
      continue;
    }

    if (dryRun) {
      console.log(`[DRY] id=${row.id}`, update);
    } else {
      const { error: updErr } = await supabase
        .from('payment_slips')
        .update(update)
        .eq('id', row.id);
      if (updErr) throw updErr;
    }
    updated++;
  }

  console.log(`\nDone. updated=${updated} unchanged=${unchanged}`);
  console.log(`Fields filled: sender=${fields.sender} recipient=${fields.recipient} transaction_ref=${fields.transaction_ref} note=${fields.note}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
