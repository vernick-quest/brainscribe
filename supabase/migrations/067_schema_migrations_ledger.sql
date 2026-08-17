-- 067 — A real migration ledger
--
-- WHY: there is no runner, no CI step, and until now nothing in the database that
-- recorded which numbered files had been applied. "What is applied?" was answered by
-- scrolling the Supabase SQL Editor sidebar, and that was never a record of what RAN —
-- it is a record of what happened to get saved as a tab. Proven on this project
-- 2026-08-16: migrations 044-051, 056 and 058-065 are all applied, and NONE of them
-- has a snippet. Four of the ten most recent snippets are called "Untitled query".
--
-- The cost of not having this, in one day: focus/admin authored a migration numbered
-- 063 from a worktree that could not see 063 was already applied and 064 authored; an
-- "amendment" to an applied migration would have been a silent no-op; and a lane was
-- told the last applied migration was 057 when it was 062.
--
-- HOW TO USE IT — put this at the TOP of every future migration, before any DDL:
--
--     insert into public.schema_migrations (version, applied_at, note)
--     values ('068', now(), 'short description');
--
-- At the top, and with NO `on conflict` clause, both deliberately:
--   * At the top, because the Supabase SQL Editor runs a script in one transaction —
--     so a duplicate version aborts the whole thing BEFORE any schema change lands,
--     instead of after.
--   * No `on conflict do nothing`, because that is the silent no-op this table exists
--     to prevent. A second migration claiming a taken number MUST fail loudly. If you
--     see `duplicate key value violates unique constraint`, that is the ledger doing
--     its job — renumber, don't remove the guard.
--
-- Re-running an already-recorded migration will therefore error. That is correct: it
-- means "this already ran", which is exactly what you wanted to know.

create table if not exists public.schema_migrations (
  version     text primary key,
  applied_at  timestamptz,
  recorded_at timestamptz not null default now(),
  note        text
);

comment on table public.schema_migrations is
  'Which numbered migrations have been applied. Written by each migration''s own first statement. The Supabase SQL Editor snippet list is NOT this — it records saved tabs, not executed SQL.';
comment on column public.schema_migrations.applied_at is
  'When the migration actually ran. NULL means the row was BACKFILLED by 067 and the real date is unknown — an honest gap, not a timestamp we invented.';
comment on column public.schema_migrations.recorded_at is
  'When the row was written. Always real, including for backfilled rows.';

-- Backfill 001-066.
--
-- ⚠️ READ THIS BEFORE TRUSTING THESE ROWS. The backfill asserts only that the file
-- exists in the repo and the application behaves as though it is applied. It is NOT a
-- verification that each one ran — 063-066 were confirmed against live schema state
-- today, the rest are inferred. applied_at is therefore NULL for all of them rather
-- than filled with a plausible-looking date, because a fabricated timestamp is worse
-- than an admitted unknown. Every migration from 068 on carries a real one.
-- 001-066 are contiguous with no gaps (verified against the directory), so this is a
-- generate_series rather than 66 literal rows — a shorter paste is a smaller target for
-- a copy that silently drops a line.
insert into public.schema_migrations (version, note)
select lpad(g::text, 3, '0'), 'backfilled by 067 — apply date unknown'
from generate_series(1, 66) g
on conflict (version) do nothing;

-- 067 records itself with a REAL timestamp — the first row in the table that means
-- exactly what it says.
insert into public.schema_migrations (version, applied_at, note)
values ('067', now(), 'schema migration ledger')
on conflict (version) do nothing;

alter table public.schema_migrations enable row level security;

-- Deny-by-default for clients; writes come from the SQL editor as the owner role.
-- Admins can read it so the answer is available without leaving the app.
create policy "schema_migrations: admin read"
  on public.schema_migrations for select using (is_admin());
