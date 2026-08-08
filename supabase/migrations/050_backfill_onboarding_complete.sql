-- 050 — Backfill onboarding_complete for people who actually finished onboarding
--
-- The flag used to be written only when the user LANDED on the finale page
-- (/onboarding/complete, or the transcript with ?onboarding=1). Anyone who closed the
-- tab when the coach said "done", or navigated straight to their folder, finished the
-- onboarding session but kept onboarding_complete = false.
--
-- Impact when this was found (2026-07-25): 3 of the first 9 people to complete an
-- onboarding session were still flagged incomplete — and because /parent and /teacher
-- redirect on !onboarding_complete, two real PARENTS were bounced back into onboarding
-- on every visit, a loop they could not escape.
--
-- The route now sets the flag at the real completion event (POST
-- /api/sessions/[id]/complete), so this backfill is a one-time correction for rows
-- created before that fix. Idempotent: only touches rows still marked false.
--
-- completed_at of their onboarding session is used as the timestamp so the record
-- reflects when they actually finished, not when this migration ran.
update public.profiles p
   set onboarding_complete = true,
       onboarding_completed_at = coalesce(p.onboarding_completed_at, s.completed_at, now())
  from (
    select student_id, max(completed_at) as completed_at
      from public.sessions
     where is_onboarding = true and status = 'complete'
     group by student_id
  ) s
 where s.student_id = p.id
   and p.onboarding_complete = false;
