-- 020 — Lock COPPA gate columns to service-role-only writes
-- File: 020_profiles_gate_column_grants.sql · Date: 2026-06-27
--
-- Closes the COPPA gate-bypass hole. The RLS policy "profiles: own" grants a
-- logged-in user UPDATE on EVERY column of their own row, so a client could
-- supabase-js PATCH its own age_bracket / birthdate / coppa_consent_* directly,
-- bypassing the server-side gate checks — a parental-consent and self-approval
-- bypass (the latter was flagged in AUDIT-2026-06-21).
--
-- RLS is row-level and cannot restrict WHICH columns change. Postgres column
-- privileges can. So we drop the blanket table-level UPDATE that Supabase grants
-- the `authenticated` role and grant UPDATE back only on the non-gate columns.
-- The gate/consent/role columns become writable ONLY by the service role (which
-- bypasses RLS and column grants) — i.e. only through the guarded service-role
-- endpoints in the auth-coppa flow (confirm-role, invite claim, coppa/complete,
-- and PATCH /api/profile/birthdate), which derive age_bracket from birthdate and
-- enforce the directional guards.
--
-- PRECONDITION (already met, branch focus/auth-coppa @ 1eb7aa2): every client-side
-- write to a gate column was moved to a service-role endpoint. Applying this
-- BEFORE that change would 403/deny those legit flows. Apply AFTER auth-coppa ships.
--
-- DENY-BY-DEFAULT GOING FORWARD: after this runs, `authenticated` has UPDATE only
-- on the columns explicitly granted below. Any NEW client-writable column added to
-- profiles in a later migration must add its own `grant update (col) ... to
-- authenticated;` or client writes to it will silently fail RLS-side.
--
-- anon is intentionally not touched: it can never satisfy the RLS check
-- (auth.uid() = id) with no session, so it cannot UPDATE profiles regardless.
--
-- REVOKE/GRANT are idempotent — safe to re-run.
--
-- Run in the Supabase SQL Editor.

-- 1. Drop the blanket table-level UPDATE (a column-level REVOKE cannot subtract
--    from a whole-table grant, so the table grant must go first).
revoke update on profiles from authenticated;

-- 2. Belt-and-suspenders: also strip any column-level UPDATE that may exist on the
--    gate columns, in case one was granted directly at some point.
revoke update (
  birthdate,
  age_bracket,
  role,
  role_confirmed,
  coppa_consent_required,
  coppa_consent_given,
  coppa_consent_given_at,
  coppa_consent_parent_id
) on profiles from authenticated;

-- 3. Grant UPDATE back ONLY on the columns a user-scoped (RLS) client actually
--    writes. A full sweep of every profiles write in app/lib found exactly two:
--      - full_name  via /api/profile/update  (user client)
--      - avatar_url via /api/auth/callback   (user client)
--    Everything else is either service-role-written (role/role_confirmed/age_bracket/
--    coppa_consent_* /onboarding_complete/onboarding_completed_at) or never written
--    at all (email, sessions_used, stripe_customer_id, id, created_at). Those are
--    deliberately left under deny-by-default — granting them back would be dead
--    privilege. This also closes a side abuse vector for free: sessions_used (the
--    free-tier counter) is no longer client-writable, so a student can't reset it.
grant update (
  full_name,
  avatar_url
) on profiles to authenticated;
