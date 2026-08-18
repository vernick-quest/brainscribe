-- 072 — Coach speaking pace
--
-- ⚠️ RENUMBER AT MERGE. Head was 070 when this was authored, and TWO unmerged specs name
-- 071 (SPEC-starting-draft.md's session_starting_drafts, and this). Re-derive with
--     select max(version) from public.schema_migrations;
-- and renumber before pasting — on 2026-08-17 a migration authored as 069 had to become
-- 070 for exactly this reason, and `ls` on a worktree is how 063 got claimed twice.
--
-- Records itself FIRST, with no `on conflict`, so a duplicate number fails loudly.
insert into public.schema_migrations (version, applied_at, note)
values ('072', now(), 'coach speaking pace');

-- How fast the coach's read-aloud plays, per STUDENT (not per coach — pace is about the
-- listener, and resetting it when they switch coaches would silently undo an accessibility
-- setting mid-assignment).
--
-- The rate is applied client-side with HTMLMediaElement.playbackRate; nothing here reaches
-- ElevenLabs. See lib/coachPace.js for why.
alter table public.profiles
  add column if not exists coach_pace numeric not null default 1.0;

-- The range lib/coachPace.js clamps to. Named so the two cannot drift.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_coach_pace_range'
  ) then
    alter table public.profiles
      add constraint profiles_coach_pace_range check (coach_pace >= 0.5 and coach_pace <= 2.0);
  end if;
end $$;

-- Per-column UPDATE grant, mirroring migration 030's coach_read_aloud. The write goes
-- through /api/profile/voice as the AUTHENTICATED user (not service role) with
-- .eq('id', user.id), so RLS policy "profiles: own" plus this grant confine it to the
-- caller's own row. Without the column grant the update silently matches zero rows and
-- PostgREST reports success — the failure mode CLAUDE.md warns about.
grant update (coach_pace) on public.profiles to authenticated;
