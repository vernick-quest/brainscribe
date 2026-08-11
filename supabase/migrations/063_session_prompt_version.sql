-- 063 — Stamp the coach-rules version + deploy SHA on each session
--
-- WHY: audit findings carry no record of WHICH coach prompt was live when the
-- session ran, so a finding against a since-fixed prompt looks exactly as
-- actionable as one against a live bug. Triage on three separate findings had to
-- reconstruct that with `git log -S` on the rule text. This makes it a lookup.
--
-- Captured at SESSION CREATION, never at audit time: transcript_audit_findings rows
-- are written by the nightly run (later), so stamping there would record the version
-- live at audit time — actively misleading.
--
-- Two columns because they answer different questions and neither replaces the other:
--   coach_rules_version — sha256 of the SHARED rule blocks (core guardrails +
--     structural coaching rules), first 12 hex. Content-addressed: identifies the
--     RULES regardless of deploys/rebuilds. Excludes the persona block, so a
--     mid-session persona switch cannot look like a rules change. -> "same rules?"
--   deploy_sha — VERCEL_GIT_COMMIT_SHA at session creation; null outside Vercel
--     (local dev). Gives `git log` traceability. -> "which commit?"
--
-- Both nullable: every session that already exists predates this, and a null is
-- honest ("unknown") rather than a fabricated version.
--
-- NOTE: migration number confirmed as 063 by the conductor at authoring time —
-- RE-CONFIRM AT MERGE. 057-062 all landed within two days and two lanes collided
-- on 057; a number is a guess until the conductor merges it.

alter table sessions
  add column if not exists coach_rules_version text,
  add column if not exists deploy_sha          text;

comment on column sessions.coach_rules_version is
  'sha256(core guardrails + structural coaching rules), first 12 hex — which coach RULES were live when this session ran. Excludes the persona block. Null = predates this column.';
comment on column sessions.deploy_sha is
  'VERCEL_GIT_COMMIT_SHA at session creation — which COMMIT was deployed. Null outside Vercel / predates this column.';

-- Audit triage: "show me every session that ran on rules older than current."
create index if not exists sessions_coach_rules_version_idx
  on sessions (coach_rules_version)
  where coach_rules_version is not null;
