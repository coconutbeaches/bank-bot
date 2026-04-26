alter table public.payment_slips
  add column if not exists source_type text,
  add column if not exists email_message_id text,
  add column if not exists email_subject text,
  add column if not exists raw_email text;

update public.payment_slips
set source_type = 'slip_image'
where source_type is null;

create unique index if not exists idx_payment_slips_email_message_id
  on public.payment_slips (email_message_id)
  where email_message_id is not null;

create index if not exists idx_payment_slips_bank_ref
  on public.payment_slips (bank_ref);
