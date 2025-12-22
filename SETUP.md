# Setup Guide

Step-by-step instructions for setting up the Bangkok Bank Slip OCR Processor.

## 1. Google Cloud Vision API Setup

### Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Cloud Vision API**:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Cloud Vision API"
   - Click "Enable"

### Create Service Account Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Fill in the details:
   - Service account name: `bank-slip-ocr` (or your choice)
   - Service account ID: Will auto-generate
   - Click "Create and Continue"
4. Grant role: "Cloud Vision API User"
5. Click "Done"
6. Click on the newly created service account
7. Go to "Keys" tab
8. Click "Add Key" > "Create new key"
9. Choose "JSON" format
10. Download the JSON file
11. **Save it securely** (never commit to git!)

### Set Up Credentials

Move the downloaded JSON file to a secure location:
```bash
mv ~/Downloads/your-project-xxxxx.json ~/credentials/google-vision-credentials.json
```

## 2. Supabase Setup

### Create a Supabase Project

1. Go to [Supabase](https://supabase.com/)
2. Create a new project
3. Note your project URL: `https://your-project.supabase.co`

### Get API Keys

1. In your Supabase project, go to "Settings" > "API"
2. Copy your:
   - **Project URL**
   - **anon/public key** (for read operations)
   - **service_role key** (for admin operations) - Keep this secret!

### Create Database Table

1. Go to "SQL Editor" in Supabase
2. Run this SQL:

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

-- Optional: Create index for faster queries
create index idx_payment_slips_date_time on public.payment_slips(date_time);
create index idx_payment_slips_recipient on public.payment_slips(recipient);
create index idx_payment_slips_file_name on public.payment_slips(file_name);
```

### Configure Row Level Security (Optional)

If you want to use the analytics dashboard with the anon key:

```sql
-- Enable RLS
alter table public.payment_slips enable row level security;

-- Allow public read access (for analytics dashboard)
create policy "Allow public read access"
  on public.payment_slips
  for select
  using (true);

-- Restrict insert/update/delete to service role only
create policy "Service role only for modifications"
  on public.payment_slips
  for all
  using (auth.role() = 'service_role');
```

## 3. Project Setup

### Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd bank-bot

# Install dependencies
npm install
```

### Configure Environment Variables

```bash
# Copy the example file
cp .env.example .env

# Edit .env with your values
nano .env
```

Fill in your actual credentials:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
GOOGLE_APPLICATION_CREDENTIALS=/Users/yourname/credentials/google-vision-credentials.json
```

## 4. Prepare Your Images

Organize your Bangkok Bank slip images:

```bash
# Create a directory for your slips
mkdir -p ~/Desktop/BangkokBankSlips

# Copy your slip images there
# Supported formats: .jpg, .jpeg
```

## 5. Test the Setup

Run a small test batch first:

```bash
# Process just a few files to test
npx ts-node --transpile-only process_bbl_slips.ts \
  --dir "~/Desktop/BangkokBankSlips" \
  --batch 5
```

Check your Supabase database to verify records were created.

## 6. Full Processing

Once testing works:

```bash
# Process all slips
npx ts-node --transpile-only process_bbl_slips.ts \
  --dir "~/Desktop/BangkokBankSlips" \
  --batch 50
```

## 7. Post-Processing (Optional)

Improve data quality:

```bash
# Extract missing recipients
npx ts-node --transpile-only fill_missing_recipients.ts

# Extract missing notes
npx ts-node --transpile-only fill_missing_notes.ts
```

Remove duplicates:
```sql
-- Run in Supabase SQL Editor
-- See dedupe_payment_slips.sql
```

## 8. Analytics Dashboard

1. Open `analytics.html` in your browser
2. Enter your Supabase URL and anon key
3. View your transaction analytics

## Troubleshooting

### "Missing GOOGLE_APPLICATION_CREDENTIALS" error

Make sure the path in your `.env` file points to the actual JSON file:
```bash
ls -la /path/to/your/credentials.json
```

### "Missing SUPABASE_URL" error

Double-check your `.env` file is in the project root and properly formatted.

### Permission denied errors

Make sure your Google Cloud service account has "Cloud Vision API User" role enabled.

### No images found

Verify your directory path is correct and contains .jpg or .jpeg files:
```bash
ls -la ~/Desktop/BangkokBankSlips/*.jpg
```

## Cost Estimates

### Google Cloud Vision API
- First 1,000 images/month: **FREE**
- After 1,000: $1.50 per 1,000 images
- Your usage: ~4,300 images = ~$6.45 one-time cost

### Supabase
- Free tier: Up to 500 MB database
- Your usage: ~4,000 records ≈ 5-10 MB
- **FREE** for typical usage

## Security Checklist

Before committing to GitHub:

- [ ] `.env` file is in `.gitignore`
- [ ] Google credentials JSON is in `.gitignore`
- [ ] No hardcoded credentials in source files
- [ ] `.env.example` contains only placeholder values
- [ ] Log files are in `.gitignore`
- [ ] Personal slip images are not in the repository

## Next Steps

Once setup is complete:
1. Process your slips
2. Run post-processing scripts
3. Explore the analytics dashboard
4. Consider exporting data for accounting software

## Support

If you encounter issues:
1. Check this setup guide
2. Review error messages carefully
3. Open a GitHub issue with details
