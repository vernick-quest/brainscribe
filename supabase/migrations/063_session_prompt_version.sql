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
-- honest ("unknown") rather than a fabricated version. Seeded DEMO sessions are also
-- left null on purpose (app/api/admin/seed-demo) — they are fabricated transcripts no
-- coach ever produced, so claiming they "ran on" any rule set would be a made-up value.
--
-- For null to keep meaning that, every LIVE creation path has to stamp. The stamp
-- originally covered only the two inserts in /api/sessions and missed three more —
-- both /api/gym/sessions inserts (Skill Studio runs on these same shared rules) and
-- the v2 continuation. All five now go through lib/sessionStamp.js, and
-- lib/sessionStamp.test.js sweeps app/api for any sessions insert that skips it.
--
-- Number CONFIRMED 063 at merge by the conductor (main held 062 as the highest).

alter table sessions
  add column if not exists coach_rules_version text,
  add column if not exists deploy_sha          text;

comment on column sessions.coach_rules_version is
  'sha256(core guardrails + structural coaching rules), first 12 hex — which coach RULES were live when this session ran. Excludes the persona block. Null = predates this column, or a seeded demo fixture.';
comment on column sessions.deploy_sha is
  'VERCEL_GIT_COMMIT_SHA at session creation — which COMMIT was deployed. Null outside Vercel / predates this column.';

-- Audit triage: "show me every session that ran on rules older than current."
create index if not exists sessions_coach_rules_version_idx
  on sessions (coach_rules_version)
  where coach_rules_version is not null;
