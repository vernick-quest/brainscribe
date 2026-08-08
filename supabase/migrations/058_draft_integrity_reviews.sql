-- 058 — Draft-integrity admin triage
-- Renumbered 057 → 058 by the conductor: focus/coaching-session won the race for 057
-- (session continuation), and 057 was applied to prod on 2026-08-08 before this landed.
-- Nothing in the app depends on the number, only on the table name.
--
-- Standing ADMIN verdict on a session the draft-integrity alert flagged, so the same
-- five alerts stop reappearing with no way to answer them.
--
-- Deliberately NOT draft_feedback: that table is the STUDENT's own answer to "does
-- this match what you wrote?" and an admin verdict must NEVER overwrite a child's
-- report. Separate table, separate meaning.

create table if not exists public.draft_integrity_reviews (
  session_id   uuid primary key references public.sessions(id) on delete cascade,
  status       text not null check (status in ('resolved', 'not_relevant', 'watching')),
  note         text,
  -- Fingerprint of the alert's determining signals AT REVIEW TIME (lib/
  -- draftIntegrityReview.js signalFingerprint). On every recheck the route
  -- recomputes the current fingerprint and compares: a mismatch means the
  -- underlying signal moved (a scaffold appeared, the draft was repaired, the
  -- student reported missing work) so a 'resolved'/'not_relevant' verdict is stale
  -- and the alert resurfaces. Without this, a stale "resolved" is how a real
  -- regression stays hidden.
  signal       text not null,
  reviewed_by  uuid references public.profiles(id) on delete set null,
  reviewed_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- session_id is the PK → one standing verdict per session; a new verdict UPSERTs.

alter table public.draft_integrity_reviews enable row level security;
-- No anon/authenticated policies on purpose (mirrors access_codes, migration 045):
-- this verdict is written and read ONLY by the service role from the admin-gated
-- /api/admin/draft-integrity route (service role bypasses RLS). Normal clients are
-- deny-by-default.
