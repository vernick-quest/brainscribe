-- 033 — profiles.signup_attribution (first-touch marketing attribution)
-- File: 033_profiles_signup_attribution.sql · Date: 2026-07-11
--
-- Lane 1 of the bs_attribution → signup wiring
-- (docs/specs/brainscribe-attribution-signup-wiring.md). Closes the marketing
-- funnel-measurement loop: attach the first-touch UTM cookie to the account it
-- produced so "signups by channel/campaign" becomes queryable.
--
-- Adds a single set-once JSONB column mirroring the `bs_attribution` cookie's
-- exactly-5-key shape (utm_source/medium/campaign/content/term). JSONB keeps the
-- migration tiny and answers the only query that matters
-- (GROUP BY utm_source, utm_campaign) without extra columns.
--
-- WRITE PATH (Lane 2, auth-coppa — NOT this migration): the OAuth callback writes
-- this column ONCE, at account creation, via the service-role client after a
-- whitelist-only parse of the cookie. Set-once + service-role are what make it
-- non-spoofable.
--
-- SERVER-WRITE-ONLY BY DEFAULT: migration 020 revoked the blanket table-level
-- UPDATE on profiles from `authenticated` and granted it back only on
-- (full_name, avatar_url). So this new column inherits deny-by-default — the
-- authenticated/anon roles CANNOT write it, and NO grant statement is needed
-- (adding one would be the spoofing hole 020 closed). Verified 2026-07-11: no
-- migration since 020 re-broadened the profiles UPDATE grant. Reads are covered
-- by the existing column-agnostic "profiles: own" SELECT policy.
--
-- PRIVACY: channel/UTM only, never PII — enforced upstream by the cookie writer
-- and the callback's whitelist parser. This column is just storage for those 5 keys.
--
-- Idempotent (add-column-if-not-exists). Safe no-op re-run.
--
-- ⚠️ APPLY BY HAND: paste into the Supabase SQL Editor for project
--    lakozspeyxsuunogfant (NOT qqxgfgbuvggzhpmbtmvg — check the project switcher).
--    The callback's attribution write (Lane 2) is DEAD until this runs.

alter table profiles
  add column if not exists signup_attribution jsonb;

comment on column profiles.signup_attribution is
  'First-touch UTM attribution (utm_source/medium/campaign/content/term) captured once at signup from the bs_attribution cookie. No PII. Never overwritten. Server-role-written only (deny-by-default per migration 020).';

-- Optional (defer unless the group-by query gets slow at scale):
--   create index if not exists profiles_signup_attribution_gin
--     on profiles using gin (signup_attribution);
