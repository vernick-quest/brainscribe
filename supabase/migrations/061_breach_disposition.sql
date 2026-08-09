-- 061 — Breach disposition (was the JUDGE right?), separate from resolved
--
-- Splits two questions that a single `resolved` flag conflates:
--   resolved     — "have I dealt with this?"      (workflow)
--   disposition  — "was the judge right?"          (calibration)
-- With both, "what share of HIGH findings did a human confirm as HIGH" becomes a
-- query instead of a recollection.
--
-- WHY THIS IS ITS OWN MIGRATION, not an amended 060: 060 was already applied
-- (2026-08-09). Re-running an amended `create table if not exists` would have been a
-- COMPLETE no-op — Postgres skips the whole statement when the table exists, so the
-- new column would silently never be created, the SQL would report success, and
-- every disposition write would 400 at runtime. Verified live before writing this:
-- audit_breach_reviews exists, audit_breach_reviews.disposition does not.
-- An applied migration is history; changes to it come as the next number.

alter table public.audit_breach_reviews
  add column if not exists disposition text
    check (disposition in ('confirmed', 'over_severe', 'false_positive'));
