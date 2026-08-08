-- 053 — Restoration notices + in-session issue reports
--
-- Two things the 2026-07-20 incident showed we had no place to put.
--
-- 1. When we repair a student's draft, they deserve to be TOLD. Silently editing a child's
--    essay — even to put back their own words — is worse than the bug if they notice and
--    can't explain it. The notice frames it honestly: we found a gap, we put your work
--    back. It is acknowledged once and then gone for good.
--
-- 2. Elio typed "The body is not showing where all my writing is" MID-SESSION, a month
--    before anyone acted on it. The transcript check added in 052 only asks at the end.
--    A student who notices a problem while writing needs somewhere to say so right then.

create table if not exists public.draft_restorations (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions(id) on delete cascade,
  student_id      uuid not null references public.profiles(id) on delete cascade,
  -- What the draft looked like before and after, so the notice can be specific rather
  -- than vague ("we added back 54 words" beats "we made some changes").
  words_before    integer,
  words_after     integer,
  -- Plain-language, student-facing. NOT a stack trace.
  summary         text,
  restored_at     timestamptz not null default now(),
  -- Set when the student dismisses the notice. Once set, the banner never returns.
  acknowledged_at timestamptz,
  unique (session_id)
);

create index if not exists draft_restorations_unacked_idx
  on public.draft_restorations (student_id) where acknowledged_at is null;

alter table public.draft_restorations enable row level security;

-- The student sees their own notice and is the only one who can dismiss it.
drop policy if exists draft_restorations_owner_select on public.draft_restorations;
create policy draft_restorations_owner_select on public.draft_restorations
  for select using (student_id = auth.uid());

-- UPDATE only — rows are created by the restore process (service role), never by a client.
-- WITH CHECK re-asserts ownership so an update can't move a row to another student.
drop policy if exists draft_restorations_owner_ack on public.draft_restorations;
create policy draft_restorations_owner_ack on public.draft_restorations
  for update using (student_id = auth.uid()) with check (student_id = auth.uid());

-- Watchers (parent/teacher) may READ. A parent found the original loss; if we repair a
-- child's essay the parent should be able to see that we did. No write path.
drop policy if exists draft_restorations_watcher_select on public.draft_restorations;
create policy draft_restorations_watcher_select on public.draft_restorations
  for select using (
    exists (
      select 1 from public.relationships r
      where r.student_id = draft_restorations.student_id
        and r.watcher_id = auth.uid()
    )
  );

drop policy if exists draft_restorations_admin_select on public.draft_restorations;
create policy draft_restorations_admin_select on public.draft_restorations
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );


-- ── 2. In-session reporting ───────────────────────────────────────────────────────────
-- `source` separates "I flagged this while writing" from "I answered at the end".
alter table public.draft_feedback
  add column if not exists source text not null default 'transcript';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'draft_feedback_source_check'
  ) then
    alter table public.draft_feedback
      add constraint draft_feedback_source_check check (source in ('transcript', 'in_session'));
  end if;
end $$;

-- Spam control by construction: ONE standing report per session per source. A student who
-- keeps tapping "something's missing" updates their existing report instead of generating
-- a new alert every time. Replaces the unique(session_id) added in 052.
alter table public.draft_feedback drop constraint if exists draft_feedback_session_id_key;
create unique index if not exists draft_feedback_session_source_idx
  on public.draft_feedback (session_id, source);
