-- 073 — writing_mode: is this school work, or writing nobody assigned?
--
-- ⚠️ NUMBER: derived from the LEDGER, not `ls` — `select max(version) from
-- public.schema_migrations` returned 072 (coach speaking pace) on 2026-08-17 SF, with 071
-- (session_starting_drafts) confirmed live. Re-derive at paste time; the insert below has
-- no `on conflict`, so a taken number fails loudly before any DDL runs.
--
-- WHY: the product calls everything an "assignment", which is accurate for school and wrong
-- for a story nobody assigned. Robert, 2026-08-17: the time to work out which one this is
-- "is when assessing the scaffolding. If there is no specific requirements, no word count,
-- no set number of paragraphs, no brief… it can be inferred." Asking gets a claim — a
-- student rushing intake taps anything. Observing gets evidence.
--
-- 🔴 WHY IT IS STORED AND NOT COMPUTED ON READ:
-- Three of the four signals already sit in the DB (sessions.requirements holds
-- {targets:[…]}), so it is tempting to derive this at read time from "no targets". That is
-- the bug. `targets: []` means EITHER "there are genuinely no requirements" OR "the meta
-- pass never got that far" — the same shape as an empty findings table reading as "nothing
-- at risk" when the pass had never run. Absence is ambiguous, and a read-time derivation
-- resolves it in the flattering direction every time.
--
-- So it is written ONCE, at session creation, by code that knows whether the meta pass
-- actually ran (lib/writingMode.js `inferWritingMode`), and never recomputed. 'unknown' is
-- the honest default and must stay distinguishable from 'personal' forever: 'personal'
-- requires POSITIVE evidence, never merely the absence of school signals.
--
-- 🔴 NO NEW STREAM TOKEN. `[MODE:personal]` is tempting and refused — the inline control
-- protocol is the most dangerous surface in the repo. The value is read server-side and
-- placed in the prompt; the coach reads the answer, it never reports it.
--
-- Sticky by design: a session that started as school work stays school work. Nothing here
-- recomputes on read, so a later requirement change cannot retroactively rewrite what this
-- session was.

insert into public.schema_migrations (version, applied_at, note)
values ('073', now(), 'sessions.writing_mode — school | personal | unknown');

alter table public.sessions
  add column if not exists writing_mode text not null default 'unknown'
    check (writing_mode in ('school', 'personal', 'unknown'));

comment on column public.sessions.writing_mode is
  'School work vs writing nobody assigned. Inferred ONCE at session creation from positive evidence and never recomputed on read — absent requirement targets are ambiguous (no requirements vs. the meta pass never ran), so absence alone never yields ''personal''. ''unknown'' is the honest default.';

-- Existing rows keep 'unknown'. Deliberately NOT backfilled: every backfill rule available
-- today would have to read absent targets as 'personal', which is precisely the inference
-- this column exists to avoid making.

-- Triage: "how much of what people write here was never assigned by anyone?"
create index if not exists sessions_writing_mode_idx
  on public.sessions (writing_mode)
  where writing_mode <> 'unknown';
