-- 063 — Presence: profiles.last_seen_at
-- ⚠️ CONFIRM THIS NUMBER WITH focus/infra BEFORE APPLYING. 061 is the last one in
-- this repo; 062 is claimed by the coach-ai truncation counters (number was a guess
-- there too). Nothing in the app depends on the number, only the column/function names.
--
-- Neither existing timestamp means "this person is using the app right now":
--   auth.users.last_sign_in_at moves ONLY on a fresh OAuth sign-in — a phone or iPad
--     that stays logged in refreshes its token silently for weeks, so the value goes
--     stale while the person is actively using the product (Baron read 25 days old
--     while sitting in front of it).
--   sessions.last_active_at moves only on a real coach/student TURN, so reading,
--     browsing, or opening a session without writing anything registers as nothing.
-- Hence a dedicated presence column, stamped from the session middleware on ordinary
-- authenticated requests.

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

-- Backfill from what we already know, so the column isn't uniformly null on day one.
-- greatest() ignores nulls here because both sides are coalesced.
update public.profiles p
   set last_seen_at = greatest(
         coalesce(p.last_login_at, 'epoch'::timestamptz),
         coalesce((select max(coalesce(s.last_active_at, s.updated_at))
                     from public.sessions s where s.student_id = p.id), 'epoch'::timestamptz)
       )
 where p.last_seen_at is null
   and (p.last_login_at is not null
        or exists (select 1 from public.sessions s where s.student_id = p.id));

-- Stamped by the middleware on an ordinary authenticated request, throttled to roughly
-- one write per user per 5 minutes by a short-lived cookie. Never moves backwards, so
-- an out-of-order request can't rewind presence.
create or replace function public.record_seen(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set last_seen_at = now()
   where id = p_user_id
     and (last_seen_at is null or last_seen_at < now())
$$;

-- SECURITY DEFINER runs as the owner and Postgres default-grants EXECUTE to PUBLIC.
-- Lock it down: presence is written by the server on the user's behalf, and a user
-- must not be able to stamp someone else's row.
revoke execute on function public.record_seen(uuid) from public, anon, authenticated;
grant execute on function public.record_seen(uuid) to service_role;
