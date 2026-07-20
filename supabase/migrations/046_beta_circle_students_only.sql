-- 046 — Beta Circle counts STUDENTS only
--
-- 045 grandfathered every non-admin account into Beta Circle. The cohort is students
-- only (the writers) — parents/teachers get coach access but never a slot, and admin-
-- seeded demo accounts never count. Clear the flag from everyone who shouldn't hold
-- it; new grants go through lib/access.js, which is student-only + cap-checked.
-- `role is distinct from 'student'` so a NULL role (mid-onboarding account) is also
-- cleared — plain `role <> 'student'` skips NULLs, and role is an enum so coalescing
-- it to '' is invalid.
update public.profiles set is_beta_circle = false
where is_beta_circle = true
  and (
    role is distinct from 'student'
    or email in (
      'demo-student@brainscribe.io',
      'demo-parent@brainscribe.io',
      'demo-teacher@brainscribe.io'
    )
  );
