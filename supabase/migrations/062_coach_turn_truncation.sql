-- 062 — Coach turn truncation tracking
--
-- WHY: every control token ([DONE:id:words], [PARA_DONE], [THESIS], [COMPLETE],
-- [CARE]) is emitted at the END of a coach turn. A turn cut off at max_tokens can
-- silently drop a LOCK (the student's confirmed text never reaches the Draft — the
-- scaffold-data-loss signature) or a [CARE] (crisis card never renders).
-- 6 of 18 audited sessions reported truncated turns and nothing could distinguish
-- "dropped a lock" from "merely cut prose". That blindness is the defect this fixes.
--
-- had_lock_token = false is the DISCRIMINATOR: a truncated turn with no control
-- token at all is the case that may have destroyed a lock.
--
-- NOTE: migration number is this lane's best guess — confirm at merge (lanes cannot
-- see each other's numbering; 057 collided once already).

alter table sessions
  add column if not exists truncated_turns          integer     not null default 0,
  add column if not exists truncated_turns_no_lock  integer     not null default 0,
  add column if not exists last_truncated_at        timestamptz;

comment on column sessions.truncated_turns is
  'Count of coach turns that ended with stop_reason=max_tokens (cut off mid-turn).';
comment on column sessions.truncated_turns_no_lock is
  'Subset of truncated_turns that emitted NO control token — a [DONE]/[CARE] may have been dropped.';

-- Atomic increment so concurrent turns cannot lose a count via read-modify-write.
-- SECURITY DEFINER: the caller is the student's own session (RLS-scoped), but the
-- counter must still increment for a session row the user may only select/update
-- narrowly. Locked to the session's own row; no data is returned.
create or replace function record_coach_turn_truncation(
  p_session_id uuid,
  p_had_lock_token boolean
) returns void
language sql
security definer
set search_path = public
as $$
  update sessions
     set truncated_turns         = truncated_turns + 1,
         truncated_turns_no_lock = truncated_turns_no_lock + case when p_had_lock_token then 0 else 1 end,
         last_truncated_at       = now()
   where id = p_session_id;
$$;

revoke all on function record_coach_turn_truncation(uuid, boolean) from public;
grant execute on function record_coach_turn_truncation(uuid, boolean) to authenticated;

-- Audit/ops: find sessions where a lock may have been lost.
create index if not exists sessions_truncated_no_lock_idx
  on sessions (truncated_turns_no_lock)
  where truncated_turns_no_lock > 0;
