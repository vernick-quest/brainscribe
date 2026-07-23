-- 048 — Watchers (linked parents/teachers) can read a student's paragraph_scaffolds (WIP draft)
--
-- WHY: While a session is in progress, the student's locked-in content lives in
-- paragraph_scaffolds.components (items[].text / .nuggetText) BEFORE any paragraph
-- is assembled into the `paragraphs` table. `paragraph_scaffolds` (008_scaffold.sql)
-- has an owner policy (`scaffold_student_all`) and a teacher read policy
-- (`scaffold_teacher_read`) but NO watcher/parent read policy. A linked parent can
-- already read `paragraphs`, `messages`, and `sessions` for their student (via the
-- `relationships` table — see the "watcher reads" policies in 001_initial_schema.sql),
-- but not the scaffold — so during early WIP the parent's transcript reads a blank
-- draft + "0 of N words". This grants the SAME watcher trust boundary on the scaffold.
--
-- SELECT-only, additive, no data change. Mirrors "paragraphs: watcher reads" (001)
-- exactly (relationship join, no status gate) so a watcher sees the WIP draft the
-- moment the student locks content. A NON-watcher (no relationships row) still
-- matches nothing and reads nothing.

create policy "scaffold_watcher_read"
  on public.paragraph_scaffolds for select
  using (
    exists (
      select 1
      from public.sessions s
      join public.relationships r on r.student_id = s.student_id
      where s.id = paragraph_scaffolds.session_id
        and r.watcher_id = auth.uid()
    )
  );
