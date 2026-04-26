create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.gmail_import_runs (
  id bigint generated always as identity primary key,
  started_at timestamp with time zone not null default now(),
  finished_at timestamp with time zone null,
  status text not null default 'running',
  query_text text not null,
  lookback_days integer not null default 7,
  page_size integer not null default 100,
  message_count integer not null default 0,
  parsed_count integer not null default 0,
  inserted_count integer not null default 0,
  merged_count integer not null default 0,
  skipped_count integer not null default 0,
  error_text text null,
  metadata jsonb not null default '{}'::jsonb,
  constraint gmail_import_runs_status_check
    check (status in ('running', 'success', 'dry_run', 'error'))
);

create index if not exists idx_gmail_import_runs_started_at
  on public.gmail_import_runs (started_at desc);

alter table public.gmail_import_runs enable row level security;

-- Before scheduling:
-- 1. Store project_url in Vault
--    select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
-- 2. Store a legacy anon JWT or another token that can invoke Edge Functions
--    select vault.create_secret('<anon-key>', 'anon_key');
-- 3. Optional hardening for the function's x-cron-secret header
--    select vault.create_secret('<long-random-secret>', 'function_cron_secret');
--
-- If you need to replace the schedule later:
--    select cron.unschedule('gmail-bank-slip-import-every-5m');

select
  cron.schedule(
    'gmail-bank-slip-import-every-5m',
    '*/5 * * * *',
    $$
    select
      net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
          || '/functions/v1/gmail-bank-slip-import',
        headers := jsonb_strip_nulls(
          jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'function_cron_secret')
          )
        ),
        body := jsonb_build_object(
          'source', 'supabase-cron'
        ),
        timeout_milliseconds := 300000
      );
    $$
  );
