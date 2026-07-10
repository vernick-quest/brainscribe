-- 030 — Coach read-aloud (TTS) preference + auto-mute "don't ask again" marker
-- File: 030_coach_read_aloud.sql · Date: 2026-07-10
--
-- Adds two USER-OWNED preference columns to profiles for the coach voice
-- read-aloud toggle + conservative auto-mute offer (spec:
-- docs/specs/brainscribe-coach-voice-toggle-spec.md). ElevenLabs TTS is ~83% of
-- production spend and auto-plays every coach turn; these let a user opt OUT of
-- read-aloud and let the app remember that they declined the auto-mute offer.
--
--   coach_read_aloud         — voice-first DEFAULT true (everyone starts voice-ON;
--                              this is an opt-OUT, never a default-off).
--   voice_prompt_dismissed_at — set when the student taps "Keep it" on the
--                              auto-mute offer, so the offer never re-nags.
--
-- ACCESS — owner-scoped, NOT service-role:
--   These are plain user preferences a student sets on themselves, so they must
--   be writable by the owner's own authed client. The existing RLS policy
--   "profiles: own" (migration 001 — `for all using (auth.uid() = id)`) ALREADY
--   covers the self-update row check, so NO new RLS policy is needed.
--   BUT migration 020 switched profiles UPDATE to deny-by-default (it revoked the
--   blanket table-level UPDATE grant from `authenticated` and re-grants UPDATE only
--   per-column). Per 020's own note, any NEW client-writable column must add its
--   own column-level GRANT or client writes silently fail RLS-side. So we grant
--   UPDATE on exactly these two columns to `authenticated`.
--   (anon still can't satisfy auth.uid() = id with no session, so it can never
--   write these regardless.)
--
-- Writes go through the owner-scoped authed endpoint POST /api/profile/voice
-- (server client under the user's JWT → runs as `authenticated`, `.eq('id',
-- user.id)`). No service-role involved.
--
-- Deletion: none required — columns on profiles are removed when the auth user is
-- deleted (COPPA 7-day cleanup cascades via profiles.id → auth.users).
--
-- REVOKE/GRANT + ADD COLUMN IF NOT EXISTS are idempotent — safe to re-run.
--
-- Run in the Supabase SQL Editor (project lakozspeyxsuunogfant).

-- 1. Preference columns.
alter table profiles
  add column if not exists coach_read_aloud boolean not null default true;

alter table profiles
  add column if not exists voice_prompt_dismissed_at timestamptz;

-- 2. Owner self-update GRANT (the RLS "profiles: own" policy from 001 supplies the
--    row check; this column GRANT is required by 020's deny-by-default UPDATE).
grant update (
  coach_read_aloud,
  voice_prompt_dismissed_at
) on profiles to authenticated;
