-- Cost buckets for the admin Usage & Cost tab. Adds a category dimension +
-- line-item metadata to api_usage so spend can be split into
-- Users / Testing / Other, plus a rollup RPC for the bucket card.
--
-- WHY: api_usage captures ONLY app-originated calls (real students, Sonnet+Haiku).
-- Red-team sims run as local node scripts hitting the API directly and are never
-- logged, so ~$100 of testing spend is invisible and there's no bucketing.
--
-- SECURITY DEFINER on the RPCs so the admin route can call them; the route already
-- checks the caller is an admin before invoking. Do NOT grant EXECUTE to
-- anon/authenticated beyond the existing pattern. Run in the Supabase SQL Editor.

-- Category dimension + line-item metadata for api_usage.
alter table api_usage add column if not exists category text not null default 'user'
  check (category in ('user','testing','internal','other'));
alter table api_usage add column if not exists note text;                 -- line-item label (e.g. "essay-funnel sim 07-09")
alter table api_usage add column if not exists is_estimate boolean not null default false;
create index if not exists api_usage_category_idx on api_usage (category, created_at desc);

-- New rollup: spend by bucket over N days (admin-gated in the route, like the others).
create or replace function usage_by_category(days int default 30)
returns table (category text, cost numeric, calls bigint, is_estimate_any boolean)
language sql security definer set search_path = public stable as $$
  select category,
         coalesce(sum(cost_usd),0) as cost,
         count(*)                  as calls,
         bool_or(is_estimate)      as is_estimate_any
  from api_usage
  where created_at >= now() - (days || ' days')::interval
  group by category
  order by cost desc;
$$;

-- Keep the existing "Anthropic (per-day)" card meaning PRODUCTION-only so testing rows
-- don't inflate it. Re-scope anthropic_usage_daily to category='user'.
create or replace function anthropic_usage_daily(days int default 30)
returns table (day date, cost numeric, calls bigint, input bigint, output bigint)
language sql security definer set search_path = public stable as $$
  select (created_at at time zone 'UTC')::date as day,
         coalesce(sum(cost_usd),0), count(*),
         coalesce(sum(input_tokens),0), coalesce(sum(output_tokens),0)
  from api_usage
  where service = 'anthropic' and category = 'user'
    and created_at >= now() - (days || ' days')::interval
  group by 1 order by 1 desc;
$$;
