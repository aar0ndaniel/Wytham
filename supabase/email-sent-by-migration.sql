alter table public.signups
  add column if not exists email_sent_by text not null default '';
