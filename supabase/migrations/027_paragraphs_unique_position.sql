-- 027 — Dedupe paragraphs + enforce unique (session_id, position) for the /api/assemble upsert
-- File: 027_paragraphs_unique_position.sql · Date: 2026-07-07
--
-- /api/assemble upserts with onConflict (session_id, position), but no such
-- constraint ever existed: every upsert errored into an insert fallback, so any
-- re-assembled paragraph created a duplicate row (double-counted words and 500'd
-- the paragraph editor). Found by the 2026-07-07 fragility audit.
-- The code fix (upsert-only, fallback deleted) deploys AFTER this is applied.

-- 1) Remove existing duplicates, keeping the NEWEST row per (session_id, position)
--    (the latest assembly is the current text; ties broken by id).
delete from paragraphs p
using paragraphs newer
where newer.session_id = p.session_id
  and newer.position = p.position
  and (newer.created_at > p.created_at
       or (newer.created_at = p.created_at and newer.id > p.id));

-- 2) Enforce uniqueness. A unique index satisfies PostgREST's ON CONFLICT inference.
create unique index if not exists paragraphs_session_position_unique
  on paragraphs (session_id, position);
