-- 042 — Research & Citations v1: sources table
--
-- Stores ONLY bibliographic METADATA (title/author/publisher/date/url) a student
-- referenced — never source CONTENT (v1 scope: no scratchpad, no quotes, so no
-- external prose ever enters the DB). One row per source; the bibliography is
-- rendered deterministically from these structured fields by lib/citations.js
-- (structured fields, never formatted strings — so a source re-renders in MLA or
-- APA and a field edit reflows the citation).
--
-- session_id cascades on delete, so sources inherit the under-13 7-day COPPA
-- cleanup automatically (deleting a session/profile cascades to its sources).
--
-- RLS mirrors `paragraphs` exactly: the session owner does everything; linked
-- watchers (parents) and per-assignment teachers get read-only. Admin remote-in
-- reads via the service-role client (bypasses RLS), same as paragraphs — no admin
-- policy needed here.

create table if not exists sources (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  title          text,
  author         text,
  publisher      text,          -- site / container name ("National Geographic")
  published_date text,          -- kept as text: citation dates are often partial ("2021", "March 2021")
  url            text,
  accessed_date  date default current_date,
  -- how the card was created: 'voice' (coach [SOURCE:] capture), 'typed' (manual +),
  -- or 'fetched' (metadata auto-filled from the URL then confirmed by the student).
  origin         text not null default 'voice' check (origin in ('voice', 'typed', 'fetched')),
  position       int  not null default 0,   -- student-facing order within the session
  created_at     timestamptz not null default now()
);

create index if not exists sources_session_position_idx
  on sources (session_id, position);

alter table sources enable row level security;

-- Owner: full access to their own session's sources.
create policy "sources: session owner" on sources
  for all using (
    exists (select 1 from sessions where id = sources.session_id and student_id = auth.uid())
  );

-- Watcher (linked parent/guardian): read-only.
create policy "sources: watcher reads" on sources
  for select using (
    exists (
      select 1 from sessions s
      join relationships r on r.student_id = s.student_id
      where s.id = sources.session_id and r.watcher_id = auth.uid()
    )
  );

-- Teacher granted this assignment: read-only.
create policy "sources: teacher reads via assignment_teachers" on sources
  for select using (
    exists (
      select 1 from assignment_teachers
      where session_id = sources.session_id
        and teacher_id = auth.uid()
    )
  );
