-- Server-side daily rollup for the admin usage dashboard. Replaces transferring
-- every api_usage row for 30 days and summing in JS — Postgres groups by day and
-- returns ~30 rows. Uses the existing api_usage_service_idx / created_at_idx.
--
-- SECURITY DEFINER so the admin route can call it; the route already checks the
-- caller is an admin before invoking. Run in the Supabase SQL Editor.

create or replace function anthropic_usage_daily(days int default 30)
returns table (
  day date,
  cost numeric,
  calls bigint,
  input bigint,
  output bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    (created_at at time zone 'UTC')::date as day,
    coalesce(sum(cost_usd), 0)      as cost,
    count(*)                         as calls,
    coalesce(sum(input_tokens), 0)  as input,
    coalesce(sum(output_tokens), 0) as output
  from api_usage
  where service = 'anthropic'
    and created_at >= now() - (days || ' days')::interval
  group by 1
  order by 1 desc;
$$;
