-- Fix: custom / non-prose scaffolds (haiku, poem, list, speech, letter, story) and
-- the onboarding hook are all created with assignment_type = 'custom', but the
-- original CHECK constraint (migration 008) only permits
--   'narrative' | 'essay' | 'personal_statement' | 'other'
-- so every 'custom' INSERT was rejected by Postgres. The client fires the
-- scaffold-create POST fire-and-forget and never surfaces the 500, so no scaffold
-- row was ever written for these forms — their locked lines lived only in React
-- state and were LOST when the session was marked complete (empty transcript,
-- "Nothing written yet"). Prose types were spared only because they happen to be
-- in the allowed set. See focus/coaching-session bug: session b93f02f7 (haiku)
-- completed with 0 paragraphs AND 0 scaffold rows.
--
-- Widen the constraint to accept 'custom' (and keep the existing prose types +
-- 'other'). Run in the Supabase SQL Editor on project lakozspeyxsuunogfant.
-- Coordinate with the code deploy (the completion-time durable upsert also writes
-- assignment_type = 'custom').

-- Drop the auto-named inline check from migration 008 (and any re-run of this one).
alter table paragraph_scaffolds
  drop constraint if exists paragraph_scaffolds_assignment_type_check;
alter table paragraph_scaffolds
  drop constraint if exists paragraph_scaffolds_assignment_type_check2;

alter table paragraph_scaffolds
  add constraint paragraph_scaffolds_assignment_type_check
  check (assignment_type in (
    'narrative', 'essay', 'personal_statement', 'custom', 'other'
  ));
