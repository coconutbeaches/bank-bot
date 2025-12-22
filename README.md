# Bank Bot - QR Payment Slip OCR Processor

Automated processing of QR payment slips using Google Cloud Vision OCR.

## Overview
This project processes 4,313+ Bangkok Bank transfer slip images, extracts structured data (date, amount, recipient, notes, transaction references), and stores them in Supabase for analysis.

## Final Results
- **4,209** unique payment slip records processed
- **3,922** unique transactions identified
- **38,792,806.86 THB** total processed (~$1.1M USD)
- **86.6%** recipient capture rate (3,645 of 4,209)
  - 2,771 English recipients
  - 574 Thai recipients (companies and individuals)
- **36.5%** note capture rate (1,537 of 4,209)
  - Top notes: "salary", "makro", "salary loan", "lazada"
- Support for both **English and Thai** recipient names
- Support for **bill payment** merchants (2C2P, CP Axtra/Makro, Starbucks, etc.)

## Files

### `process_bbl_slips.ts`
Main TypeScript script that:
- Reads Bangkok Bank slip images from a directory
- Performs OCR using Google Cloud Vision API
- **Advanced parsing** with multiple pattern matching:
  - Date/time (multiple formats: "23 Jun 24, 18:03", "14 Feb 18, 18:37")
  - Amount (THB)
  - **Recipient name** (English and Thai alphabet)
    - Bank transfers: "ttb WITTHAYA SAEN", "MR.MONTREE SITTEBUN"
    - Bill payments: "บริษัท ซีพี แอ็กซ์ตร้า จำกัด (มหาชน)", "STARBUCKS COFFEE"
    - Thai companies: Detects Thai characters after bullet points (•)
  - **Note/memo field** extraction
  - Transaction reference number
  - Bank reference number
- Stores raw OCR text for debugging and future reprocessing
- Inserts structured data into Supabase `payment_slips` table

### `dedupe_payment_slips.sql`
SQL script to remove duplicate records based on unique transaction reference numbers.

## Prerequisites

1. **Node.js 18+** (for global fetch/FormData)
2. **Google Cloud Vision API credentials**
   - Service account JSON file
3. **Supabase project**
   - `payment_slips` table
4. **Dependencies**:
   ```bash
   npm install @supabase/supabase-js @google-cloud/vision form-data
   ```

## Database Schema

```sql
create table public.payment_slips (
  id bigint generated always as identity not null,
  file_name text null,
  date_time timestamp with time zone null,
  amount_thb numeric null,
  sender text null,
  recipient text null,
  note text null,
  bank_ref text null,
  transaction_ref text null,
  raw_text text null,
  created_at timestamp with time zone null default now(),
  constraint payment_slips_pkey primary key (id)
);
```

## Usage

### Process slips:
```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

npx ts-node --transpile-only --compiler-options '{"module":"commonjs"}' \
  process_bbl_slips.ts \
  --dir "~/Desktop/BangkokBankSlips" \
  --batch 50
```

### Parameters:
- `--dir`: Directory containing .jpg/.jpeg slip images
- `--batch`: Number of files to process before logging progress (default: 50)

### Deduplicate records:
Run `dedupe_payment_slips.sql` in Supabase SQL Editor after processing.

## Features

### Date Parsing
Supports multiple Bangkok Bank date formats:
- Modern: "23 Jun 24,18:03"
- Older: "14 Feb 18, 18:37"
- ISO: "2024-06-19 20:18"
- Date only formats

### Amount Extraction
Handles various amount representations:
- "250.00 THB"
- "THB 250.00"
- "50,000.00"
- Amount with ฿ symbol

### Recipient Name Detection (86.6% success rate)
Supports multiple extraction patterns:

**Bank Transfers:**
- Prefix patterns: "ttb WITTHAYA SAEN", "Utb WEERAYUT SITT"
- English names: "MR.MONTREE SITTEBUN", "MISSWI PARAT SAENGARUN"
- Thai names: Supports Thai alphabet (ก-ฮ, ะ-์)
- Title prefixes: MR., MS., MRS., MISS, DR., K., นาย, นาง, น.ส.

**Bill Payments:**
- Thai companies: "บริษัท ซีพี แอ็กซ์ตร้า จำกัด (มหาชน)" (CP Axtra/Makro)
- Thai companies: "ทูซีทูพี (ประเทศไทย)" (2C2P Thailand)
- English merchants: "STARBUCKS COFFEE", "K+ shop (PTT Station)"
- Biller ID format: Extracts names before "Biller ID:" or "Service Code:"

**Extraction Strategy:**
1. Pattern matching for "ttb/utb/ub" prefixes + account numbers
2. Thai text after bullet point (•) for bill payments
3. Names between sender and recipient account numbers
4. Fallback to line-by-line title detection

### Transaction Reference
Extracts long numeric reference numbers (20-30 digits) used for deduplication.

## Error Handling

- Retries OCR calls up to 3 times on failure
- Skips duplicate file_names automatically
- Logs errors for individual files without stopping processing
- Graceful handling of malformed dates

## Performance

- Processing time: ~2 seconds per image (Google Vision API)
- Total time for 4,313 images: ~2.4 hours
- Batch logging every N files to track progress

## Notes & Extraction Details

### Note Field (36.5% capture rate)
- Notes are **optional** - many transactions don't include them
- Common notes extracted:
  - "salary" (42 occurrences)
  - "makro" (35 occurrences - grocery shopping)
  - "salary loan" (25 occurrences)
  - "lazada" (7 occurrences - online shopping)
- Extraction pattern: Text between "Note" label and "Bank reference no."

### General
- Some older slips may have OCR errors due to image quality
- The script stores raw OCR text for debugging/reprocessing
- Duplicate detection uses transaction_ref as unique identifier
- 13.4% of records still missing recipients (likely incomplete OCR or non-standard formats)

## Troubleshooting

### Missing credentials error:
Ensure Google Cloud credentials file path is correct in line 120 of `process_bbl_slips.ts`

### Database connection errors:
Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables

### Thai names not captured:
Updated version includes Thai alphabet support (ก-ฮะ-์)

## Additional Scripts

### `fill_missing_recipients.ts`
Post-processing script to extract recipients from existing raw_text:
- Runs advanced pattern matching on records missing recipients
- Useful after bulk import to improve data quality
- Successfully extracted 904 additional recipients (21.5% improvement)

### `fill_missing_notes.ts`
Post-processing script to extract notes from existing raw_text:
- Extracts note field from records where it was initially missed
- Pattern: Text between "Note" label and reference numbers

### `get_counts.ts`, `get_recipient_stats.ts`, `get_note_stats.ts`
Utility scripts for database statistics and analysis

### `analytics.html`
**Interactive Analytics Dashboard** - Beautiful web interface for visualizing your transaction data:

**Features:**
- 📊 **Bar graphs** for daily, monthly, and yearly spending
- 👥 Top 10 recipients by total amount
- 🏷️ Category breakdown by transaction notes
- 📈 Real-time statistics cards
- 🎨 Responsive design with gradient UI

**How to use:**
1. Open `analytics.html` in any web browser
2. Enter your Supabase URL and Anon Key
3. Click "Connect & Load Data"
4. Explore interactive charts and statistics

**Requirements:**
- Supabase project with `payment_slips` table
- Row Level Security (RLS) disabled on the table OR anon key with read access
- Internet connection (loads Chart.js and Supabase client from CDN)

## Future Improvements

- [x] Thai recipient name support
- [x] Bill payment merchant extraction
- [x] Improved note field extraction
- [ ] Batch API calls to reduce processing time
- [ ] Add confidence scores from OCR
- [ ] Export to CSV/Excel for accounting software
- [ ] Web UI for viewing/searching slips
- [ ] Automatic categorization based on recipients or notes

## Created
October 2025 - Bangkok Bank slip digitization project
