-- 022 — invites.student_id (co-parent invite target)
-- File: 022_invite_student_id.sql · Date: 2026-06-28
--
-- Adds a nullable invites.student_id so a co-parent invite can name the specific
-- under-13 child it grants read-only oversight of. Requested by the focus/parents
-- session (commit 4dde5d6): a child's consenting guardian invites a second parent
-- for that child — read-only watcher link, NEVER a consent grant.
--
-- Until now `invites` only recorded who *sent* the invite (invited_by). For a
-- guardian-authorized co-parent invite, invited_by stays the authorizing guardian
-- (audit trail), so the claim flow needs a separate field to know which child the
-- new watcher relationship should point at. student_id carries that.
--
-- Nullable on purpose: legacy student-sent and teacher invites leave it NULL and
-- the claim flow falls back to invited_by. ON DELETE CASCADE so an invite to
-- oversee a child disappears if that child's profile is deleted (e.g. the COPPA
-- 7-day auto-deletion), mirroring invites.assignment_id's cascade.
--
-- Idempotent (add-column-if-not-exists). No RLS/grant change needed: the co-parent
-- invite insert runs via the service-role client after a server-side guardian +
-- under-13 + 2-parent-cap check (invites has no column-level grants à la 020).
--
-- ⚠️ APPLY BY HAND: paste into the Supabase SQL Editor for project
--    lakozspeyxsuunogfant (NOT qqxgfgbuvggzhpmbtmvg — check the project switcher).
--    The co-parent invite insert in app/api/invites/route.js is DEAD until this runs.

alter table invites
  add column if not exists student_id uuid references profiles(id) on delete cascade;
