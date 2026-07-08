-- 026 — Add sessions.completed_at (gym suggestion engine reads it; column never existed)
-- File: 026_sessions_completed_at.sql · Date: 2026-07-07
--
-- lib/gymSuggest.js selects sessions.completed_at for freshness ordering and
-- staleness decay, but no migration ever created the column — the query errored,
-- the error was swallowed, and every profile-driven suggestion branch silently
-- degraded to sequential (found by the 2026-07-07 fragility audit).
-- Completion routes set this going forward (deploy AFTER applying this).

alter table sessions add column if not exists completed_at timestamptz;

-- Backfill: completed sessions get their last-touched time as the best available
-- approximation (updated_at ≈ created_at when a row was never explicitly updated).
update sessions
set completed_at = updated_at
where status = 'complete' and completed_at is null;
