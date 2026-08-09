-- 060 — Per-breach admin triage for guardrail-audit findings
-- ⚠️ CONFIRM THIS NUMBER WITH focus/infra BEFORE APPLYING (059 is the last applied
-- one I know of). Nothing in the app depends on the number, only the table name.
--
-- transcript_audit_findings holds ONE row per audited session, but a single session
-- routinely contains several distinct breaches (one real assignment currently has
-- three). Resolution and notes lived only at the session level, so answering one
-- error meant answering all of them. This gives each breach its own verdict.

create table if not exists public.audit_breach_reviews (
  finding_id  uuid not null references public.transcript_audit_findings(id) on delete cascade,
  -- Stable identity for a breach WITHIN a finding: "<type>#<coach turn index>", e.g.
  -- 'compose_as_transcription#38'. Deliberately not the array position — if a finding
  -- is ever re-analyzed (re-audit is a v1.1 idea), positions shift but the same breach
  -- at the same coach turn keeps its key, so a verdict stays attached to the error it
  -- actually answered.
  breach_key  text not null,
  resolved    boolean not null default false,
  note        text,
  -- Was the judge RIGHT about this one? Optional, and deliberately separate from
  -- `resolved` (which answers "have I dealt with it"). This is what makes severity
  -- calibration queryable instead of anecdotal: with it you can ask "what share of
  -- HIGH findings did a human confirm as HIGH?" rather than recalling a few examples.
  --   confirmed      — the breach is real and the severity fits
  --   over_severe    — a real breach, but graded harsher than it deserved
  --   false_positive — not a breach; the judge was wrong
  disposition text check (disposition in ('confirmed', 'over_severe', 'false_positive')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  primary key (finding_id, breach_key)
);

-- Reading every verdict for a finding is the only access pattern.
create index if not exists audit_breach_reviews_finding_idx
  on public.audit_breach_reviews (finding_id);

alter table public.audit_breach_reviews enable row level security;
-- No anon/authenticated policies on purpose (mirrors access_codes/045 and
-- draft_integrity_reviews/058): written and read ONLY by the service role from the
-- admin-gated /api/admin/audit-findings route. Normal clients are deny-by-default.
