-- Per-user cost attribution. Adds user_id to api_usage so every Anthropic and
-- ElevenLabs call can be tied to the user who triggered it (including pre-session
-- calls that have no session_id), plus a cross-service rollup for the admin panel.
-- Run in the Supabase SQL Editor.

alter table api_usage add column if not exists user_id uuid references profiles(id) on delete set null;
create index if not exists api_usage_user_idx on api_usage (user_id, created_at desc);

create or replace function usage_by_user(days int default 30)
returns table (
  user_id uuid,
  email text,
  full_name text,
  anthropic_cost numeric,
  elevenlabs_cost numeric,
  total_cost numeric,
  anthropic_calls bigint,
  elevenlabs_chars bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    u.user_id,
    p.email,
    p.full_name,
    coalesce(sum(u.cost_usd) filter (where u.service = 'anthropic'),  0) as anthropic_cost,
    coalesce(sum(u.cost_usd) filter (where u.service = 'elevenlabs'), 0) as elevenlabs_cost,
    coalesce(sum(u.cost_usd), 0)                                         as total_cost,
    count(*) filter (where u.service = 'anthropic')                      as anthropic_calls,
    coalesce(sum(u.characters) filter (where u.service = 'elevenlabs'), 0) as elevenlabs_chars
  from api_usage u
  left join profiles p on p.id = u.user_id
  where u.created_at >= now() - (days || ' days')::interval
    and u.user_id is not null
  group by u.user_id, p.email, p.full_name
  order by total_cost desc;
$$;
