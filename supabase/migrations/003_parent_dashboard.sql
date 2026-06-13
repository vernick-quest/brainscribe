-- ─────────────────────────────────────────────────────────────
-- Migration 003: Parent dashboard support
-- ─────────────────────────────────────────────────────────────

-- Allow watchers (parents/teachers via relationships) to read
-- their linked students' profiles, so the dashboard can show names.
create policy "profiles: watcher reads linked students" on profiles
  for select using (
    exists (
      select 1 from relationships
      where watcher_id = auth.uid()
        and student_id = profiles.id
    )
  );

-- Allow teachers to read profiles of students they're linked to
-- via assignment_teachers (they already can read sessions/paragraphs;
-- this lets them show the student's name in the teacher dashboard).
create policy "profiles: assignment teacher reads student" on profiles
  for select using (
    exists (
      select 1 from assignment_teachers at2
      join sessions s on s.id = at2.session_id
      where at2.teacher_id = auth.uid()
        and s.student_id = profiles.id
    )
  );

-- Allow students to insert parent invites for themselves.
-- (Separate from the existing teacher/parent insert policy.)
create policy "invites: student inserts parent invite" on invites
  for insert with check (
    auth.uid() = invited_by
    and role = 'parent'
    and exists (select 1 from profiles where id = auth.uid() and role = 'student')
  );
