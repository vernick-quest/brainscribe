-- 038 — COPPA email-plus VPC: second-step confirmation state on pending signups.
-- File: 038_coppa_email_plus.sql · Date: 2026-07-13
--
-- ⚠️ INFRA/CONDUCTOR: this is the correct next number (037 = co-parent was last).
--    Apply BY HAND in the Supabase SQL Editor for project lakozspeyxsuunogfant.
--    ⚠️ DEPLOY ORDER: APPLY THIS MIGRATION *BEFORE* deploying the (c) code. If the
--    code ships first it fails CLOSED (missing-column errors → consent is simply
--    never granted; onboarding breaks but nothing is ever wrongly approved).
--
-- WHY (decision (c), Robert 2026-07-13): the old single-email-match consent was a
-- weak VPC — one in-app action by a self-nominated "parent" granted consent.
-- Email-plus splits it into two steps: step 1 proves the invited email via OAuth
-- and sends a SEPARATE confirmation email (grants nothing); step 2, from that email,
-- re-validates the binding and grants once. These columns carry the second-step
-- state on the pending row. `status` stays 'pending' until the grant, so
-- /coppa/pending and the 7-day auto-delete cron are untouched (an unconfirmed
-- request still expires + deletes — fail-safe).
--
-- Additive + nullable, no backfill. Service-role-managed table (consent flow +
-- cron use the service client) — no RLS/grant change needed. Idempotent.
--
-- COUNSEL FLAG: this builds the email-plus MECHANISM. Counsel must confirm it
-- qualifies as FTC "email-plus" verifiable parental consent before public launch —
-- shipping it now is strictly stronger than the prior single-match method.

alter table pending_coppa_signups
  add column if not exists confirm_token   text,
  add column if not exists first_step_at   timestamptz,
  add column if not exists confirm_sent_at timestamptz,
  add column if not exists confirmed_at    timestamptz;

create unique index if not exists pending_coppa_signups_confirm_token_key
  on pending_coppa_signups (confirm_token)
  where confirm_token is not null;
