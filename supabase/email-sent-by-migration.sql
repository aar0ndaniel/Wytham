alter table public.signups
  add column if not exists email_sent_by text not null default '';

-- Refresh PostgREST's schema cache so the new column is visible to the API immediately.
notify pgrst, 'reload schema';
