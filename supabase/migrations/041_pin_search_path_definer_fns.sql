-- 041 — pin search_path on the two unpinned SECURITY DEFINER functions
-- File: 041_pin_search_path_definer_fns.sql · Date: 2026-07-15
--
-- ⚠️ Apply BY HAND in the Supabase SQL Editor for project lakozspeyxsuunogfant.
--
-- SECURITY DEFINER audit (2026-07-15) over all migrations: every definer
-- function pins `set search_path = public` EXCEPT these two —
--   • handle_new_user()  (001; auth-signup trigger: creates the profile row +
--     auto-claims a matching invite)
--   • is_admin()         (018; RLS helper — 018's own comment deferred this
--     exact hardening as a follow-up)
-- Unpinned search_path on a definer function is the classic escalation vector
-- (an attacker who can create a same-named object earlier in the path runs it
-- with the function owner's privileges). Low practical risk on this project
-- (authenticated can't CREATE in public), but pinning is free.
--
-- ALTER FUNCTION ... SET pins the path WITHOUT recreating the bodies — a pure
-- config change, no transcription risk, behavior otherwise identical.
-- (12/13/14/24/28 are already pinned; usage/rate-limit RPC EXECUTE grants were
-- already revoked in 029/034.) Idempotent.

alter function public.handle_new_user() set search_path = public;
alter function public.is_admin() set search_path = public;
