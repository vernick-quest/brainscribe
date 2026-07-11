-- 032 — Add sessions.last_active_at for the multi-session essay-resume time-gate
-- File: 032_sessions_last_active_at.sql · Date: 2026-07-11
--
-- Why: a 5-paragraph essay is ~40–50 coach turns (essay-funnel sim, 2026-07-09) —
-- too long for one sitting, so students leave mid-essay and return later. On return
-- the writing surface (TutorSession) fires a deterministic "welcome back" resume
-- greeting, but ONLY after a real gap has elapsed (so a same-sitting refresh stays
-- silent). That gap is measured against this column. It is touched on every message
-- insert (/api/messages user turns, /api/tutor coach turns); when null (pre-backfill /
-- never-touched), the client falls back to the newest message timestamp.
--
-- Additive + idempotent. No RLS change: writes ride the existing "sessions: student
-- owns" policy (for all using auth.uid() = student_id). The backfill seeds a sane
-- initial value from existing activity so already-in-flight essays gate correctly.

alter table sessions add column if not exists last_active_at timestamptz;

update sessions
set last_active_at = coalesce(
  (select max(created_at) from messages m where m.session_id = sessions.id),
  updated_at,
  created_at
)
where last_active_at is null;
