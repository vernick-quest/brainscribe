-- 025_writing_gym.sql
-- Writing Gym — Phase 1 (core loop) schema.
-- Source: docs/specs/brainscribe-gym-build-plan.md §1.3. Two P1 deltas vs that draft
-- are called out inline (search "P1 DELTA").
--
-- ROUTING: authored in the focus/gym worktree, HANDED TO THE CONDUCTOR to apply by
-- hand in Supabase project lakozspeyxsuunogfant. Code that reads these tables is DEAD
-- until this paste is confirmed — sequence like 024: APPLY FIRST, THEN DEPLOY. In
-- particular app/dashboard and app/assignment/[id] start referencing
-- sessions.gym_session_id, so deploying before this runs would break those pages.
--
-- P2/P3 columns (placement, suggestion engine, timed mode, graduation, Locked-In
-- channels) are included now so later passes bolt on without another migration.

-- ============ gym_sessions ============
-- One row per gym practice session. P1 DELTA: `session_id` links to the reused
-- coaching `sessions` row (the gym session runs through the existing TutorSession +
-- /api/scribe + /api/assemble plumbing; the sessions row holds messages/paragraphs/
-- scaffold, this row holds the gym-domain metadata + progression signals).
create table gym_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  session_id uuid references sessions(id) on delete set null,   -- P1 DELTA: link to the writing session
  skill_key text not null,
  tier integer not null check (tier in (1, 2, 3)),
  coach_persona text not null,
  session_type text not null default 'standard'
    check (session_type in ('standard','warmup','express','revisit','open_mat','graduation')),
  status text not null default 'active'
    check (status in ('active','complete','abandoned')),
  practice_draft text,                    -- in-progress text; abandon keeps it ("pick up where you left off")
  skill_outcome text
    check (skill_outcome in ('clicked','progressing','struggled')),  -- from [SKILL_OUTCOME:...] token (P2); null => 'progressing'
  timed boolean not null default false,
  timed_window_seconds integer,
  timed_yielded boolean not null default false,   -- internal only; never student-facing
  timed_yield_elapsed_seconds integer,            -- drives the >=50% badge rule (P3)
  duration_seconds integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index gym_sessions_student_idx on gym_sessions (student_id, created_at desc);
create index gym_sessions_skill_idx on gym_sessions (student_id, skill_key);

-- ============ gym_skill_state (Practiced / Locked-In per skill) ============
create table gym_skill_state (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  skill_key text not null,
  state text not null default 'practiced' check (state in ('practiced','locked_in')),
  practiced_at timestamptz not null default now(),
  practiced_source text not null default 'session'
    check (practiced_source in ('session','placement','profile')),  -- profile = existing-student pre-award (P2)
  locked_in_at timestamptz,
  locked_in_channel text
    check (locked_in_channel in ('coach_in_session','async_check','real_work')),
  evidence_span text,          -- quotable line behind the award ("point at the line")
  evidence_ref uuid,           -- portfolio_entries.id or sessions.id backing it
  unique (student_id, skill_key),
  check (state = 'practiced' or (locked_in_at is not null and locked_in_channel is not null))
);
create index gym_skill_state_student_idx on gym_skill_state (student_id);

-- ============ gym_progress (one row per student) ============
create table gym_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references profiles(id) on delete cascade,
  current_level text not null default 'finder'
    check (current_level in ('finder','builder','craftsman','writer')),
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_session_at timestamptz,
  streak_freezes_banked integer not null default 1
    check (streak_freezes_banked between 0 and 2),  -- auto-applied, accrue 1/month, bank cap 2
  freeze_accrued_month text,                        -- 'YYYY-MM' of last accrual
  suggested_next_skill text,                        -- cheap read; full object below (P2)
  suggested_reason jsonb,       -- {skill_key, reason, reason_detail, queued[], soften, computed_at, signals_version}
  override_history jsonb not null default '[]'::jsonb,  -- consecutive-override counts per suggestion (P2)
  revisit_state jsonb not null default '{}'::jsonb,     -- per-skill cooldowns, regression watch counters (P2)
  placement jsonb,              -- {scored_at, input_mode, verdicts{5 markers}, entry_point, second_look, second_look_done} (P2)
  independence_baseline jsonb,  -- G3 baseline window (P3)
  graduated_at timestamptz,     -- (P3)
  identity_line text,           -- e.g. 'Writer — working on Evidence' (P3)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ portfolio_entries ============
create table portfolio_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  gym_session_id uuid references gym_sessions(id) on delete set null,
  skill_key text not null,
  skill_label text not null,
  tier integer not null check (tier in (1, 2, 3)),
  entry_type text not null default 'paragraph'
    check (entry_type in ('paragraph','pair','blueprint','multi_paragraph',
                          'thesis','reflection','placement_warmup','capstone_letter')),
  content jsonb not null,
  -- content shapes by entry_type:
  --   paragraph:        {"text": ...}
  --   pair:             {"before": ..., "after": ..., "note": ...}
  --   blueprint:        {"thesis": ..., "sections": [{"label": ..., "job": ...}]}
  --   multi_paragraph:  {"paragraphs": [...], "bridge": ...}
  --   thesis:           {"thesis": ..., "rationale": ...}
  --   reflection:       {"text": ..., "cited_entries": [uuid, ...]}
  --   placement_warmup: {"text": ..., "input_mode": "typed"|"voice_transcript"}
  --   capstone_letter:  {"text": ..., "persona": ...}
  self_assessment text,        -- T2: "one thing I'd do differently" / T3: craft note
  evidence_span text,          -- placement pre-award: the quoted span
  created_at timestamptz not null default now()
);
create index portfolio_entries_student_idx on portfolio_entries (student_id, created_at desc);

-- ============ gym_access_grants (teacher/counselor access) ============
create table gym_access_grants (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  watcher_id uuid not null references profiles(id) on delete cascade,
  granted_by uuid not null references profiles(id),   -- student themself or a linked parent
  created_at timestamptz not null default now(),
  unique (student_id, watcher_id)
);

-- P1 DELTA: link the writing session back to its gym session, so app/dashboard can
-- exclude gym-backing rows from "Your assignments" and app/assignment/[id] can bounce
-- them to /gym/session/[gym_session_id]. Nullable — assignment sessions leave it null.
alter table sessions add column if not exists gym_session_id uuid references gym_sessions(id) on delete set null;
create index sessions_gym_session_idx on sessions (gym_session_id);

-- ============ RLS ============
alter table gym_sessions enable row level security;
alter table gym_skill_state enable row level security;
alter table gym_progress enable row level security;
alter table portfolio_entries enable row level security;
alter table gym_access_grants enable row level security;

-- Watcher read predicate. Design intent: PARENT = automatic (via relationships),
-- TEACHER = grant-only (via gym_access_grants). Confirmed with infra that teachers
-- DO appear in `relationships` (CLAUDE.md watcher model), so the automatic-read arm
-- is ROLE-FILTERED to parents — a bare relationships membership would otherwise leak
-- gym data to a linked teacher. Teachers reach gym surfaces only through an explicit
-- gym_access_grants row (the OR-clause below).

-- gym_sessions: student owns; watchers read.
-- ACCEPTED RISK: the student "owns" policy is FOR ALL, so a student can INSERT/UPDATE
-- their own gym_sessions rows directly via PostgREST. This mints nothing — badges,
-- portfolio entries, and level are written ONLY by the service role (RLS makes those
-- tables read-only to the student), so a forged gym_sessions row confers no progress.
-- Same reasoning as the COPPA audit's deferred finding 11 (self-owned session rows).
create policy "gym_sessions: student owns" on gym_sessions
  for all using (auth.uid() = student_id) with check (auth.uid() = student_id);
create policy "gym_sessions: watcher reads" on gym_sessions
  for select using (
    exists (select 1 from relationships r join profiles p on p.id = r.watcher_id
            where r.watcher_id = auth.uid() and r.student_id = gym_sessions.student_id and p.role = 'parent')
    or exists (select 1 from gym_access_grants
            where watcher_id = auth.uid() and student_id = gym_sessions.student_id)
  );

-- gym_skill_state: READ-ONLY to the student; writes are SERVICE-ROLE ONLY
-- (badge integrity: mirrors the COPPA-gate-hardening posture — a student must not be
-- able to mint locked_in via direct PostgREST).
create policy "gym_skill_state: student reads" on gym_skill_state
  for select using (auth.uid() = student_id);
create policy "gym_skill_state: watcher reads" on gym_skill_state
  for select using (
    exists (select 1 from relationships r join profiles p on p.id = r.watcher_id
            where r.watcher_id = auth.uid() and r.student_id = gym_skill_state.student_id and p.role = 'parent')
    or exists (select 1 from gym_access_grants
            where watcher_id = auth.uid() and student_id = gym_skill_state.student_id)
  );

-- gym_progress: same posture — student/watchers read; service-role writes
create policy "gym_progress: student reads" on gym_progress
  for select using (auth.uid() = student_id);
create policy "gym_progress: watcher reads" on gym_progress
  for select using (
    exists (select 1 from relationships r join profiles p on p.id = r.watcher_id
            where r.watcher_id = auth.uid() and r.student_id = gym_progress.student_id and p.role = 'parent')
    or exists (select 1 from gym_access_grants
            where watcher_id = auth.uid() and student_id = gym_progress.student_id)
  );

-- portfolio_entries: evidence artifacts — student/watchers read; service-role writes
create policy "portfolio_entries: student reads" on portfolio_entries
  for select using (auth.uid() = student_id);
create policy "portfolio_entries: watcher reads" on portfolio_entries
  for select using (
    exists (select 1 from relationships r join profiles p on p.id = r.watcher_id
            where r.watcher_id = auth.uid() and r.student_id = portfolio_entries.student_id and p.role = 'parent')
    or exists (select 1 from gym_access_grants
            where watcher_id = auth.uid() and student_id = portfolio_entries.student_id)
  );

-- gym_access_grants: student or linked parent grants; watcher + student read
create policy "gym_access_grants: read" on gym_access_grants
  for select using (auth.uid() = student_id or auth.uid() = watcher_id or auth.uid() = granted_by);
-- A grant may be created by the student themself OR a linked PARENT — never by a
-- teacher (a teacher self-granting would defeat the grant-only model). Same role
-- filter as the watcher-read arm.
create policy "gym_access_grants: student or parent grants" on gym_access_grants
  for insert with check (
    auth.uid() = granted_by and (
      auth.uid() = student_id
      or exists (select 1 from relationships r join profiles p on p.id = r.watcher_id
                 where r.watcher_id = auth.uid() and r.student_id = gym_access_grants.student_id and p.role = 'parent')
    )
  );
create policy "gym_access_grants: granter or student revokes" on gym_access_grants
  for delete using (auth.uid() = student_id or auth.uid() = granted_by);
