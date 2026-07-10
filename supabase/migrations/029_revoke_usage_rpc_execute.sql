-- 029: Close the anon/authenticated EXECUTE leak on the admin cost rollup RPCs.
--
-- FINDING (2026-07-09): usage_by_user / usage_by_category / anthropic_usage_daily are
-- SECURITY DEFINER (they bypass RLS by design so the admin route can aggregate across
-- users). Supabase's default grants made them EXECUTE-able by `anon` — so ANY visitor
-- with the public anon key could call usage_by_user() directly and read every user's
-- email + full_name + cost. Confirmed live (anon returned 14 rows).
--
-- FIX: the admin usage route (app/api/admin/usage/route.js) now calls these via the
-- service-role client (deployed first), so revoking anon/authenticated EXECUTE closes
-- the leak with no functional loss.
--
-- NOTE: every role is a member of PUBLIC, so `revoke ... from public` also strips the
-- service_role's inherited access — we MUST re-grant EXECUTE to service_role explicitly,
-- or the admin Usage tab breaks. Run in the Supabase SQL Editor.

revoke execute on function usage_by_user(int)         from public, anon, authenticated;
revoke execute on function usage_by_category(int)     from public, anon, authenticated;
revoke execute on function anthropic_usage_daily(int) from public, anon, authenticated;

grant execute on function usage_by_user(int)         to service_role;
grant execute on function usage_by_category(int)     to service_role;
grant execute on function anthropic_usage_daily(int) to service_role;
