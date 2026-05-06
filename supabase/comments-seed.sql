-- ─────────────────────────────────────────────────────────────────────────
-- comments-seed.sql
-- Inserts 4 starter notes so the wall has something to show on first load.
-- Run AFTER comments-migration.sql.
--
-- Safe to re-run: uses NOT EXISTS guards keyed off the body text so seeds
-- aren't duplicated if you run this twice.
-- ─────────────────────────────────────────────────────────────────────────

insert into public.comments (name, body, created_at)
select 'Nii Okai, MPhil candidate',
       'I have been waiting for a free SEM tool for months. The day metis launches I am running my whole thesis chapter through it.',
       timezone('utc', now()) - interval '1 day'
where not exists (
  select 1 from public.comments
  where body = 'I have been waiting for a free SEM tool for months. The day metis launches I am running my whole thesis chapter through it.'
);

insert into public.comments (name, body, created_at)
select 'Anonymous',
       'join the waitlist. seriously. How many days till i ditch this R tutorial for PLS-SEM.',
       timezone('utc', now()) - interval '12 hours'
where not exists (
  select 1 from public.comments
  where body = 'join the waitlist. seriously. How many days till i ditch this R tutorial for PLS-SEM.'
);

insert into public.comments (name, body, created_at)
select 'George., methods supervisor',
       'If you learn PLS-SEM and you''re tired of debugging packages, sign up. I want to see my collegues using this in September.',
       timezone('utc', now()) - interval '4 days'
where not exists (
  select 1 from public.comments
  where body = 'If you learn PLS-SEM and you''re tired of debugging packages, sign up. I want to see my collegues using this in September.'
);

insert into public.comments (name, body, created_at)
select 'Anonymous',
       'honestly the journal-ready tables alone are worth it.(if that is true) tell your friends.',
       timezone('utc', now()) - interval '1 day'
where not exists (
  select 1 from public.comments
  where body = 'honestly the journal-ready tables alone are worth it.(if that is true) tell your friends.'
);

-- Quick sanity-check:
-- select id, name, left(body, 60) as preview, created_at from public.comments order by created_at desc;
