-- ============================================================
-- Migration 002: assignment_teachers
-- Per-assignment teacher access (does not touch existing
-- parent access via the relationships table)
-- ============================================================

-- Link teachers to specific sessions (assignments).
-- A teacher only gains access to sessions they are explicitly added to —
-- no global student-level access.
create table assignment_teachers (
  id          uuid primary key default uuid_generate_v4(),
  session_id  uuid not null references sessions(id)  on delete cascade,
  teacher_id  uuid not null references profiles(id)  on delete cascade,
  added_by    uuid not null references profiles(id),  -- student or parent who added them
  added_at    timestamptz not null default now(),

  unique(session_id, teacher_id)
);

alter table assignment_teachers enable row level security;

-- ── assignment_teachers RLS ──────────────────────────────────

-- Teachers see only their own rows
create policy "assignment_teachers: teacher reads own"
  on assignment_teachers for select
  using (teacher_id = auth.uid());

-- Students can add/remove teachers for their own sessions
create policy "assignment_teachers: student manages own sessions"
  on assignment_teachers for all
  using (
    exists (
      select 1 from sessions
      where id = assignment_teachers.session_id
        and student_id = auth.uid()
    )
  );

-- Parents can add/remove teachers for their linked students' sessions
create policy "assignment_teachers: parent manages linked students"
  on assignment_teachers for all
  using (
    exists (
      select 1 from relationships r
      join sessions s on s.student_id = r.student_id
      where r.watcher_id = auth.uid()
        and s.id = assignment_teachers.session_id
    )
  );

-- Students can read assignment_teachers rows for their own sessions
-- (so they can see which teachers they've added)
create policy "assignment_teachers: student reads own session rows"
  on assignment_teachers for select
  using (
    exists (
      select 1 from sessions
      where id = assignment_teachers.session_id
        and student_id = auth.uid()
    )
  );

-- Parents can read assignment_teachers rows for their linked students' sessions
create policy "assignment_teachers: parent reads linked session rows"
  on assignment_teachers for select
  using (
    exists (
      select 1 from relationships r
      join sessions s on s.student_id = r.student_id
      where r.watcher_id = auth.uid()
        and s.id = assignment_teachers.session_id
    )
  );

-- ── sessions: add teacher read access ───────────────────────
-- The existing "sessions: watcher reads" policy covers parents.
-- This adds the narrower teacher equivalent.

create policy "sessions: teacher reads via assignment_teachers"
  on sessions for select
  using (
    exists (
      select 1 from assignment_teachers
      where session_id = sessions.id
        and teacher_id = auth.uid()
    )
  );

-- ── messages: add teacher read access ───────────────────────

create policy "messages: teacher reads via assignment_teachers"
  on messages for select
  using (
    exists (
      select 1 from assignment_teachers
      where session_id = messages.session_id
        and teacher_id = auth.uid()
    )
  );

-- ── paragraphs: add teacher read access ─────────────────────

create policy "paragraphs: teacher reads via assignment_teachers"
  on paragraphs for select
  using (
    exists (
      select 1 from assignment_teachers
      where session_id = paragraphs.session_id
        and teacher_id = auth.uid()
    )
  );

-- ── rubrics: add teacher read access ────────────────────────

create policy "rubrics: teacher reads via assignment_teachers"
  on rubrics for select
  using (
    exists (
      select 1 from assignment_teachers
      where session_id = rubrics.session_id
        and teacher_id = auth.uid()
    )
  );
