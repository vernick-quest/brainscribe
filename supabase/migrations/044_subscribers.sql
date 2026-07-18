-- 044 — Newsletter subscribers (blog + landing email capture)
-- File: 044_subscribers.sql · Date: 2026-07-17
--
-- ⚠️ Apply BY HAND in the Supabase SQL Editor for project lakozspeyxsuunogfant.
--    Code depending on this table (POST /api/subscribe + the NewsletterSignup form)
--    is DEAD until this is applied — the form errors on submit until then. Apply
--    BEFORE the deploy that ships the form.
--
-- Captures emails from the "get new posts" signup so BrainScribe owns its content
-- audience (vs. renting reach). One row per email; source records where they signed
-- up ('blog' | 'landing' | ...). No PII beyond the email they volunteered.

create table if not exists subscribers (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  source     text,
  created_at timestamptz not null default now()
);

alter table subscribers enable row level security;

-- Writes go through the service-role /api/subscribe endpoint ONLY (it validates the
-- address, lowercases it, and rate-limits) — service-role bypasses RLS. There is
-- deliberately NO client INSERT policy, so no authenticated/anon client can write
-- to this table directly (mirrors the api_usage posture hardened in 043).
create policy "admin read subscribers" on subscribers
  for select using (is_admin());
