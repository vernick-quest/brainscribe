-- 017_assignment_requirements.sql
-- Adds structured, multi-metric assignment requirements (targets + actual progress)
-- to sessions. Powers the live word/paragraph progress chip, DB tracking of the
-- actual counts, and accurate coach word-count check-ins (Rule 14).
--
-- Shape:
--   {
--     "targets": [ {"type":"words","min":300,"max":400,"label":"300–400 words"},
--                  {"type":"paragraphs","target":5,"label":"5 paragraphs"} ],
--     "actual":  { "words": 0, "paragraphs": 0 }
--   }
--
-- Nullable: existing sessions (and any assignment with no stated numeric requirement)
-- stay null and the feature is simply inert for them. RLS on `sessions` already
-- covers every column, so no new policy is needed.

alter table sessions
  add column if not exists requirements jsonb;
