import { createClient } from "jsr:@supabase/supabase-js@2";

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
  source_type: "email" | "hybrid";
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

type ImportCounts = {
  inserts: number;
  merges: number;
  skips: number;
};

type RunLogStart = {
  query_text: string;
  lookback_days: number;
  page_size: number;
  status: string;
  metadata: Record<string, unknown>;
};

type RunLogFinish = {
  status: string;
  finished_at: string;
  message_count: number;
  parsed_count: number;
  inserted_count: number;
  merged_count: number;
  skipped_count: number;
  error_text?: string | null;
  metadata?: Record<string, unknown>;
};

const DEFAULT_GMAIL_QUERY =
  'from:BualuangmBanking@bangkokbank.com (subject:"ยืนยันการเติมเงินพร้อมเพย์ / PromptPay Top Up Confirmation" OR subject:"ยืนยันการชำระเงิน / Payments confirmation")';
const EDGE_ADMIN_KEY_NAME = "edge_admin";

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function getEdgeAdminKey(): string {
  const rawKeys = getRequiredEnv("SUPABASE_SECRET_KEYS");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawKeys) as Record<string, unknown>;
  } catch {
    throw new Error("SUPABASE_SECRET_KEYS must be valid JSON");
  }

  const key = parsed[EDGE_ADMIN_KEY_NAME];
  if (typeof key !== "string" || !key) {
    throw new Error(`SUPABASE_SECRET_KEYS.${EDGE_ADMIN_KEY_NAME} is required`);
  }
  return key;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  const binary = atob(`${normalized}${"=".repeat(padding)}`);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\r/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function unfoldHeaders(rawHeaders: string): string[] {
  const lines = rawHeaders.replace(/\r/g, "").split("\n");
  const unfolded: string[] = [];
  for (const line of lines) {
    if (
      (line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0
    ) {
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
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    headers[line.slice(0, idx).toLowerCase()] = line.slice(idx + 1).trim();
  }
  return headers;
}

function decodeMimeWords(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(
    /=\?([^?]+)\?([bBqQ])\?([^?]+)\?=/g,
    (_, _charset, encoding, encoded) => {
      if (encoding.toUpperCase() === "B") {
        return decodeBase64Url(encoded);
      }
      return encoded
        .replace(/_/g, " ")
        .replace(
          /=([0-9A-F]{2})/gi,
          (_match: string, hex: string) =>
            String.fromCharCode(parseInt(hex, 16)),
        );
    },
  );
}

function decodeQuotedPrintable(input: string): string {
  return input
    .replace(/=\r?\n/g, "")
    .replace(
      /=([0-9A-F]{2})/gi,
      (_, hex: string) => String.fromCharCode(parseInt(hex, 16)),
    );
}

function decodeBody(
  body: string,
  transferEncoding: string | undefined,
): string {
  const normalized = (transferEncoding || "").toLowerCase();
  if (normalized.includes("base64")) {
    return decodeBase64Url(body.replace(/\s+/g, ""));
  }
  if (normalized.includes("quoted-printable")) {
    return decodeQuotedPrintable(body);
  }
  return body;
}

function extractEmailTextFromRaw(rawEmail: string): string {
  const splitIndex = rawEmail.search(/\r?\n\r?\n/);
  if (splitIndex === -1) return rawEmail;

  const rawHeaders = rawEmail.slice(0, splitIndex);
  const rawBody = rawEmail.slice(splitIndex).replace(/^\r?\n\r?\n/, "");
  const headers = parseHeaders(rawHeaders);
  const contentType = headers["content-type"] || "text/plain";
  const transferEncoding = headers["content-transfer-encoding"];

  const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = rawBody.split(new RegExp(`--${boundary}(?:--)?\\r?\\n`, "g"));
    let html: string | null = null;
    let text: string | null = null;

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const extracted = extractEmailTextFromRaw(trimmed);
      if (
        !text && extracted &&
        !trimmed.toLowerCase().includes("content-type: text/html")
      ) {
        text = extracted;
      }
      if (!html && trimmed.toLowerCase().includes("content-type: text/html")) {
        html = extracted;
      }
    }

    return text || html || "";
  }

  const decoded = decodeBody(rawBody, transferEncoding);
  if (/text\/html/i.test(contentType)) {
    return stripHtml(decoded);
  }
  return decoded.replace(/\r/g, "").trim();
}

function normalizeLines(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function isLabel(line: string): boolean {
  const labels = new Set([
    "ไปที่:",
    "หมายเลข e-wallet",
    "ชื่อเจ้าของ e-wallet",
    "ชื่อผู้ให้บริการ",
    "รหัสบริษัท / รหัสผู้ให้บริการ",
    "ชื่อบริษัท / ชื่อผู้ให้บริการ",
    "จาก:",
    "เลขที่บัญชี",
    "เลขที่บัญชี / หมายเลขบัตรเครดิต",
    "เลขที่อ้างอิง 1",
    "เลขที่อ้างอิง 2",
    "จำนวนเงิน (บาท)",
    "ค่าธรรมเนียม (บาท)",
    "บันทึก",
    "หมายเลขอ้างอิง",
    "วันที่",
    "To:",
    "e-wallet number",
    "e-wallet owner",
    "e-wallet provider name",
    "Service code / Payee ID",
    "Service name / Payee name",
    "From:",
    "Account no.",
    "Account no. / credit card no.",
    "Reference no. 1",
    "Reference no. 2",
    "Amount (Baht)",
    "Fee (Baht)",
    "Note",
    "Bank Reference No.",
    "Reference no.",
    "Date",
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

function parseAmountValue(raw: string): number | null {
  const cleaned = raw.replace(/\s+/g, "");
  if (!cleaned) return null;

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  const decimalIndex = Math.max(lastDot, lastComma);

  if (decimalIndex > 0) {
    const integerPart = cleaned.slice(0, decimalIndex).replace(/[^\d]/g, "");
    const decimalPart = cleaned.slice(decimalIndex + 1).replace(/[^\d]/g, "");
    if (!integerPart) return null;

    const normalized = decimalPart
      ? `${integerPart}.${decimalPart}`
      : integerPart;
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }

  const digitsOnly = cleaned.replace(/[^\d]/g, "");
  if (!digitsOnly) return null;

  const parsed = Number(digitsOnly);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseEmailDate(value: string | null): string | null {
  if (!value) return null;

  const englishMatch = value.match(
    /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+at\s+(\d{2}:\d{2}:\d{2})/i,
  );
  if (englishMatch) {
    const [, day, monthName, year, time] = englishMatch;
    const monthMap: Record<string, string> = {
      january: "01",
      february: "02",
      march: "03",
      april: "04",
      may: "05",
      june: "06",
      july: "07",
      august: "08",
      september: "09",
      october: "10",
      november: "11",
      december: "12",
    };
    const month = monthMap[monthName.toLowerCase()];
    if (month) return `${year}-${month}-${day.padStart(2, "0")} ${time}`;
  }

  const thaiMatch = value.match(
    /(\d{1,2})\s+([ก-๙]+)\s+(\d{4})\s+เวลา\s+(\d{2}:\d{2}:\d{2})/,
  );
  if (thaiMatch) {
    const [, day, monthName, buddhistYear, time] = thaiMatch;
    const monthMap: Record<string, string> = {
      มกราคม: "01",
      กุมภาพันธ์: "02",
      มีนาคม: "03",
      เมษายน: "04",
      พฤษภาคม: "05",
      มิถุนายน: "06",
      กรกฎาคม: "07",
      สิงหาคม: "08",
      กันยายน: "09",
      ตุลาคม: "10",
      พฤศจิกายน: "11",
      ธันวาคม: "12",
    };
    const month = monthMap[monthName];
    const year = String(Number(buddhistYear) - 543);
    if (month) return `${year}-${month}-${day.padStart(2, "0")} ${time}`;
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
  return [name, address].filter(Boolean).join(" | ");
}

function parseBangkokBankEmail(source: ParsedMailSource): ParsedEmailRecord {
  const lines = normalizeLines(source.text);
  const sender = getNextValue(lines, [
    "เลขที่บัญชี / หมายเลขบัตรเครดิต",
    "Account no. / credit card no.",
    "เลขที่บัญชี",
    "Account no.",
  ]);
  const recipient =
    getNextValue(lines, [
      "ชื่อบริษัท / ชื่อผู้ให้บริการ",
      "Service name / Payee name",
    ]) ||
    getNextValue(lines, ["ชื่อเจ้าของ e-wallet", "e-wallet owner"]);
  const transactionRef = getNextValue(lines, [
    "เลขที่อ้างอิง 1",
    "Reference no. 1",
  ]);
  const amountRaw = getNextValue(lines, ["จำนวนเงิน (บาท)", "Amount (Baht)"]);
  const noteRaw = getNextValue(lines, ["บันทึก", "Note"]);
  const bankRef = getNextValue(lines, [
    "หมายเลขอ้างอิง",
    "Bank Reference No.",
    "Reference no.",
  ]);
  const dateRaw = getNextValue(lines, ["วันที่", "Date"]);
  const noteFromLabel = noteRaw && !isLabel(noteRaw) ? noteRaw : null;
  const nameAddress = extractNameAddress(lines);
  const note = noteFromLabel || nameAddress;

  return {
    file_name: source.messageId
      ? `gmail:${source.messageId}`
      : `gmail:${source.sourceName}`,
    date_time: parseEmailDate(dateRaw),
    amount_thb: amountRaw ? parseAmountValue(amountRaw) : null,
    sender: sender || null,
    recipient: recipient || null,
    note: note || null,
    bank_ref: bankRef || null,
    transaction_ref: transactionRef || null,
    raw_text: lines.join("\n"),
    source_type: "email",
    email_message_id: source.messageId,
    email_subject: source.subject,
    raw_email: source.rawEmail,
  };
}

async function fetchAccessToken(): Promise<string> {
  const clientId = getRequiredEnv("GMAIL_OAUTH_CLIENT_ID");
  const clientSecret = getRequiredEnv("GMAIL_OAUTH_CLIENT_SECRET");
  const refreshToken = getRequiredEnv("GMAIL_OAUTH_REFRESH_TOKEN");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to refresh Gmail access token: ${response.status} ${await response
        .text()}`,
    );
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error("Gmail token response did not include access_token");
  }
  return payload.access_token as string;
}

async function gmailApiRequest<T>(
  accessToken: string,
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(
      `Gmail API ${path} failed: ${response.status} ${await response.text()}`,
    );
  }

  return await response.json() as T;
}

function buildRollingQuery(baseQuery: string, lookbackDays: number): string {
  if (lookbackDays <= 0) return baseQuery;
  return `${baseQuery} newer_than:${lookbackDays}d`;
}

async function listGmailSources(
  query: string,
  pageSize: number,
): Promise<ParsedMailSource[]> {
  const accessToken = await fetchAccessToken();
  const sources: ParsedMailSource[] = [];
  let pageToken: string | null = null;

  do {
    const page: {
      messages?: Array<{ id?: string }>;
      nextPageToken?: string;
    } = await gmailApiRequest(accessToken, "users/me/messages", {
      q: query,
      maxResults: String(pageSize),
      pageToken: pageToken || "",
    });

    for (const message of page.messages || []) {
      if (!message.id) continue;
      const full = await gmailApiRequest<{ raw?: string }>(
        accessToken,
        `users/me/messages/${message.id}`,
        {
          format: "raw",
        },
      );
      const raw = full.raw ? decodeBase64Url(full.raw) : "";
      const splitIndex = raw.search(/\r?\n\r?\n/);
      const headers = parseHeaders(
        splitIndex === -1 ? raw : raw.slice(0, splitIndex),
      );
      const text = extractEmailTextFromRaw(raw);
      sources.push({
        messageId: headers["message-id"] || null,
        subject: decodeMimeWords(headers.subject) || null,
        text,
        rawEmail: raw,
        sourceName: message.id,
      });
    }

    pageToken = page.nextPageToken || null;
  } while (pageToken);

  return sources;
}

function createSupabaseAdminClient() {
  return createClient(
    getRequiredEnv("SUPABASE_URL"),
    getEdgeAdminKey(),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

async function findExistingMatch(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  record: ParsedEmailRecord,
) {
  if (record.email_message_id) {
    const { data, error } = await supabase
      .from("payment_slips")
      .select("*")
      .eq("email_message_id", record.email_message_id)
      .limit(1);
    if (error) throw error;
    if (data?.[0]) return data[0];
  }

  if (record.bank_ref) {
    const { data, error } = await supabase
      .from("payment_slips")
      .select("*")
      .eq("bank_ref", record.bank_ref)
      .order("id", { ascending: true })
      .limit(1);
    if (error) throw error;
    if (data?.[0]) return data[0];
  }

  return null;
}

function buildMergeUpdate(
  existing: Record<string, unknown>,
  parsed: ParsedEmailRecord,
) {
  const update: Record<string, string | number | null> = {};

  if ((!existing.sender || existing.sender === "") && parsed.sender) {
    update.sender = parsed.sender;
  }
  if ((!existing.recipient || existing.recipient === "") && parsed.recipient) {
    update.recipient = parsed.recipient;
  }
  if ((!existing.note || existing.note === "") && parsed.note) {
    update.note = parsed.note;
  }
  if (existing.amount_thb == null && parsed.amount_thb != null) {
    update.amount_thb = parsed.amount_thb;
  }
  if ((!existing.bank_ref || existing.bank_ref === "") && parsed.bank_ref) {
    update.bank_ref = parsed.bank_ref;
  }
  if (
    (!existing.transaction_ref || existing.transaction_ref === "") &&
    parsed.transaction_ref
  ) {
    update.transaction_ref = parsed.transaction_ref;
  }
  if ((!existing.date_time || existing.date_time === "") && parsed.date_time) {
    update.date_time = parsed.date_time;
  }
  if (
    (!existing.email_message_id || existing.email_message_id === "") &&
    parsed.email_message_id
  ) {
    update.email_message_id = parsed.email_message_id;
  }
  if (
    (!existing.email_subject || existing.email_subject === "") &&
    parsed.email_subject
  ) {
    update.email_subject = parsed.email_subject;
  }
  if ((!existing.raw_email || existing.raw_email === "") && parsed.raw_email) {
    update.raw_email = parsed.raw_email;
  }

  const existingSource = typeof existing.source_type === "string"
    ? existing.source_type
    : "slip_image";
  if (parsed.email_message_id || parsed.raw_email) {
    update.source_type = existingSource === "email" ? "email" : "hybrid";
  }

  return update;
}

async function importParsedEmails(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  records: ParsedEmailRecord[],
  dryRun: boolean,
): Promise<ImportCounts> {
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

      if (!dryRun) {
        const { error } = await supabase
          .from("payment_slips")
          .update(update)
          .eq("id", existing.id);
        if (error) throw error;
      }
      merges++;
      continue;
    }

    if (!dryRun) {
      const { error } = await supabase
        .from("payment_slips")
        .insert(record);
      if (error) throw error;
    }
    inserts++;
  }

  return { inserts, merges, skips };
}

async function startRunLog(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  payload: RunLogStart,
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from("gmail_import_runs")
      .insert(payload)
      .select("id")
      .limit(1);
    if (error) throw error;
    return data?.[0]?.id ?? null;
  } catch (error) {
    console.error("Unable to create gmail_import_runs row", error);
    return null;
  }
}

async function finishRunLog(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  runId: number | null,
  payload: RunLogFinish,
): Promise<void> {
  if (!runId) return;
  try {
    const { error } = await supabase
      .from("gmail_import_runs")
      .update(payload)
      .eq("id", runId);
    if (error) throw error;
  } catch (error) {
    console.error("Unable to update gmail_import_runs row", error);
  }
}

function authorizeRequest(req: Request): Response | null {
  const expectedSecret = Deno.env.get("FUNCTION_CRON_SECRET");
  if (!expectedSecret) {
    return jsonResponse({ error: "server_misconfigured" }, 500);
  }
  if (req.headers.get("x-cron-secret") === expectedSecret) return null;
  return jsonResponse({ error: "Unauthorized" }, 401);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authError = authorizeRequest(req);
  if (authError) return authError;

  const url = new URL(req.url);
  if (url.searchParams.get("mode") === "canary") {
    return jsonResponse({ ok: true, mode: "canary", auth: "cron_secret" });
  }

  const body = req.headers.get("content-type")?.includes("application/json")
    ? await req.json().catch(() => ({}))
    : {};

  const query = typeof body.query === "string" && body.query.trim()
    ? body.query.trim()
    : DEFAULT_GMAIL_QUERY;
  const lookbackDays = clamp(
    Number.isFinite(Number(body.lookbackDays))
      ? Number(body.lookbackDays)
      : Number(Deno.env.get("GMAIL_LOOKBACK_DAYS") || "7"),
    0,
    30,
  );
  const pageSize = clamp(
    Number.isFinite(Number(body.pageSize))
      ? Number(body.pageSize)
      : Number(Deno.env.get("GMAIL_PAGE_SIZE") || "100"),
    1,
    500,
  );
  const dryRun = body.dryRun === true;
  const effectiveQuery = buildRollingQuery(query, lookbackDays);

  const supabase = createSupabaseAdminClient();
  const startedAt = new Date().toISOString();
  const runId = await startRunLog(supabase, {
    query_text: effectiveQuery,
    lookback_days: lookbackDays,
    page_size: pageSize,
    status: "running",
    metadata: {
      dryRun,
      source: typeof body.source === "string" ? body.source : "http",
      startedAt,
    },
  });

  try {
    const sources = await listGmailSources(effectiveQuery, pageSize);
    const parsed = sources.map(parseBangkokBankEmail);
    const counts = await importParsedEmails(supabase, parsed, dryRun);

    await finishRunLog(supabase, runId, {
      status: dryRun ? "dry_run" : "success",
      finished_at: new Date().toISOString(),
      message_count: sources.length,
      parsed_count: parsed.length,
      inserted_count: counts.inserts,
      merged_count: counts.merges,
      skipped_count: counts.skips,
      metadata: {
        source: typeof body.source === "string" ? body.source : "http",
        sample: parsed.slice(0, 5).map((record) => ({
          file_name: record.file_name,
          amount_thb: record.amount_thb,
          recipient: record.recipient,
          bank_ref: record.bank_ref,
        })),
      },
    });

    return jsonResponse({
      ok: true,
      dryRun,
      query: effectiveQuery,
      lookbackDays,
      pageSize,
      messageCount: sources.length,
      parsedCount: parsed.length,
      insertedCount: counts.inserts,
      mergedCount: counts.merges,
      skippedCount: counts.skips,
      runId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishRunLog(supabase, runId, {
      status: "error",
      finished_at: new Date().toISOString(),
      message_count: 0,
      parsed_count: 0,
      inserted_count: 0,
      merged_count: 0,
      skipped_count: 0,
      error_text: message,
    });

    return jsonResponse({
      ok: false,
      error: message,
      runId,
    }, 500);
  }
});
