-- 047 — Deactivate the leaked launch code `unblock`
--
-- 045 seeded `unblock` directly in this (public) repo, so it's readable on GitHub.
-- The live code is rotated to a new value created via the admin panel (DB-only,
-- never committed). This migration deactivates `unblock` so a fresh rebuild from
-- migrations can't re-enable the leaked code. Deactivation only — no secret here.
-- (In prod, the admin panel's toggle_code already flips this live; this keeps the
-- migration history and any rebuild consistent.)
update public.access_codes set active = false where code = 'unblock';
