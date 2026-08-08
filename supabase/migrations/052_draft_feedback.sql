-- 052 — Draft feedback (student "does this match what you wrote?" check)
--
-- The 2026-07-20 data loss was invisible to every system we had: the coach counted 185
-- words, the saved draft held 74, and nothing flagged it. A parent found it days later by
-- reading the finished essay.
--
-- The student is the one person who always knows whether their Final Draft is complete.
-- This table records that answer so a mismatch becomes an investigable signal instead of
-- a quiet disappointment.

create table if not exists public.draft_feedback (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  -- true = "this looks like what I wrote", false = "something's missing"
  matches      boolean not null,
  note         text,
  -- Word count at the moment they answered, so a later restore doesn't erase the
  -- evidence of what they were actually looking at.
  final_words  integer,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- One standing answer per session; re-answering updates it.
  unique (session_id)
);

create index if not exists draft_feedback_mismatch_idx
  on public.draft_feedback (created_at desc) where matches = false;

alter table public.draft_feedback enable row level security;

-- Students manage their own answer. Deliberately no UPDATE-to-another-student path:
-- the WITH CHECK on update re-asserts ownership.
drop policy if exists draft_feedback_owner_select on public.draft_feedback;
create policy draft_feedback_owner_select on public.draft_feedback
  for select using (student_id = auth.uid());

drop policy if exists draft_feedback_owner_insert on public.draft_feedback;
create policy draft_feedback_owner_insert on public.draft_feedback
  for insert with check (
    student_id = auth.uid()
    and exists (
      select 1 from public.sessions s
      where s.id = session_id and s.student_id = auth.uid()
    )
  );

drop policy if exists draft_feedback_owner_update on public.draft_feedback;
create policy draft_feedback_owner_update on public.draft_feedback
  for update using (student_id = auth.uid()) with check (student_id = auth.uid());

-- Watchers (parent/teacher) may READ a linked student's answer — they already see the
-- transcript, and "my child said their essay is missing work" is exactly the kind of
-- thing a parent should be able to see. No write path for them.
drop policy if exists draft_feedback_watcher_select on public.draft_feedback;
create policy draft_feedback_watcher_select on public.draft_feedback
  for select using (
    exists (
      select 1 from public.relationships r
      where r.student_id = draft_feedback.student_id
        and r.watcher_id = auth.uid()
    )
  );

-- Admin read-all for the investigation queue.
drop policy if exists draft_feedback_admin_select on public.draft_feedback;
create policy draft_feedback_admin_select on public.draft_feedback
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
