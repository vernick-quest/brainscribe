-- 054 — Coach commitments (what the coach promised it saved)
--
-- Every earlier attempt to detect lost student writing INFERRED it from the saved
-- artifact — empty slots, short word counts, cursor position. All ambiguous: a component
-- the coach deliberately skipped looks identical to one whose write was dropped.
--
-- The unambiguous signal was in the stream the whole time. [DONE:body] is a PROMISE that
-- the student's body paragraph is saved. A promise with nothing behind it is provable
-- loss; no promise means nothing was ever owed.
--
-- The property that makes it trustworthy: these rows are written SERVER-side in
-- /api/tutor's after() hook, while the student's writing is saved CLIENT-side through the
-- scaffold. Two independent paths. If the promise were recorded by the same code that
-- saves the work, a dropped write would take the evidence with it — which is precisely
-- how both silent-drop bugs survived a month of use.

create table if not exists public.coach_commitments (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions(id) on delete cascade,
  -- 'hook', 'context', 'body', 'reflection', … whatever the coach named in [DONE:…].
  component_id    text not null,
  emitted_at      timestamptz not null default now(),
  -- Re-emitting [DONE:hook] after an edit is normal and must not create a second row.
  unique (session_id, component_id)
);

create index if not exists coach_commitments_session_idx
  on public.coach_commitments (session_id);

alter table public.coach_commitments enable row level security;

-- NO insert/update/delete policy for anyone: rows are written by the service role only.
-- A client that could forge or delete a commitment could hide its own dropped write.

-- The student may read their own — this is a record about their work.
drop policy if exists coach_commitments_owner_select on public.coach_commitments;
create policy coach_commitments_owner_select on public.coach_commitments
  for select using (
    exists (
      select 1 from public.sessions s
      where s.id = coach_commitments.session_id and s.student_id = auth.uid()
    )
  );

drop policy if exists coach_commitments_admin_select on public.coach_commitments;
create policy coach_commitments_admin_select on public.coach_commitments
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
