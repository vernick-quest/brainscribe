-- 066 — Waitlist approval: track who has been sent a code
--
-- WHY: /api/subscribe writes a row and returns ok. Nothing else in the repo reads the
-- `subscribers` table — no notification, no admin surface, no acknowledgment to the
-- person. Someone requested access on 2026-07-29 and was still sitting in silence on
-- 08-16. There was no way to answer "who asked and hasn't heard back?".
--
-- Most of the state is DERIVED at read time by joining `subscribers` to `profiles` on
-- email — whether they signed up, redeemed a code, or started writing is already
-- recorded there, and duplicating it would just create two answers that drift. The
-- only fact the system does not already hold is the one this migration adds:
-- whether WE have sent them a code, and which one.
--
-- That distinction matters. Two of the three people on the list had already signed up
-- and redeemed a code, so a queue built on `subscribers` alone would have shown them
-- as pending work and invited people who were already in.

alter table public.subscribers
  add column if not exists invited_at   timestamptz,
  add column if not exists invited_code text,
  add column if not exists dismissed_at timestamptz;

comment on column public.subscribers.invited_at is
  'When an admin sent this address an access code. Null = never contacted — this is the queue.';
comment on column public.subscribers.invited_code is
  'Which access code was sent, so a follow-up can repeat it rather than guess.';
comment on column public.subscribers.dismissed_at is
  'Admin removed this from the queue without inviting (spam, duplicate, not a fit). The row is kept: deleting it would let the same address re-enter the queue on a resubmit.';

-- The queue read: uncontacted, undismissed, oldest first.
create index if not exists subscribers_queue_idx
  on public.subscribers (created_at)
  where invited_at is null and dismissed_at is null;

-- RLS unchanged from 044: admin SELECT only, no client INSERT policy, all writes
-- through the service role. The new columns inherit that — there are no column-level
-- grants on this table, so table-level privileges cover them.
