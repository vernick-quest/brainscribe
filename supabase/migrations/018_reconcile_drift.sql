-- 018_reconcile_drift.sql
-- Date: 2026-06-27
--
-- Reconciles schema drift: objects that exist in the LIVE database (project
-- lakozspeyxsuunogfant) but were never captured in a migration file, so a fresh
-- rebuild from migrations alone would be missing them and the invite/admin code
-- would break.
--
-- This migration is a NO-OP on production (every statement is guarded with
-- IF NOT EXISTS or CREATE OR REPLACE against the already-live shape) — its only
-- job is to make a from-scratch rebuild match what prod already has.
--
-- Live shapes captured verbatim from prod on 2026-06-27:
--   - invites.assignment_id  uuid NULL, FK -> sessions(id) ON DELETE CASCADE
--   - invites.expires_at     timestamptz NOT NULL DEFAULT (now() + interval '7 days')
--   - function is_admin()     sql, STABLE, SECURITY DEFINER
--
-- Migrations 004 and 006 already CALL is_admin() in their RLS policies but the
-- function was only ever created directly in the live DB — so a clean rebuild
-- fails at 004 without this. It is recreated here verbatim (incl. NO search_path,
-- matching live exactly) so applying 018 to prod changes nothing.
--
-- Run in the Supabase SQL Editor.

-- 1. invites.assignment_id — links a teacher invite to the assignment/session it
--    grants access to. Inline FK so a fresh add reproduces the live
--    `invites_assignment_id_fkey` (Postgres auto-names it <table>_<col>_fkey).
alter table invites
  add column if not exists assignment_id uuid references sessions(id) on delete cascade;

-- 2. invites.expires_at — single-use invites expire after 7 days.
alter table invites
  add column if not exists expires_at timestamptz not null default (now() + interval '7 days');

-- 3. is_admin() — used by RLS policies in 004_teacher_notifications and 006_coppa.
--    Verbatim from prod. (Note: live def sets no search_path; kept as-is so this
--    is a true no-op on prod. Hardening with `set search_path = public` would be a
--    separate, deliberate change — not part of drift reconciliation.)
create or replace function is_admin()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  )
$$;
