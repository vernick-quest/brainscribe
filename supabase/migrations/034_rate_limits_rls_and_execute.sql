-- 034_rate_limits_rls_and_execute.sql
-- SECURITY HOTFIX (Fable audit 2026-07-11, conductor-verified against 014 + all
-- later migrations + lib/ratelimit.js). Same class as the 029 email-leak: an
-- object left open to the public anon role by Postgres default. The rate_limits
-- limiter is written ONLY server-side via the service-role client
-- (lib/ratelimit.js -> createServiceClient().rpc('check_rate_limit')), so BOTH
-- locks below are ZERO functional loss.
--
-- FINDING 1 (rate_limits RLS disabled): 014 created the table but never ran
-- `enable row level security`, and no later migration did either — it is the only
-- table in the schema without RLS. Supabase grants anon+authenticated full table
-- access by default; RLS is the only restraint. With it off, anyone holding the
-- browser-shipped NEXT_PUBLIC_SUPABASE_ANON_KEY can GET /rest/v1/rate_limits and
-- read every row. The `key` column embeds user UUIDs (tutor:<uuid>, speak:<uuid>,
-- coppa-initiate:<uuid>, ...) + count + window_start = active-user enumeration,
-- per-feature usage, and last-active timestamps on a children's app; the same open
-- grant also allows INSERT/UPDATE/DELETE (reset own limiter, or inflate a victim's
-- to DoS their coach/voice).
alter table rate_limits enable row level security;
-- No policies added => deny-all to anon/authenticated. check_rate_limit() is
-- SECURITY DEFINER (runs as owner, bypasses RLS) and is called via the service
-- client, so the limiter keeps working. Belt-and-suspenders revoke of the default
-- table grants:
revoke all on table rate_limits from anon, authenticated;

-- FINDING 2 (check_rate_limit EXECUTE not revoked): the SECURITY DEFINER function
-- inherits Postgres' default EXECUTE-to-PUBLIC and — unlike the audit RPCs (024)
-- and usage RPCs (029) — was never revoked. An anon caller can
-- rpc('check_rate_limit', {p_key, p_max, p_window_seconds}) with a predictable key
-- (tutor:<victim-uuid>) to trip that user's limiter (targeted denial of the coach)
-- or pass a huge p_max to no-op their own. Mirror the 029 revoke.
revoke execute on function check_rate_limit(text, int, int) from public, anon, authenticated;
grant  execute on function check_rate_limit(text, int, int) to service_role;
