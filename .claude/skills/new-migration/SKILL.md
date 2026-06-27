---
name: new-migration
description: Scaffold a new numbered Supabase migration for a schema change and flag the manual apply step. Use when adding or altering DB tables, columns, RLS policies, or functions.
---

# New Supabase migration

Migrations in this repo are **applied by hand** — there is no runner, no `supabase db push`, no CI. This skill scaffolds the file correctly and makes the manual step impossible to forget.

## Steps

1. **Pick the next number.** List `supabase/migrations/`, take the highest `NNN_` prefix, increment, and zero-pad to 3 digits (e.g. if `016_*` is the highest, the new file is `017_*`).

2. **Name it.** Get a short kebab-case slug for the change (ask the user if it isn't obvious from the request), e.g. `017_add_assignment_due_date.sql`.

3. **Write `supabase/migrations/NNN_<slug>.sql`.** Begin with a header comment (what changed, why, date), then the SQL. Conventions:
   - Idempotent DDL where possible: `create table if not exists`, `alter table ... add column if not exists`.
   - **New tables:** `alter table <t> enable row level security;` then policies mirroring the **student-owns / watcher-reads** pattern in `001_initial_schema.sql` — the student has full access to their own rows (`auth.uid() = student_id`); parents/teachers get read-only access via a `relationships` join. 
   - Use `on delete cascade` to `profiles`/`sessions` for rows owned by a user or session.

4. **Print the manual-apply reminder — always, verbatim intent:**
   > ⚠️ This migration is NOT applied automatically. Open the Supabase SQL editor, paste `supabase/migrations/NNN_<slug>.sql`, and run it. Any code that depends on it will fail until you do.

5. **Schema drift.** If the change touches objects known to exist only in the live DB — `is_admin()`, `invites.assignment_id`, `invites.expires_at` — include their definitions in this migration so the files match production.
