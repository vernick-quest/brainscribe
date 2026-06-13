-- Per-user rate limiting backed by Postgres (durable across serverless instances,
-- unlike in-memory counters). Fixed-window counter: each key tracks a count and
-- the window start; check_rate_limit atomically increments and reports allow/deny.
-- Run in the Supabase SQL Editor.

create table if not exists rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        int not null default 0
);

-- Returns true if the call is allowed (count within p_max for the current window),
-- false if the limit is exceeded. The upsert is atomic, so concurrent calls from
-- the same user can't race past the limit.
create or replace function check_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now   timestamptz := now();
  v_count int;
begin
  insert into rate_limits (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update set
    count = case
      when rate_limits.window_start < v_now - make_interval(secs => p_window_seconds) then 1
      else rate_limits.count + 1
    end,
    window_start = case
      when rate_limits.window_start < v_now - make_interval(secs => p_window_seconds) then v_now
      else rate_limits.window_start
    end
  returning count into v_count;

  return v_count <= p_max;
end;
$$;
