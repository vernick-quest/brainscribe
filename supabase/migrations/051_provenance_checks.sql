-- 051 — Persist the provenance shadow signal
--
-- WHY: lib/provenance.js `checkProvenance` compares a locked paragraph against
-- everything the student actually said (raw speech + all their own messages) and
-- returns a novel-word fraction — i.e. how much of the "student's" paragraph the
-- student never uttered. That is exactly the composition-drift signal the transcript
-- audit keeps confirming by hand (Jul 5 and Jul 10 findings, both "compose-as-
-- transcription", the second POST-tripwire and on a real student).
--
-- Today it runs on every paragraph save and only console.warn()s: nothing is stored,
-- so there is no way to know how often it would fire, or at what novelFraction, and
-- therefore no way to choose a threshold. Storing it changes nothing for users — it
-- stays shadow (never blocks) — but turns an invisible signal into tunable data.
--
-- EVERY check is recorded, not just failures: tuning needs the distribution of normal
-- saves to pick a threshold that separates them from the confirmed bad ones.

create table if not exists public.provenance_checks (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions(id) on delete cascade,
  student_id     uuid references public.profiles(id) on delete cascade,
  position       integer not null,
  trigger        text not null default 'create' check (trigger in ('create','edit')),
  passed         boolean not null,
  novel_fraction numeric(5,4) not null,
  novel_words    text,          -- small sample only (first few), for eyeballing
  content_count  integer,
  created_at     timestamptz not null default now()
);

-- Both FKs cascade on purpose: the COPPA 7-day under-13 deletion removes the
-- student/sessions, and this derived signal must go with them. It holds a fragment of
-- a child's writing, so it must never outlive the work it came from.

create index if not exists provenance_checks_session_idx on public.provenance_checks (session_id);
-- Tuning reads the failures newest-first.
create index if not exists provenance_checks_triage_idx on public.provenance_checks (passed, created_at desc);

alter table public.provenance_checks enable row level security;

-- Deny-by-default for clients: writes come from the service role in
-- /api/paragraphs, and this is an internal QA signal, not something a student or a
-- watcher should read. Admins can read it for threshold tuning.
create policy "provenance_checks: admin read"
  on public.provenance_checks for select using (is_admin());
