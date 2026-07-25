-- 049 — Optional redemption cap per access code (+ the atomic claim)
-- File: supabase/migrations/049_access_code_max_uses.sql · Date: 2026-07-25
--
-- ⚠️ Apply BY HAND in the Supabase SQL Editor for project lakozspeyxsuunogfant
--    (NOT qqxgfg… — check the project switcher). Conductor security-reviews first.
--
-- 🔴 APPLY BEFORE DEPLOY — this one is NOT deploy-safe in either order.
--    /api/access/redeem calls claim_access_code() and the admin panel selects
--    max_uses. Ship the code first and EVERY redemption 500s until this runs.
--    Applying this first is harmless: the old code ignores both.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY — denial-of-wallet gap in the Beta access gate.
--
-- 045 created access_codes with a `uses` counter but NOTHING enforces a ceiling:
-- POST /api/access/redeem sets profiles.access_granted = true for anyone holding a
-- valid ACTIVE code, unconditionally. The cap of 100 governs only is_beta_circle
-- (the locked RATE), not access. A leaked/shared code therefore = unbounded free
-- coach + TTS + mic. (047 already had to deactivate one leaked code, `unblock`.)
--
-- This adds an OPTIONAL per-code redemption ceiling. NULL = unlimited, so every
-- existing code keeps today's behavior exactly until an admin sets a limit.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.access_codes
  add column if not exists max_uses integer;

comment on column public.access_codes.max_uses is
  'Optional redemption ceiling. NULL = unlimited. Enforced atomically by claim_access_code().';

-- Defense in depth: a NEGATIVE max_uses would already fail closed (uses < max_uses
-- is false, so the code reads as exhausted), but reject it at the DB too so the
-- column can never hold a nonsense value. 0 is allowed = "permanently exhausted"
-- (the API layer still refuses to SET 0 — use the Active toggle to pause a code).
-- `add constraint if not exists` doesn't exist; guard on pg_constraint instead.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'access_codes_max_uses_nonneg'
  ) then
    alter table public.access_codes
      add constraint access_codes_max_uses_nonneg
      check (max_uses is null or max_uses >= 0);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- THE ATOMIC CLAIM.
--
-- Today's redeem route does a read-then-write bump of `uses` (select, then update
-- to uses+1). That is a racy read-modify-write: fine as telemetry, USELESS as a
-- cap — N concurrent redeemers all read the same `uses` and all pass any JS-side
-- check. A cap has to be claimed in ONE statement.
--
-- This function is that statement. A single UPDATE takes a row lock; under READ
-- COMMITTED a second concurrent redeemer BLOCKS on that lock, then re-evaluates
-- the WHERE clause against the freshly committed row (EvalPlanQual re-check). So
-- at the boundary (uses = max_uses - 1) exactly ONE of two simultaneous callers
-- gets the row back; the other's predicate now fails and it returns zero rows.
-- That re-check is the entire point — do not "optimize" this into select+update.
--
-- Returns the claimed row (1 row) or NOTHING. Zero rows is deliberately
-- ambiguous — not-found / inactive / exhausted all look the same — so the caller
-- re-selects the row to classify the failure for copy (see the route).
--
-- setof public.access_codes (rather than a RETURNS TABLE list) avoids OUT-parameter
-- name collisions with the table's own columns inside the body.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.claim_access_code(p_code text)
returns setof public.access_codes
language sql
security definer
set search_path = public
as $$
  update public.access_codes
     set uses = uses + 1
   where code = p_code
     and active = true
     and (max_uses is null or uses < max_uses)
  returning *;
$$;

comment on function public.claim_access_code(text) is
  'Atomically claim one redemption slot on an access code. Returns the row on success, zero rows if missing/inactive/exhausted. Service role only.';

-- Lock EXECUTE down to the service role, mirroring 029/034. Every role is a member
-- of PUBLIC, so `revoke ... from public` also strips service_role's inherited
-- access — the explicit re-grant is REQUIRED or redemption breaks entirely.
-- This function bumps a counter and is SECURITY DEFINER; anon/authenticated must
-- never be able to call it (they could burn a code's remaining uses at will).
revoke execute on function public.claim_access_code(text) from public, anon, authenticated;
grant  execute on function public.claim_access_code(text) to service_role;

-- PostgREST caches the schema; nudge it so .rpc('claim_access_code') resolves
-- immediately instead of after the next auto-reload.
notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Post-apply verification (run in the same SQL editor; paste results back).
--
-- 1) Column + constraint exist, every existing code is still unlimited:
--      select code, active, uses, max_uses from public.access_codes order by created_at;
--    EXPECT: max_uses NULL on every row (nothing capped until an admin sets one).
--
-- 2) EXECUTE is service-role only:
--      select proname, proacl from pg_proc where proname = 'claim_access_code';
--    EXPECT: proacl mentions service_role=X and NOT anon= / authenticated= / =X (public).
--
-- 3) search_path is pinned (041/043 invariant):
--      select proname, prosecdef, proconfig from pg_proc where proname = 'claim_access_code';
--    EXPECT: prosecdef = true, proconfig contains 'search_path=public'.
--
-- 4) Smoke the claim on a THROWAWAY code (do NOT run against draftzero):
--      insert into public.access_codes (code, label, grants_beta_circle, active, max_uses)
--      values ('_tmp049', 'migration smoke test', false, true, 1);
--      select * from public.claim_access_code('_tmp049');  -- EXPECT 1 row, uses = 1
--      select * from public.claim_access_code('_tmp049');  -- EXPECT 0 rows (exhausted)
--      delete from public.access_codes where code = '_tmp049';
--
-- 5) AFTER deploy, cap the live code from /admin → Beta Circle → "Limit" (the
--    set_code_limit action). Setting a limit is a UI action, not a migration —
--    the live code value is deliberately not written into this public repo.
-- ─────────────────────────────────────────────────────────────────────────────
