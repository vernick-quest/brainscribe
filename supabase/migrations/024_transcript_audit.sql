-- 024_transcript_audit.sql
-- Transcript Guardrail Audit (coach-only v1): audit runs + per-session findings.
-- APPLY BEFORE deploying the code that writes to these tables (audit-batch route
-- + cron are dead until this runs). Applied by hand in project lakozspeyxsuunogfant.

create table transcript_audit_runs (
  id             uuid primary key default gen_random_uuid(),
  triggered_by   text not null check (triggered_by in ('admin','cron')),
  triggered_by_user uuid references profiles(id) on delete set null,
  requested_count int  not null default 0,
  audited_count  int  not null default 0,
  findings_count int  not null default 0,   -- rows with severity <> 'none'
  status         text not null default 'running' check (status in ('running','complete','error')),
  error          text,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

-- One row per audited session, clean or not (clean = severity 'none', empty
-- breach_types). Doubles as the "already audited" ledger — the sampler picks
-- sessions where NOT EXISTS a findings row.
create table transcript_audit_findings (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references transcript_audit_runs(id) on delete cascade,
  session_id   uuid not null references sessions(id)  on delete cascade,
  student_id   uuid references profiles(id) on delete cascade,  -- denormalized for filter/remote-in
  persona      text,                                            -- coach on the session
  severity     text not null default 'none'
                 check (severity in ('none','low','medium','high')),
  breach_types jsonb not null default '[]'::jsonb,              -- array of taxonomy keys
  auditor_analysis jsonb,                                       -- full structured output
  resolved     boolean not null default false,
  resolved_by  uuid references profiles(id) on delete set null,
  resolved_at  timestamptz,
  admin_notes  text,
  created_at   timestamptz not null default now()
);

-- One audit per session (also the NOT-EXISTS sampling key). Re-audit is a v1.1
-- concern; drop this constraint then.
create unique index transcript_audit_findings_session_id_key
  on transcript_audit_findings (session_id);

-- Admin UI: unresolved, severity-ranked.
create index transcript_audit_findings_triage_idx
  on transcript_audit_findings (resolved, severity);
create index transcript_audit_findings_run_id_idx
  on transcript_audit_findings (run_id);

-- RLS: admins can see + resolve; service-role writes bypass RLS.
alter table transcript_audit_runs     enable row level security;
alter table transcript_audit_findings enable row level security;

create policy "admin reads audit runs"       on transcript_audit_runs
  for select using (is_admin());
create policy "admin reads audit findings"   on transcript_audit_findings
  for select using (is_admin());
create policy "admin updates audit findings" on transcript_audit_findings
  for update using (is_admin()) with check (is_admin());

-- Sampler: N complete, non-onboarding sessions never yet audited, in random
-- order. Realizes "NOT EXISTS + order by random()" in one indexed query. Called
-- only from the service-role audit-batch route.
create or replace function sample_unaudited_sessions(sample_size int)
returns setof sessions
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from sessions s
  where s.status = 'complete'
    and s.is_onboarding = false
    and not exists (
      select 1 from transcript_audit_findings f where f.session_id = s.id
    )
  order by random()
  limit greatest(sample_size, 0)
$$;

-- SECURITY DEFINER runs as the function owner and Postgres default-grants EXECUTE
-- to PUBLIC — so lock it down: without this, any authenticated student could
-- rpc() it and read other students' sessions. Service-role calls are unaffected.
revoke execute on function sample_unaudited_sessions(int) from public, anon, authenticated;
