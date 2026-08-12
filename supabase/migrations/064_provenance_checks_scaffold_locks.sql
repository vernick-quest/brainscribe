-- 064 — Let provenance_checks record SCAFFOLD locks, not just paragraph saves
--
-- WHY: 051 created this table so a threshold could be chosen from data instead of
-- guessed. Measured 2026-08-11, it holds ONE row — because only /api/paragraphs ever
-- wrote to it, while the scaffold lock path (the one Lever B actually gates) recorded
-- its scores only inside paragraph_scaffolds.components. That JSON is overwritten in
-- place and carries no timestamp, so it can show the CURRENT verdict per lock but
-- never a distribution over time. Phase 2 (enforcement) is gated on exactly that
-- distribution, so the gate could not be evaluated at all.
--
-- Same measurement found the sharper problem: 14 completed paragraphs carried ZERO
-- provenance records while item locks in the SAME scaffolds carried 19 — the
-- paragraph arm had never fired once. A shadow monitor that records nothing is
-- indistinguishable from a shadow monitor with nothing to report, which is why it
-- went unnoticed for weeks. The code fix makes silence reportable; this migration
-- gives the reports somewhere to land.
--
-- Scaffold locks are finer-grained than paragraph saves, so two columns:
--   kind    — 'paragraph' (a completed dictated paragraph) vs 'component' (a single
--             confirmed item: hook, thesis line, evidence, nugget). They are NOT
--             comparable: a 3-content-word hook and a 60-word paragraph have wildly
--             different novel-fraction variance, and mixing them is what makes a
--             single threshold look badly calibrated. All three would-be-blocks
--             observed so far are 2-3 content words.
--   item_id — which component within the paragraph, so a flag is traceable back to
--             the exact lock. Null for kind='paragraph'.
--
-- Nullable + backward compatible: /api/paragraphs keeps writing rows with no kind and
-- no item_id, and its existing 'create'/'edit' triggers still validate.

alter table public.provenance_checks
  add column if not exists kind    text,
  add column if not exists item_id text;

-- 'lock' = scored at scaffold lock time (the Lever B gate point), as distinct from
-- 'create'/'edit' which are paragraph-save events from /api/paragraphs.
alter table public.provenance_checks
  drop constraint if exists provenance_checks_trigger_check;
alter table public.provenance_checks
  add constraint provenance_checks_trigger_check
  check (trigger in ('create', 'edit', 'lock'));

alter table public.provenance_checks
  add constraint provenance_checks_kind_check
  check (kind is null or kind in ('paragraph', 'component'));

comment on column public.provenance_checks.kind is
  'paragraph = completed dictated paragraph; component = one confirmed scaffold item. Null = written by /api/paragraphs before 064. Do NOT pool the two when picking a threshold — short component locks have far higher novel-fraction variance.';
comment on column public.provenance_checks.item_id is
  'Scaffold component id (hook, thesis, evidence, ...) for kind=component; null for paragraph-level checks.';

-- Threshold tuning reads one kind at a time, newest first.
create index if not exists provenance_checks_kind_idx
  on public.provenance_checks (kind, passed, created_at desc);

-- RLS unchanged: deny-by-default, admin read only (051). Writes are service-role.
-- Both FKs still cascade, so the COPPA 7-day deletion takes these rows with the child.
