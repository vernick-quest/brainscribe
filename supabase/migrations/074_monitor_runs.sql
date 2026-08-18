-- 074 — Monitor runs
--
-- RENUMBERED 073 -> 074 by the conductor at merge. focus/assignment-intake authored
-- 073 (sessions.writing_mode) and Robert applied it while this was in flight — live ledger
-- head was already 073. Third numbering collision this week; the ledger's no-on-conflict
-- insert would have caught it at paste time, loudly, but catching it at merge is cheaper.: a recorded pulse for the passes nobody watches
--
-- Ledger head was 072 (`select max(version) from public.schema_migrations`, NOT `ls` —
-- this worktree's directory listing was stale by two files at the time of writing).
begin;
insert into public.schema_migrations (version, applied_at, note)
values ('074', now(), 'monitor runs ledger');

-- ── Two problems, one shape ───────────────────────────────────────────────────────────
--
-- 1. THE HEALTH PASS CANNOT SAY IT RAN. The admin panel infers "has the session-health
--    pass ever run?" from `session_health_findings` being non-empty. Findings clear by
--    DELETION, which is the property that makes the pass trustworthy — and it means a
--    genuinely healthy corpus is indistinguishable from a pass that never ran. Today the
--    UI says "Not checked yet" in both cases; on the day everything is finally fixed it
--    would say it forever.
--
-- 2. THE PROVENANCE MONITOR CANNOT SAY IT IS ALIVE. /api/scaffold suppresses recording a
--    provenance check whenever it cannot trust the score (an unknown starting-draft read).
--    That is the right trade — a fabricated failure poisons the calibration set
--    permanently, silence does not — but it means a column-name drift would stop recording
--    for 100% of sessions with no symptom except zero rows, which is exactly what a quiet
--    day looks like. See lib/monitorSilence.js.
--
-- Both are the same failure: a safety pass whose absence is invisible. So this table
-- records the PASS, not the findings. A monitor that has stopped running now has a
-- timestamp that stops moving, and that is something a human can see.
--
-- Append-only, one row per run. ~2 rows/day; no retention policy is needed and none is
-- implied — the history is the point, since "when did it stop" is unanswerable from a
-- single upserted row.
create table if not exists public.monitor_runs (
  id         uuid primary key default gen_random_uuid(),
  monitor    text        not null,
  ran_at     timestamptz not null default now(),
  -- 'ok'      — the pass ran and found the thing it monitors to be working
  -- 'alert'   — the pass ran and the thing it monitors is broken
  -- 'unknown' — the pass ran and there was NOTHING TO MEASURE. Deliberately its own
  --             state and NOT folded into 'ok': reporting zero-out-of-zero as a clean
  --             bill of health is a mistake this codebase has already made once.
  status     text        not null check (status in ('ok', 'alert', 'unknown')),
  detail     jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.monitor_runs is
  'One row per execution of a background safety pass (session_health, provenance_recording). Answers "did this run, and when did it stop" — which no findings table can answer, because findings clear by deletion and an empty table is ambiguous. status=unknown means the pass ran with nothing to measure; it is NOT a pass.';
comment on column public.monitor_runs.status is
  'ok | alert | unknown. unknown = ran with nothing to measure (no measurement, not an all-clear).';

-- The only query anyone runs: latest run for a monitor.
create index if not exists monitor_runs_latest_idx
  on public.monitor_runs (monitor, ran_at desc);

alter table public.monitor_runs enable row level security;
-- No anon/authenticated policies, matching session_health_findings (069),
-- draft_integrity_reviews (058) and audit_breach_reviews (060): written by the nightly
-- cron and read by the admin-gated route, both service-role. Clients deny-by-default.
--
-- No SECURITY DEFINER function here, so there is no default PUBLIC EXECUTE grant to
-- revoke — the trap 024's sample_unaudited_sessions had to be patched for.

commit;
