import fs from 'fs';
import path from 'path';
import os from 'os';
import { createClient } from '@supabase/supabase-js';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { parseSlipFromText } from './process_bbl_slips';

type TargetField = 'recipient' | 'amount' | 'note';

type SlipRow = {
  id: number;
  file_name: string;
  recipient: string | null;
  amount_thb: number | null;
  note: string | null;
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

function normalizeFields(value?: string): TargetField[] {
  const fields = (value || 'recipient,amount')
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);

  const valid = new Set<TargetField>(['recipient', 'amount', 'note']);
  const selected = fields.filter((field): field is TargetField => valid.has(field as TargetField));
  return selected.length > 0 ? selected : ['recipient', 'amount'];
}

function shouldUpdateRecipient(row: SlipRow, parsedRecipient: string | null, fields: TargetField[]) {
  return fields.includes('recipient') && (!row.recipient || row.recipient === '') && !!parsedRecipient;
}

function shouldUpdateAmount(row: SlipRow, parsedAmount: number | null, fields: TargetField[]) {
  return fields.includes('amount') && row.amount_thb == null && parsedAmount != null;
}

function shouldUpdateNote(row: SlipRow, parsedNote: string | null, fields: TargetField[]) {
  return fields.includes('note') && (!row.note || row.note === '') && !!parsedNote;
}

async function fileExists(p: string) {
  try {
    await fs.promises.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs();
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  const googleCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY');
  }
  if (!googleCreds) {
    throw new Error('Missing GOOGLE_APPLICATION_CREDENTIALS');
  }

  const prefix = args.prefix || '';
  const limit = Number(args.limit || 0);
  const dryRun = args['dry-run'] === 'true';
  const rootDir = expandHome(args['root-dir'] || process.cwd());
  const fields = normalizeFields(args.fields);

  const supabase = createClient(supabaseUrl, supabaseKey);
  const vision = new ImageAnnotatorClient({ keyFilename: googleCreds });

  let query = supabase
    .from('payment_slips')
    .select('id, file_name, recipient, amount_thb, note')
    .order('id', { ascending: true });

  if (prefix) {
    query = query.like('file_name', `${prefix}%`);
  }

  if (fields.includes('recipient') && fields.includes('amount') && fields.includes('note')) {
    query = query.or('recipient.is.null,amount_thb.is.null,note.is.null');
  } else if (fields.includes('recipient') && fields.includes('amount')) {
    query = query.or('recipient.is.null,amount_thb.is.null');
  } else if (fields.includes('recipient') && fields.includes('note')) {
    query = query.or('recipient.is.null,note.is.null');
  } else if (fields.includes('amount') && fields.includes('note')) {
    query = query.or('amount_thb.is.null,note.is.null');
  } else if (fields.includes('recipient')) {
    query = query.is('recipient', null);
  } else if (fields.includes('amount')) {
    query = query.is('amount_thb', null);
  } else if (fields.includes('note')) {
    query = query.is('note', null);
  }

  if (limit > 0) {
    query = query.limit(limit);
  }

  const { data: rows, error } = await query;
  if (error) throw error;

  const candidates = (rows || []) as SlipRow[];
  console.log(`Found ${candidates.length} candidate rows for Google repair.`);

  const updates: Array<{ id: number; changes: Record<string, string | number | null>; file_name: string }> = [];
  let missingFiles = 0;
  let processed = 0;

  for (const row of candidates) {
    const filePath = path.isAbsolute(row.file_name)
      ? row.file_name
      : path.join(rootDir, row.file_name);

    if (!(await fileExists(filePath))) {
      missingFiles++;
      continue;
    }

    processed++;
    const [result] = await vision.documentTextDetection(filePath);
    const text = result?.fullTextAnnotation?.text || '';
    if (!text) continue;

    const parsed = parseSlipFromText(text, row.file_name);
    const changes: Record<string, string | number | null> = {};

    if (shouldUpdateRecipient(row, parsed.recipient, fields)) {
      changes.recipient = parsed.recipient;
    }
    if (shouldUpdateAmount(row, parsed.amount_thb, fields)) {
      changes.amount_thb = parsed.amount_thb;
    }
    if (shouldUpdateNote(row, parsed.note, fields)) {
      changes.note = parsed.note;
    }

    if (Object.keys(changes).length > 0) {
      updates.push({ id: row.id, changes, file_name: row.file_name });
    }
  }

  console.log(`Processed ${processed} rows (${missingFiles} missing local files).`);
  console.log(`Google found updates for ${updates.length} rows.`);

  if (updates.length > 0) {
    console.log('Preview of first 10 updates:');
    for (const update of updates.slice(0, 10)) {
      console.log(`- ${update.file_name}: ${JSON.stringify(update.changes)}`);
    }
  }

  if (dryRun || updates.length === 0) {
    console.log(dryRun ? 'Dry run only. No database updates applied.' : 'No updates to apply.');
    return;
  }

  let applied = 0;
  for (const update of updates) {
    const { error: updateError } = await supabase
      .from('payment_slips')
      .update(update.changes)
      .eq('id', update.id);

    if (updateError) {
      console.error(`Failed to update ${update.file_name}: ${updateError.message}`);
      continue;
    }
    applied++;
  }

  console.log(`Applied ${applied} Google-based repairs.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
