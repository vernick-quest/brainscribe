-- 071 — The starting draft: what the student arrived with, frozen
--
-- ⚠️ NUMBER: authored against head 070. SPEC-coach-pace.md also named 071; that work is
-- 072 in this same change. Re-derive BOTH at paste time with
--     select max(version) from public.schema_migrations;
-- and renumber if another lane landed first. The ledger insert below carries no
-- `on conflict`, so a taken number fails loudly BEFORE any DDL runs (070 was renumbered
-- from 069 exactly this way on 2026-08-17).
--
-- WHY: on 2026-08-16 a student pasted ~700 words of an already-written story into the chat
-- composer three times. Nothing in the system knew that text was pre-written, so it became
-- scaffold components indistinguishable from words the coach drew out of her turn by turn.
-- That is the status quo, not an edge case: a student arriving with a draft has exactly one
-- way in and it is a channel we do not model. This does not open a door — it puts a frame
-- around a door that is already open.
--
-- What it buys: a BEFORE. The product's central claim is that the student did the writing,
-- and today that rests on process plus after-the-fact scoring (lib/provenance.js). With a
-- declared starting draft a parent can be shown "here is what she arrived with, here is what
-- she has now" — an artifact that does not exist today and cannot be reconstructed later.
--
-- ── THE ONE PROPERTY EVERYTHING DEPENDS ON ───────────────────────────────────────────────
-- The starting draft is IMMUTABLE BY CONSTRUCTION, not by discipline. If a student can edit
-- it in place there is no "before", and the growth artifact is fiction.
--
-- Same reasoning as /api/scaffold/[id]/grow taking a COUNT instead of an array: a destructive
-- write is given no wire representation, so it cannot be a bug. Here that means:
--   * INSERT and SELECT policies only. There is deliberately NO update policy and NO delete
--     policy for `authenticated` — under RLS a missing policy is a denial, and the explicit
--     revoke below removes the table-level grant as well, so neither PostgREST nor raw SQL
--     as `authenticated` has a path.
--   * One row per session (session_id is the PRIMARY KEY), so a second insert raises 23505
--     rather than silently no-opping. A quiet second write is the shape of every data loss
--     in this repo's history.
--   * Never fed back into any editor.
--
-- ⚠️ `on delete cascade` IS LOAD-BEARING. This is a child's writing. The under-13 7-day
-- auto-deletion (/api/cron/coppa-cleanup) deletes the SESSION; without the cascade a deleted
-- child's draft would outlive the account that consented to it. Do not assume it fires —
-- scripts/starting-draft-gate.mjs plants a row, deletes the session, and reads back.
--
-- word_count is STORED, not derived, so the growth number never depends on re-tokenising
-- the same text with a different splitter later.

insert into public.schema_migrations (version, applied_at, note)
values ('071', now(), 'session_starting_drafts — immutable arrival snapshot');

create table if not exists public.session_starting_drafts (
  session_id  uuid primary key references public.sessions(id) on delete cascade,
  content     text        not null,
  word_count  integer     not null,
  source      text        not null check (source in ('typed', 'pasted', 'upload')),
  created_at  timestamptz not null default now()
);

comment on table public.session_starting_drafts is
  'What the student arrived with, declared at session creation. IMMUTABLE: insert + select only, one row per session, no update/delete grant for authenticated. Deleting the session deletes this (COPPA).';
comment on column public.session_starting_drafts.word_count is
  'Word count AS CAPTURED. Stored, not derived, so the growth number cannot drift when a tokeniser changes.';
comment on column public.session_starting_drafts.source is
  'How it arrived: typed | pasted | upload. Declared by the client for display; not a provenance claim.';

alter table public.session_starting_drafts enable row level security;

-- The student may write their own, once, and read it back.
create policy "starting_draft: student inserts own"
  on public.session_starting_drafts for insert
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = session_starting_drafts.session_id
        and s.student_id = auth.uid()
    )
  );

create policy "starting_draft: student reads own"
  on public.session_starting_drafts for select
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_starting_drafts.session_id
        and s.student_id = auth.uid()
    )
  );

-- Linked parents/teachers read it. Mirrors "scaffold_watcher_read" (048) exactly: a
-- relationships join, no status gate. Transparency is the defence against the cheat vector
-- (a pasted essay someone else wrote) — a watcher who can see "arrived with 800 words,
-- added 40" needs no detector, so the watcher read is part of the feature, not an extra.
create policy "starting_draft: watcher reads"
  on public.session_starting_drafts for select
  using (
    exists (
      select 1
      from public.sessions s
      join public.relationships r on r.student_id = s.student_id
      where s.id = session_starting_drafts.session_id
        and r.watcher_id = auth.uid()
    )
  );

-- NO update policy. NO delete policy. Their absence is the feature — stated here so a
-- later reader does not "fix" the omission.
--
-- Belt and braces on top of that absence: strip the table-level UPDATE/DELETE grants that
-- `authenticated` would otherwise carry. RLS without a policy already denies, but a future
-- migration adding a permissive policy for some other purpose must not silently hand over
-- mutation as well.
revoke update, delete, truncate on public.session_starting_drafts from authenticated, anon;
grant  select, insert on public.session_starting_drafts to authenticated;

-- service_role keeps full access deliberately: the COPPA cron and admin tooling run as
-- service_role, and a `revoke ... from public` would strip it along with everyone else
-- (that exact mistake is called out in CLAUDE.md). The gate script asserts service_role can
-- still delete after this runs.
grant all on public.session_starting_drafts to service_role;
