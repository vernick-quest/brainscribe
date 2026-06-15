-- First-time user experience (FTUE) / onboarding.
--
-- profiles: track whether a student has seen or dismissed onboarding, so we only
--   auto-route brand-new students into it (and never the same student twice).
-- sessions: flag the practice writing run. It reuses the REAL coaching engine
--   (coach turns, scaffold, paragraphs, completion) but is kept out of the real
--   assignment lists and labeled "Practice" in the UI.
--
-- Run in the Supabase SQL Editor. Safe to run once; the IF NOT EXISTS guards make
-- it idempotent. Existing users are marked complete so they aren't shoved into
-- onboarding on their next sign-in.

alter table profiles
  add column if not exists onboarding_complete     boolean not null default false,
  add column if not exists onboarding_completed_at  timestamptz;

-- Everyone who already confirmed a role has been using the app — opt them out.
update profiles set onboarding_complete = true where role_confirmed = true;

alter table sessions
  add column if not exists is_onboarding        boolean not null default false,
  add column if not exists onboarding_prompt_key text;
