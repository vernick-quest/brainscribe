-- 057 — "Keep working on this": session continuation (v2 copy)
-- File: 057_session_continuation.sql · Date: 2026-08-08
--
-- A finished session can't be reopened in place (it's the watcher-facing record AND the
-- input to the draft-integrity detector — mutating it rewrites completed_at, invalidates
-- grader review, and makes "what did they actually finish" unanswerable). Instead the
-- student mints a v2: a fresh `active` session that carries forward the scaffold + final
-- draft + sources + requirements and links back to v1. See docs/specs/brainscribe-keep-working-spec.md.
--
-- ONE link column: v2.continued_from -> v1. The reverse (v1 -> v2) is derived by lookup,
-- so there's no second pointer to keep in sync. `on delete set null` so deleting v1 never
-- cascades away a v2 the student is actively working; the child just loses its back-link.
-- `version` is display-only ("Draft 2"): v2 = v1.version + 1.
--
-- Number/apply owned by focus/infra (NEXT=057). Applied BY HAND in the Supabase SQL editor
-- (project lakozspeyxsuunogfant). Code that reads these columns degrades safely pre-apply
-- (supabase-js returns {data:null}), but the continue endpoint is dead until applied.

alter table sessions
  add column if not exists continued_from uuid references sessions(id) on delete set null,
  add column if not exists version int not null default 1;

-- UNIQUE partial index: one child per parent. This is both the lookup index ("do I
-- already have a child?" / "what did this continue from?") AND the transactional guard —
-- the endpoint's read-then-insert child check is racy (two fast taps both see no child),
-- so the DB enforces at-most-one v2 per v1; the second concurrent insert fails and the
-- endpoint rolls back its half-built session. NULLs are excluded, so uncontinued sessions
-- are unconstrained and a deleted child frees the parent to be continued again.
create unique index if not exists sessions_continued_from_idx
  on sessions (continued_from) where continued_from is not null;

-- Guard the unique slot against a hostile grab. RLS lets any user INSERT a sessions row
-- FOR THEMSELVES with any continued_from value (the FK only checks existence, not
-- ownership) — so a linked parent/teacher who knows a student's v1 id from a transcript
-- URL could insert {student_id: self, continued_from: <student's v1>}, take the unique
-- slot, and permanently 23505 the student's real "Keep working". This trigger requires
-- continued_from to reference a session owned by the SAME student as the new row, so a
-- user can only ever continue their OWN work. SECURITY INVOKER (default): the check is
-- student_id = NEW.student_id, which fails for an attacker regardless of what RLS lets
-- them read, so no definer/search_path exposure is needed.
create or replace function enforce_continuation_owner()
returns trigger language plpgsql as $$
begin
  if new.continued_from is not null and not exists (
    select 1 from sessions where id = new.continued_from and student_id = new.student_id
  ) then
    raise exception 'continued_from must reference a session owned by the same student';
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_continuation_owner on sessions;
create trigger sessions_continuation_owner
  before insert or update of continued_from on sessions
  for each row execute function enforce_continuation_owner();
