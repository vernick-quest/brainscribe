-- Performance indexes for hot query paths and RLS policy subqueries.
-- None of these change query results — they only let Postgres use index scans
-- instead of sequential scans. Safe and reversible (DROP INDEX to undo).
--
-- Run in the Supabase SQL Editor. CONCURRENTLY avoids locking writes; it cannot
-- run inside a transaction block, so run each statement on its own (the editor
-- runs them sequentially, which is fine).
--
-- Deliberately omitted because an existing UNIQUE constraint already provides
-- the index (leftmost-prefix covers the lookup):
--   * paragraph_scaffolds(session_id)        -- unique(session_id)
--   * relationships(watcher_id)              -- unique(watcher_id, student_id)
--   * assignment_teachers(session_id)        -- unique(session_id, teacher_id)

-- Dashboard: a student's sessions, newest first
create index concurrently if not exists sessions_student_updated_idx
  on sessions (student_id, updated_at desc);

-- Assignment page + tutor history: messages for a session in order
create index concurrently if not exists messages_session_created_idx
  on messages (session_id, created_at);

-- Paragraphs for a session in order
create index concurrently if not exists paragraphs_session_position_idx
  on paragraphs (session_id, position);

-- Parent RLS: relationship lookups by student (not covered by the unique prefix)
create index concurrently if not exists relationships_student_idx
  on relationships (student_id);

-- Teacher RLS: "sessions I teach" lookups by teacher (not covered by the unique prefix)
create index concurrently if not exists assignment_teachers_teacher_idx
  on assignment_teachers (teacher_id);
