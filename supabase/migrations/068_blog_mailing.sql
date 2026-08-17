-- 068 — Blog mailing: unsubscribe state and a send ledger
--
-- WHY: the blog signup form collects addresses on "We'll send new posts as they go up"
-- and NOTHING sends one. Found 2026-08-16 by grepping for every subscriber-facing email
-- in the codebase: `sendWaitlistAck` and `sendWaitlistCode` are the complete set. Zero
-- people are harmed today because every live row is source='waitlist', but the
-- twice-weekly cadence just restarted specifically to drive signups to that form.
--
-- The fix is to build the sender rather than soften the promise — "we'll send new posts"
-- is what the form is FOR, and weakening it until it means nothing is not a repair.
--
-- 🔴 ORDERING CONSTRAINT, and it is the reason this migration exists at all: one-click
-- unsubscribe must ship with the FIRST bulk mailing, never after. Gmail and Yahoo
-- bulk-sender rules expect List-Unsubscribe-Post one-click, and an opt-out is the one
-- thing that cannot be retrofitted onto people you have already emailed.

insert into public.schema_migrations (version, applied_at, note)
values ('068', now(), 'blog mailing: unsubscribe + send ledger');

alter table public.subscribers
  add column if not exists unsubscribed_at timestamptz;

comment on column public.subscribers.unsubscribed_at is
  'When this address opted out of blog mail. A row with this set is a SUPPRESSION record: it is never mailed, and never purged by retention — you cannot honour "do not email me" after deleting the row that says so.';

-- Which posts have been mailed, so a second click cannot double-send.
--
-- Keyed by slug alone: a post is mailed once, ever. Re-sending an edited post to the
-- same list is a different action that should be a deliberate new decision, not an
-- accident of clicking twice.
create table if not exists public.blog_sends (
  slug            text primary key,
  sent_at         timestamptz not null default now(),
  recipient_count integer not null default 0,
  sent_by         uuid references public.profiles(id) on delete set null
);

comment on table public.blog_sends is
  'One row per blog post that has been mailed to subscribers. The primary key IS the idempotency guard — a duplicate send raises a unique violation rather than quietly mailing everyone twice.';

alter table public.blog_sends enable row level security;

-- Deny-by-default for clients; writes are service-role from /api/admin/blog-send.
create policy "blog_sends: admin read"
  on public.blog_sends for select using (is_admin());

-- The queue read for a send: blog subscribers who have not opted out.
create index if not exists subscribers_mailable_idx
  on public.subscribers (source)
  where unsubscribed_at is null;
