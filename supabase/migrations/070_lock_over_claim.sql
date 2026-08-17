-- 070 — Count the turns where the coach said more was saved than it saved
--
-- RENUMBERED 069 → 070 at merge by the conductor. 069 was taken by
-- 069_session_health_findings.sql (focus/admin), applied 2026-08-16. The lane's number was
-- correct when written and stale by the time it landed — which is the whole reason the
-- ledger's insert carries no `on conflict`: pasting this as 069 would have failed loudly on
-- a duplicate key rather than half-applying against another lane's row.
--
-- WHY: a student hands over a passage too big for one section, the coach agrees to put it
-- in as two scenes, then emits ONE [DONE:] and writes "Both scenes are locked in." The
-- second scene is never saved and the student has been told it is safe. Reproduced 3/3
-- against the shipped prompt (scripts/prompt-harness/oversized-lock.mjs).
--
-- Nothing downstream could see it. coach_commitments records the promises the coach makes
-- IN TOKENS, so a section it never emitted a token for leaves no promise to reconcile —
-- the loss is invisible to the very detector built to catch losses. Silence in the
-- reassuring direction, which is this codebase's entire history of data loss.
--
-- Rule 25 currently holds it at 0/4, but that is a behavioural rate that has to be
-- re-measured every time the prompt moves. This counter is the deterministic half:
-- lib/coachCommitments.js detectLockOverClaim() compares the PROSE claim against the
-- TOKEN count on every turn, server-side, in /api/tutor's after() hook.

insert into public.schema_migrations (version, applied_at, note)
values ('070', now(), 'lock over-claim counter');

alter table sessions
  add column if not exists lock_over_claims     integer not null default 0,
  add column if not exists last_over_claim_at   timestamptz;

comment on column sessions.lock_over_claims is
  'Coach turns where the prose claimed more sections locked than lock tokens emitted. >0 means a section was very likely never saved WHILE THE STUDENT WAS TOLD IT WAS — read the transcript.';
comment on column sessions.last_over_claim_at is
  'When the most recent over-claim happened, so a fresh one is distinguishable from an old one already triaged.';

-- SECURITY DEFINER + service_role only, exactly like record_coach_turn_truncation (062).
-- This is a SAFETY counter: the number used to decide whether the coach is losing student
-- work. A signed-in user able to call it against an arbitrary session could inflate or
-- mask another student's signal. The route calls it with the service client.
--
-- NOT scoped with `and student_id = auth.uid()`: admin remote-in makes auth.uid() the
-- ADMIN, so the update would match zero rows and report success — a silent no-op inside a
-- silent-no-op detector.
-- ⚠️ p_claimed and p_emitted are ACCEPTED AND NOT STORED. Said plainly here because a
-- parameter the caller believes is being recorded is the same shape as every silent no-op
-- in this repo's history. The magnitudes live in the route's console.error alongside the
-- offending sentence, which is what triage actually reads; the signature keeps them so a
-- later migration can persist them without changing the call site.
create or replace function record_lock_over_claim(
  p_session_id uuid,
  p_claimed    integer,
  p_emitted    integer
) returns void
language sql
security definer
set search_path = public
as $$
  update sessions
     set lock_over_claims   = lock_over_claims + 1,
         last_over_claim_at = now()
   where id = p_session_id;
$$;

revoke execute on function record_lock_over_claim(uuid, integer, integer) from public, anon, authenticated;
grant  execute on function record_lock_over_claim(uuid, integer, integer) to service_role;

-- Triage: "which sessions may have lost a section the student was told was saved?"
create index if not exists sessions_lock_over_claims_idx
  on sessions (last_over_claim_at desc)
  where lock_over_claims > 0;
