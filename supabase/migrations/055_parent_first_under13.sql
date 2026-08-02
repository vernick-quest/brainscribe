-- 055 — Parent-first under-13: the contact address, with no consent token attached
--
-- Fable red-team #3, code-traced and confirmed: a determined minor with a second email
-- address could satisfy every check in the email-plus consent flow, because the child
-- created an account FIRST and then nominated someone to approve it. There was always
-- something pending that the child could cause to be approved.
--
-- Parent-first removes the approvable object. The child's signup now records only a
-- parent's address so we can CONTACT them; the parent then creates their own account and
-- invites the child. Consent becomes a by-product of a verified parent's own actions.
--
-- WHY NOT REUSE pending_coppa_signups: every row in that table carries a consent token,
-- and a token is precisely the thing that must not exist. Storing this on the child's
-- profile keeps "we may email this person" separate from "this grants access".

alter table public.profiles
  add column if not exists pending_parent_email text;

comment on column public.profiles.pending_parent_email is
  'Under-13 signup only: a parent/guardian address supplied by the child so we can invite '
  'that parent to create an account. Contact purpose ONLY — it grants nothing, and it is '
  'swept with the rest of the record by the 7-day under-13 cleanup cron if setup is never '
  'completed (COPPA requires deleting a parent contact collected from a child when the '
  'process is abandoned).';

-- Deliberately NOT granted to `authenticated`. Migration 020 revoked direct writes on the
-- gate columns for exactly this reason: a child must not be able to set, clear, or read
-- their way around any part of the consent path. Written by the service role only, from
-- /api/coppa/request-parent-setup.
revoke insert (pending_parent_email) on public.profiles from authenticated;
revoke update (pending_parent_email) on public.profiles from authenticated;

-- ⚠️ `revoke ... from public` has previously stripped service_role along with everyone
-- else (seen on an earlier migration in this project). We revoke from `authenticated`
-- specifically, and re-assert the service grant so the API can still write it.
grant insert (pending_parent_email), update (pending_parent_email)
  on public.profiles to service_role;
