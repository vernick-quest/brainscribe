-- 040 — display_name_confirmed columns (COPPA consent-email name quality)
-- File: 040_display_name_confirmed.sql · Date: 2026-07-15
--
-- ⚠️ Apply BY HAND in the Supabase SQL Editor for project lakozspeyxsuunogfant.
--
-- The Google display name feeds the COPPA consent email ("<name> wants to use
-- BrainScribe…"), and it can be an org/nickname/placeholder ("Next Level
-- Soccer") — a wrong name in a consent email to a real parent reads as spam.
-- /welcome now soft-prompts flagged names to confirm/correct BEFORE age/role
-- (see BACKLOG.md "Student name validation at signup"). These columns record
-- that confirmation so the prompt shows at most once per account.
--
-- NO grants added ON PURPOSE (profiles is deny-by-default per migration 020):
-- both columns are written ONLY server-side through the service-role client
-- (app/api/profile/confirm-name/route.js), never by `authenticated` directly.
-- Do not "fix" this by granting UPDATE — that would let a client flip its own
-- confirmation flag without going through the guarded endpoint.
--
-- Code deploys safely before OR after this runs: pre-migration, the /welcome
-- profile read errors on the missing column and the nudge silently stays off
-- (fail-open); post-migration it activates. Idempotent.

alter table profiles
  add column if not exists display_name_confirmed boolean default false,
  add column if not exists display_name_confirmed_at timestamptz;
