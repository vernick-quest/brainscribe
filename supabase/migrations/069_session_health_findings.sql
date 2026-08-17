-- 069 — Session health findings (ledger head was 068; verified via
-- `select max(version) from public.schema_migrations`, not `ls`)
begin;
insert into public.schema_migrations (version) values ('069');

-- Sierra's data loss was found because a human opened her session and read it. The
-- nightly audit judges COACHING QUALITY from transcripts; her failure was MECHANICAL —
-- locks that never landed, paragraphs that don't exist, a reply cut mid-word. An audit
-- that reads what the coach SAID cannot see whether the student's work SURVIVED.
--
-- WHY A SEPARATE TABLE (checked before adding, as asked):
-- transcript_audit_findings carries a UNIQUE constraint on session_id — verified live by
-- attempting a second insert, which failed with 23505. One row per session means it
-- physically cannot hold both a judge finding and a health finding for the same session,
-- and Sierra's session already has a judge row. Beyond that the two have opposite
-- lifecycles: a judge finding is expensive model output written once and kept as history,
-- while a health finding is deterministic, recomputed nightly, and must CLEAR by itself
-- when the underlying condition is fixed. Storing them together would force one lifecycle
-- onto both.

create table if not exists public.session_health_findings (
  session_id  uuid not null references public.sessions(id) on delete cascade,
  -- One row per (session, signal): a session can be both truncated AND missing its
  -- draft, and those are separate problems with separate fixes.
  signal      text not null check (signal in (
                'no_draft_despite_locks', 'complete_without_draft',
                'truncated_turn', 'overstuffed_section', 'late_scaffold')),
  severity    text not null check (severity in ('critical', 'high', 'medium')),
  detail      text,
  -- Sessions created before the scaffold-write hole closed (2026-07-21). 12 historical
  -- rows land here on the first run; flagging them as pre-existing lets them be filed
  -- once instead of teaching the reader to skim past the tab.
  pre_existing boolean not null default false,
  -- Deterministic, so it can be re-derived: `first_seen_at` is when the condition
  -- appeared, `last_seen_at` when the pass last still saw it. A finding whose condition
  -- is fixed simply stops being re-stamped and is cleared by the pass.
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  -- Admin triage. Separate from the judge's, because "student work at risk" must not be
  -- dismissible with the same shrug as "coaching could be better".
  acknowledged  boolean not null default false,
  acknowledged_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  note        text,
  primary key (session_id, signal)
);

create index if not exists session_health_findings_triage_idx
  on public.session_health_findings (acknowledged, severity, last_seen_at desc);

alter table public.session_health_findings enable row level security;
-- No anon/authenticated policies on purpose (mirrors access_codes/045,
-- draft_integrity_reviews/058, audit_breach_reviews/060): written by the nightly cron
-- and read by the admin-gated route, both service-role. Clients are deny-by-default.

commit;
