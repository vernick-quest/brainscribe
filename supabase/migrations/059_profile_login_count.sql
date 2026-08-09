-- 059 — Per-profile login count
-- Supabase keeps auth.users.last_sign_in_at but NO lifetime sign-in count, and the
-- auth schema isn't reachable through PostgREST, so a login count can't be read
-- retroactively — it has to be recorded from now on. Counts therefore start at the
-- deploy of this migration; they are not backfilled and must not be read as lifetime
-- history for accounts that existed before it.

alter table public.profiles
  add column if not exists login_count integer not null default 0,
  add column if not exists last_login_at timestamptz;

-- Atomic increment. A read-then-write from the app would lose concurrent logins
-- (two tabs finishing OAuth at once both read N and both write N+1); doing it in a
-- single UPDATE inside the function keeps it correct.
create or replace function public.record_login(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set login_count = login_count + 1,
         last_login_at = now()
   where id = p_user_id
$$;

-- SECURITY DEFINER runs as the owner and Postgres default-grants EXECUTE to PUBLIC,
-- so lock it down: only the service role (the auth callback) may record a login.
-- Without this any authenticated user could inflate their own — or another user's —
-- login count.
revoke execute on function public.record_login(uuid) from public, anon, authenticated;
grant execute on function public.record_login(uuid) to service_role;
