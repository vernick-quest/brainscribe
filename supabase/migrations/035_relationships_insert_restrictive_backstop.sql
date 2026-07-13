-- 035 — relationships INSERT: restrictive deny-all backstop for `authenticated`
-- File: 035_relationships_insert_restrictive_backstop.sql · Date: 2026-07-12
--
-- ⚠️ INFRA: confirm this is the correct next number before applying (034 was the
--    last file; assign/renumber if infra has queued another 035). Apply BY HAND in
--    the Supabase SQL Editor for project lakozspeyxsuunogfant (NOT qqxgfg…).
--
-- WHY (child-safety + consent red-team, 2026-07-12):
-- Migration 023 DROPPED the permissive "relationships: insert by watcher" policy
-- (finding 9: any authenticated user could self-insert a watcher→student row for
-- ANY child, then read that child's full transcript/PII via the watcher SELECT
-- policies). Every legitimate relationship write is service-role now (invite claim,
-- /coppa/complete, /api/profile/birthdate). With no permissive INSERT policy, the
-- authenticated role can't insert — the moat holds.
--
-- BUT that moat is "no policy exists," which a single future migration (or a
-- console edit) could silently re-open by re-adding a permissive insert policy.
-- Because a self-inserted watcher row is a direct child-safety exposure (unauthorized
-- adult gains oversight of a minor), it warrants a backstop that CANNOT be undone by
-- accident: a RESTRICTIVE policy. Postgres AND-combines restrictive policies with
-- every permissive one, so as long as this exists, an authenticated INSERT is denied
-- even if a permissive "insert by watcher" policy is re-added later. Removing the
-- moat then takes a deliberate DROP of THIS policy, not just the addition of another.
--
-- Service-role writes BYPASS RLS entirely, so the legitimate relationship-creation
-- paths (all service-role) are unaffected. `anon` can't satisfy any policy anyway.
--
-- Idempotent (drop-then-create). Reversible: DROP POLICY the line below.

drop policy if exists "relationships: no client insert (restrictive)" on relationships;

create policy "relationships: no client insert (restrictive)"
  on relationships
  as restrictive
  for insert
  to authenticated
  with check (false);

-- ── Post-apply verification (run in the same SQL editor; paste results back) ────
-- 1) This backstop is present and RESTRICTIVE:
--      select polname, permissive, cmd
--      from pg_policies
--      where tablename = 'relationships';
--    EXPECT: the "no client insert (restrictive)" row with permissive = 'RESTRICTIVE',
--    and NO permissive INSERT policy (023 dropped "insert by watcher").
--
-- 2) GATING RE-VERIFY that 023 is actually live (child-safety moat depends on it):
--      select polname, cmd from pg_policies
--      where tablename = 'relationships' and cmd = 'INSERT' and permissive = 'PERMISSIVE';
--    EXPECT: 0 rows.  (If "relationships: insert by watcher" appears → 023 was NOT
--    applied → self-insert escalation is OPEN — apply 023 immediately.)
--
-- 3) GATING RE-VERIFY that 020 is live (self-consent moat):
--      select grantee, privilege_type, column_name
--      from information_schema.role_column_grants
--      where table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'UPDATE';
--    EXPECT: only full_name, avatar_url, signup_attribution*. If coppa_consent_given /
--    age_bracket / birthdate appear → 020 not applied → student can self-approve
--    consent — apply 020 immediately.
--    (*signup_attribution is service-role-written; it should NOT be in this list.)
