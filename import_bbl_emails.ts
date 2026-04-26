import fs from 'fs';
import path from 'path';
import os from 'os';
import { createClient } from '@supabase/supabase-js';
import { parseAmountValue } from './process_bbl_slips';

type ParsedEmailRecord = {
  file_name: string;
  date_time: string | null;
  amount_thb: number | null;
  sender: string | null;
  recipient: string | null;
  note: string | null;
  bank_ref: string | null;
  transaction_ref: string | null;
  raw_text: string | null;
  source_type: 'email' | 'hybrid';
  email_message_id: string | null;
  email_subject: string | null;
  raw_email: string | null;
};

type ParsedMailSource = {
  messageId: string | null;
  subject: string | null;
  text: string;
  rawEmail: string | null;
  sourceName: string;
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

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\r/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function unfoldHeaders(rawHeaders: string): string[] {
  const lines = rawHeaders.replace(/\r/g, '').split('\n');
  const unfolded: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += ` ${line.trim()}`;
    } else {
      unfolded.push(line);
    }
  }
  return unfolded.filter(Boolean);
}

function parseHeaders(rawHeaders: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of unfoldHeaders(rawHeaders)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    headers[line.slice(0, idx).toLowerCase()] = line.slice(idx + 1).trim();
  }
  return headers;
}

function decodeMimeWords(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/=\?([^?]+)\?([bBqQ])\?([^?]+)\?=/g, (_, _charset, encoding, encoded) => {
    if (encoding.toUpperCase() === 'B') {
      return Buffer.from(encoded, 'base64').toString('utf8');
    }
    const qp = encoded.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_m: string, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    );
    return qp;
  });
}

function decodeQuotedPrintable(input: string): string {
  return input
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeBody(body: string, transferEncoding: string | undefined): string {
  const normalized = (transferEncoding || '').toLowerCase();
  if (normalized.includes('base64')) {
    return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  }
  if (normalized.includes('quoted-printable')) {
    return decodeQuotedPrintable(body);
  }
  return body;
}

function extractEmailTextFromRaw(rawEmail: string): string {
  const splitIndex = rawEmail.search(/\r?\n\r?\n/);
  if (splitIndex === -1) return rawEmail;

  const rawHeaders = rawEmail.slice(0, splitIndex);
  const rawBody = rawEmail.slice(splitIndex).replace(/^\r?\n\r?\n/, '');
  const headers = parseHeaders(rawHeaders);
  const contentType = headers['content-type'] || 'text/plain';
  const transferEncoding = headers['content-transfer-encoding'];

  const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = rawBody.split(new RegExp(`--${boundary}(?:--)?\\r?\\n`, 'g'));
    let html: string | null = null;
    let text: string | null = null;

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const extracted = extractEmailTextFromRaw(trimmed);
      if (!text && extracted && !trimmed.toLowerCase().includes('content-type: text/html')) {
        text = extracted;
      }
      if (!html && trimmed.toLowerCase().includes('content-type: text/html')) {
        html = extracted;
      }
    }

    return text || html || '';
  }

  const decoded = decodeBody(rawBody, transferEncoding);
  if (/text\/html/i.test(contentType)) {
    return stripHtml(decoded);
  }
  return decoded.replace(/\r/g, '').trim();
}

function normalizeLines(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function isLabel(line: string) {
  const labels = new Set([
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
  return labels.has(line);
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

function parseEmailDate(value: string | null): string | null {
  if (!value) return null;

  const englishMatch = value.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+at\s+(\d{2}:\d{2}:\d{2})/i);
  if (englishMatch) {
    const [, day, monthName, year, time] = englishMatch;
    const monthMap: Record<string, string> = {
      january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
      july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
    };
    const month = monthMap[monthName.toLowerCase()];
    if (month) return `${year}-${month}-${day.padStart(2, '0')} ${time}`;
  }

  const thaiMatch = value.match(/(\d{1,2})\s+([ก-๙]+)\s+(\d{4})\s+เวลา\s+(\d{2}:\d{2}:\d{2})/);
  if (thaiMatch) {
    const [, day, monthName, buddhistYear, time] = thaiMatch;
    const monthMap: Record<string, string> = {
      'มกราคม': '01',
      'กุมภาพันธ์': '02',
      'มีนาคม': '03',
      'เมษายน': '04',
      'พฤษภาคม': '05',
      'มิถุนายน': '06',
      'กรกฎาคม': '07',
      'สิงหาคม': '08',
      'กันยายน': '09',
      'ตุลาคม': '10',
      'พฤศจิกายน': '11',
      'ธันวาคม': '12',
    };
    const month = monthMap[monthName];
    const year = String(Number(buddhistYear) - 543);
    if (month) return `${year}-${month}-${day.padStart(2, '0')} ${time}`;
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

function parseBangkokBankEmail(source: ParsedMailSource): ParsedEmailRecord {
  const lines = normalizeLines(source.text);
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
  const amountRaw = getNextValue(lines, ['จำนวนเงิน (บาท)', 'Amount (Baht)']);
  const noteRaw = getNextValue(lines, ['บันทึก', 'Note']);
  const bankRef = getNextValue(lines, ['หมายเลขอ้างอิง', 'Bank Reference No.', 'Reference no.']);
  const dateRaw = getNextValue(lines, ['วันที่', 'Date']);

  const noteFromLabel = noteRaw && !isLabel(noteRaw) ? noteRaw : null;
  const nameAddress = extractNameAddress(lines);
  const note = noteFromLabel || nameAddress;

  return {
    file_name: source.messageId ? `gmail:${source.messageId}` : `eml:${source.sourceName}`,
    date_time: parseEmailDate(dateRaw),
    amount_thb: amountRaw ? parseAmountValue(amountRaw) : null,
    sender: sender || null,
    recipient: recipient || null,
    note: note || null,
    bank_ref: bankRef || null,
    transaction_ref: transactionRef || null,
    raw_text: lines.join('\n'),
    source_type: 'email',
    email_message_id: source.messageId,
    email_subject: source.subject,
    raw_email: source.rawEmail,
  };
}

async function parseEmlFile(filePath: string): Promise<ParsedMailSource> {
  const raw = await fs.promises.readFile(filePath, 'utf8');
  const splitIndex = raw.search(/\r?\n\r?\n/);
  const headers = parseHeaders(splitIndex === -1 ? raw : raw.slice(0, splitIndex));
  const text = extractEmailTextFromRaw(raw);
  return {
    messageId: headers['message-id'] || null,
    subject: decodeMimeWords(headers['subject']) || null,
    text,
    rawEmail: raw,
    sourceName: path.basename(filePath),
  };
}

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

async function listGmailSources(query: string, limit: number): Promise<ParsedMailSource[]> {
  const { google } = require('googleapis');
  let clientId = process.env.GMAIL_OAUTH_CLIENT_ID || null;
  let clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET || null;
  const refreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN;
  const clientSecretFile = process.env.GMAIL_OAUTH_CLIENT_SECRET_FILE;

  if ((!clientId || !clientSecret) && clientSecretFile) {
    const raw = await fs.promises.readFile(expandHome(clientSecretFile), 'utf8');
    const parsed = JSON.parse(raw);
    const config = parsed.installed || parsed.web;
    clientId = config?.client_id || null;
    clientSecret = config?.client_secret || null;
  }

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Gmail OAuth config. Set GMAIL_OAUTH_REFRESH_TOKEN plus either GMAIL_OAUTH_CLIENT_ID/GMAIL_OAUTH_CLIENT_SECRET or GMAIL_OAUTH_CLIENT_SECRET_FILE');
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  const gmail = google.gmail({ version: 'v1', auth });
  const { data } = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: limit,
  });

  const sources: ParsedMailSource[] = [];
  for (const message of data.messages || []) {
    if (!message.id) continue;
    const full = await gmail.users.messages.get({
      userId: 'me',
      id: message.id,
      format: 'raw',
    });
    const raw = full.data.raw ? decodeBase64Url(full.data.raw) : '';
    const splitIndex = raw.search(/\r?\n\r?\n/);
    const headers = parseHeaders(splitIndex === -1 ? raw : raw.slice(0, splitIndex));
    const text = extractEmailTextFromRaw(raw);
    sources.push({
      messageId: headers['message-id'] || null,
      subject: decodeMimeWords(headers['subject']) || null,
      text,
      rawEmail: raw,
      sourceName: message.id || 'gmail-message',
    });
  }

  return sources;
}

async function findExistingMatch(supabase: any, record: ParsedEmailRecord) {
  if (record.email_message_id) {
    const { data: byMessageId } = await supabase
      .from('payment_slips')
      .select('*')
      .eq('email_message_id', record.email_message_id)
      .limit(1);
    if (byMessageId?.[0]) return byMessageId[0];
  }

  if (record.bank_ref) {
    const { data: byBankRef } = await supabase
      .from('payment_slips')
      .select('*')
      .eq('bank_ref', record.bank_ref)
      .order('id', { ascending: true })
      .limit(1);
    if (byBankRef?.[0]) return byBankRef[0];
  }

  return null;
}

function buildMergeUpdate(existing: any, parsed: ParsedEmailRecord) {
  const update: Record<string, string | number | null> = {};

  if ((!existing.sender || existing.sender === '') && parsed.sender) update.sender = parsed.sender;
  if ((!existing.recipient || existing.recipient === '') && parsed.recipient) update.recipient = parsed.recipient;
  if ((!existing.note || existing.note === '') && parsed.note) update.note = parsed.note;
  if (existing.amount_thb == null && parsed.amount_thb != null) update.amount_thb = parsed.amount_thb;
  if ((!existing.bank_ref || existing.bank_ref === '') && parsed.bank_ref) update.bank_ref = parsed.bank_ref;
  if ((!existing.transaction_ref || existing.transaction_ref === '') && parsed.transaction_ref) update.transaction_ref = parsed.transaction_ref;
  if ((!existing.date_time || existing.date_time === '') && parsed.date_time) update.date_time = parsed.date_time;
  if ((!existing.email_message_id || existing.email_message_id === '') && parsed.email_message_id) update.email_message_id = parsed.email_message_id;
  if ((!existing.email_subject || existing.email_subject === '') && parsed.email_subject) update.email_subject = parsed.email_subject;
  if ((!existing.raw_email || existing.raw_email === '') && parsed.raw_email) update.raw_email = parsed.raw_email;

  const existingSource = existing.source_type || 'slip_image';
  if (parsed.email_message_id || parsed.raw_email) {
    update.source_type = existingSource === 'email' ? 'email' : 'hybrid';
  }

  return update;
}

async function importParsedEmails(records: ParsedEmailRecord[], dryRun: boolean) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    if (dryRun) {
      console.log('Dry run only: no Supabase credentials configured, so no merge/insert checks were performed.');
      console.log(`Done. inserts=${records.length} merges=0 skips=0`);
      return;
    }
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  let inserts = 0;
  let merges = 0;
  let skips = 0;

  for (const record of records) {
    const existing = await findExistingMatch(supabase, record);
    if (existing) {
      const update = buildMergeUpdate(existing, record);
      if (Object.keys(update).length === 0) {
        skips++;
        continue;
      }

      if (dryRun) {
        console.log(`[DRY RUN][MERGE] ${existing.file_name} <= ${JSON.stringify(update)}`);
      } else {
        const { error } = await supabase
          .from('payment_slips')
          .update(update)
          .eq('id', existing.id);
        if (error) throw error;
      }
      merges++;
      continue;
    }

    if (dryRun) {
      console.log(`[DRY RUN][INSERT] ${record.file_name} <= ${JSON.stringify(record)}`);
    } else {
      const { error } = await supabase
        .from('payment_slips')
        .insert(record);
      if (error) throw error;
    }
    inserts++;
  }

  console.log(`Done. inserts=${inserts} merges=${merges} skips=${skips}`);
}

async function main() {
  const args = parseArgs();
  const dryRun = args['dry-run'] === 'true';
  const limit = Number(args.limit || 25);
  const gmailQuery = args['gmail-query'] || 'from:BualuangmBanking@bangkokbank.com (subject:"ยืนยันการเติมเงินพร้อมเพย์ / PromptPay Top Up Confirmation" OR subject:"ยืนยันการชำระเงิน / Payments confirmation")';
  const emlFile = args.eml ? expandHome(args.eml) : null;
  const emlDir = args['eml-dir'] ? expandHome(args['eml-dir']) : null;

  const sources: ParsedMailSource[] = [];

  if (emlFile) {
    sources.push(await parseEmlFile(emlFile));
  }

  if (emlDir) {
    const entries = await fs.promises.readdir(emlDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.eml')) continue;
      sources.push(await parseEmlFile(path.join(emlDir, entry.name)));
    }
  }

  if (args.gmail === 'true') {
    const gmailSources = await listGmailSources(gmailQuery, limit);
    sources.push(...gmailSources);
  }

  if (sources.length === 0) {
    throw new Error('No input provided. Use --eml, --eml-dir, or --gmail true.');
  }

  const parsed = sources.map(parseBangkokBankEmail);
  console.log(`Parsed ${parsed.length} Bangkok Bank email(s).`);
  for (const rec of parsed.slice(0, 5)) {
    console.log(`- ${rec.file_name}: amount=${rec.amount_thb ?? 'null'} recipient=${rec.recipient ?? 'null'} bank_ref=${rec.bank_ref ?? 'null'}`);
  }

  await importParsedEmails(parsed, dryRun);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
