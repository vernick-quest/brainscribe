---
name: new-migration
description: Scaffold a new numbered Supabase migration for a schema change and flag the manual apply step. Use when adding or altering DB tables, columns, RLS policies, or functions.
---

# New Supabase migration

Migrations in this repo are **applied by hand** — there is no runner, no `supabase db push`, no CI. This skill scaffolds the file correctly and makes the manual step impossible to forget.

## Steps

1. **Pick the next number — from the LEDGER, not from `ls`.** Run:

   ```sql
   select max(version) from public.schema_migrations;
   ```

   A directory listing tells you what *your tree* has, and a focus worktree can be a
   hundred commits stale. On 2026-08-16 `focus/admin` numbered a migration 063 because
   its `ls` showed 061 as the highest — 063 was already applied and 064 authored. If
   you cannot reach the DB, take the highest `NNN_` prefix on **main** (not your
   branch) and say explicitly in your report that the number is unconfirmed.

   **The number is a guess until the conductor confirms it at merge.**

2. **Name it.** Get a short kebab-case slug for the change (ask the user if it isn't obvious from the request), e.g. `017_add_assignment_due_date.sql`.

3. **Write `supabase/migrations/NNN_<slug>.sql`.** Begin with a header comment block (what changed, why, date), then the SQL. Conventions:
   - **Record it in the ledger FIRST, before any DDL** (migration 067):

     ```sql
     insert into public.schema_migrations (version, applied_at, note)
     values ('NNN', now(), '<short description>');
     ```

     At the top, because the SQL editor runs a script in one transaction — a duplicate
     version aborts before any schema change lands rather than after. And with **no
     `on conflict` clause**: silently doing nothing on a collision is precisely the
     failure this table exists to catch. A `duplicate key` error means the number is
     taken. Renumber; never remove the guard.
   - **First line must be a concise descriptive title** in the form `-- NNN — <what changed>` (e.g. `-- 020 — Lock COPPA gate columns to service-role-only writes`). The Supabase SQL editor names the saved snippet from the query's first line, so a descriptive title makes it findable later; a bare `-- NNN_slug.sql` filename or a decorative divider leaves it effectively untitled. Put the filename/date on the *second* line (`-- File: NNN_<slug>.sql · Date: YYYY-MM-DD`).
   - Idempotent DDL where possible: `create table if not exists`, `alter table ... add column if not exists`.
   - **New tables:** `alter table <t> enable row level security;` then policies mirroring the **student-owns / watcher-reads** pattern in `001_initial_schema.sql` — the student has full access to their own rows (`auth.uid() = student_id`); parents/teachers get read-only access via a `relationships` join. 
   - Use `on delete cascade` to `profiles`/`sessions` for rows owned by a user or session.

4. **Print the manual-apply reminder — always, verbatim intent:**
   > ⚠️ This migration is NOT applied automatically. Open the Supabase SQL editor, paste `supabase/migrations/NNN_<slug>.sql`, and run it. Any code that depends on it will fail until you do.

5. **Schema drift.** Known historical drift (`is_admin()`, `invites.assignment_id`, `invites.expires_at`) was reconciled in `018_reconcile_drift.sql` — do NOT re-include those. If you discover a NEW object that exists only in the live DB, reconcile it in its own migration with the live definition verbatim (the 018 pattern).
