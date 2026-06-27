-- 019_profile_birthdate.sql
-- Date: 2026-06-27
--
-- Adds an actual birthdate to profiles. Per product decision, birthdate becomes
-- the source of truth for the under-13 / 13+ COPPA gate — age_bracket is derived
-- from it in APPLICATION logic, deliberately NOT in the DB (see note). Also
-- enforces COPPA data-minimization for the new user-avatar feature: under-13
-- accounts show only a blue initial and must not retain a Google profile photo.
--
-- IMPORTANT — schema only, no gate logic in the DB:
--   age_bracket stays a plain stored column, NOT a generated column or a trigger
--   off birthdate. Deriving the gate needs authorization the DB can't see — "only
--   a verified parent may move a child across the 13 line; a student may never
--   lift themselves out of under-13." That guard logic belongs in the auth-coppa
--   flow / a service-role endpoint. A blind DB trigger would BE the consent-bypass
--   vector, so it is intentionally omitted here.
--
-- IMPORTANT — writes are app-guarded, not RLS:
--   "profiles: own" lets a user update only their own row, and watchers have
--   SELECT-only on linked students. A parent editing their CHILD's birthdate must
--   therefore go through a service-role endpoint that checks the relationship and
--   runs the gate guards. No new RLS UPDATE policy is added on purpose.
--
-- Run in the Supabase SQL Editor.

-- 1. Birthdate. Nullable: legacy accounts and the pre-age-declaration window
--    (Google data arrives before the age step) have none.
alter table profiles
  add column if not exists birthdate date;

-- 2. COPPA data-minimization (one-time backfill): drop any Google profile photo
--    already stored for under-13 accounts. The avatar UI shows a blue initial for
--    them instead.
--    NOTE: this backfill is not self-sustaining. The ONGOING write-rule — never
--    persist avatar_url for an under-13 account (at age/role confirmation, and
--    whenever a birthdate edit flips someone to under-13) — must be added in app
--    code by the auth-coppa session, or photos will re-accumulate on next login.
update profiles
  set avatar_url = null
  where age_bracket = 'under13'
    and avatar_url is not null;
