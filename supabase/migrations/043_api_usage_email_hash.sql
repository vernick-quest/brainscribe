-- 043 — api_usage email_hash (deleted-user cost re-merge groundwork)
--
-- INFRA: the "043" here is PROVISIONAL. Assign the real next migration number
-- before hand-apply, and rename this file to match. Apply in the Supabase SQL
-- Editor (there is no migration runner). Until this is applied AND the env flag
-- USAGE_EMAIL_HASH_ENABLED=1 is set in Vercel, lib/usage.js does NOT write the
-- column, so the app is safe to deploy in either order (code no-ops pre-migration).
--
-- WHY:
--   api_usage.user_id is ON DELETE SET NULL (migration 013). When a user (or an
--   under-13 COPPA 7-day auto-deletion) is deleted, their spend rows survive but
--   are orphaned (user_id IS NULL), so per-user attribution is lost permanently
--   and there is no key to re-merge that spend for cost analysis.
--
--   Retaining the RAW email on usage rows post-deletion would conflict with the
--   COPPA deletion promise (that's PII we've promised to erase). A one-way
--   SHA-256 hash of the lowercased email is NOT reversible and is not PII by
--   itself, but it is stable — so a deleted user's historical spend can still be
--   grouped together for internal COST ANALYSIS (never to re-identify the person).
--
-- SCOPE OF THIS MIGRATION: schema only (add column + index). The hash is written
-- forward-only at usage-insert time (lib/usage.js). Existing rows are intentionally
-- NOT backfilled: for live users we'd have to re-read auth/profile emails, and for
-- already-deleted users the raw email is gone by design — there is nothing safe to
-- hash retroactively. So historical orphans stay unattributed; only NEW spend
-- becomes re-mergeable.

alter table api_usage add column if not exists email_hash text;

-- Grouping key for the (future) re-merge view. Not unique — one hash spans many rows.
create index if not exists api_usage_email_hash_idx on api_usage (email_hash);

comment on column api_usage.email_hash is
  'SHA-256 of lower(trim(email)) captured at insert time. One-way, non-PII grouping key '
  'used to re-associate a deleted user''s spend for cost analysis without retaining PII. '
  'Never reverse-mapped to identity. Written by lib/usage.js when USAGE_EMAIL_HASH_ENABLED=1.';
