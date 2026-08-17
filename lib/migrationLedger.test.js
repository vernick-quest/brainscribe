import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkLedgerInsert, LEDGER_COLUMNS } from './migrationLedger.js'

// Two halves, and the second is the one that matters:
//   1. unit tests on the checker, with a POSITIVE CONTROL — a checker that never fails is
//      indistinguishable from a codebase that is clean, and this repo has shipped a sweep
//      that returned confident zeros because the terms never matched anything.
//   2. a sweep over the REAL supabase/migrations directory, so a wrong shape fails here in
//      about a second instead of in the Supabase SQL editor after a merge and a deploy.

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

describe('checkLedgerInsert', () => {
  const good = `
    insert into public.schema_migrations (version, applied_at, note)
    values ('070', now(), 'lock over-claim counter');

    alter table sessions add column if not exists x integer;
  `

  it('accepts the shape every applied migration uses', () => {
    expect(checkLedgerInsert(good, '070')).toEqual({ ok: true, problems: [] })
  })

  // THE POSITIVE CONTROL. This is verbatim what shipped on 2026-08-17 and failed in the
  // SQL editor with `42703: column "name" ... does not exist`. If this ever passes, the
  // checker has stopped checking.
  it('REJECTS the real 2026-08-17 failure — a column that does not exist', () => {
    const r = checkLedgerInsert(`
      insert into public.schema_migrations (version, name)
      values (70, 'lock_over_claim');
      alter table sessions add column y integer;
    `, '070')
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('column "name" does not exist')
  })

  // The same statement's SECOND defect, which the error message never got far enough to
  // report: version is TEXT and zero-padded, so a bare 70 would store '70'.
  it('rejects an unpadded or non-text version', () => {
    for (const v of ['70', "'70'", '070']) {
      const r = checkLedgerInsert(
        `insert into public.schema_migrations (version, note) values (${v}, 'x');`, '070')
      expect(r.ok).toBe(false)
      expect(r.problems.join(' ')).toMatch(/zero-padded TEXT literal/)
    }
  })

  it('catches a version that disagrees with its own filename', () => {
    const r = checkLedgerInsert(
      `insert into public.schema_migrations (version, note) values ('069', 'x');`, '070')
    expect(r.problems.join(' ')).toContain("filename says '070'")
  })

  it('catches a missing self-record entirely', () => {
    expect(checkLedgerInsert('alter table sessions add column z integer;', '071').ok).toBe(false)
  })

  // 067 puts the insert FIRST on purpose: the editor runs a script in one transaction, so a
  // duplicate number must abort before any schema change lands.
  it('catches DDL placed before the ledger insert', () => {
    const r = checkLedgerInsert(`
      alter table sessions add column early integer;
      insert into public.schema_migrations (version, note) values ('071', 'x');
    `, '071')
    expect(r.problems.join(' ')).toContain('DDL appears BEFORE')
  })

  // The guard's entire value is failing loudly; `on conflict do nothing` restores exactly
  // the silence it was built to remove.
  it('catches `on conflict` on the self-record', () => {
    const r = checkLedgerInsert(`
      insert into public.schema_migrations (version, note) values ('071', 'x')
      on conflict (version) do nothing;
    `, '071')
    expect(r.problems.join(' ')).toContain('must fail LOUDLY')
  })

  // 067's own backfill uses `insert ... select` with on-conflict, legitimately.
  it('allows the 067 backfill select form', () => {
    const r = checkLedgerInsert(`
      insert into public.schema_migrations (version, note)
      select lpad(g::text, 3, '0'), 'backfilled'
      from generate_series(1, 66) g
      on conflict (version) do nothing;
    `, '067')
    expect(r.ok).toBe(true)
  })
})

describe('every migration on disk records itself correctly', () => {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d{3}_.*\.sql$/.test(f))
    .sort()

  // Positive control for the SWEEP itself: a glob that matches nothing would make every
  // assertion below vacuously true. 2026-08-16 a verification command returned confident
  // zeros for exactly this reason.
  it('found migration files to check', () => {
    expect(files.length).toBeGreaterThan(60)
  })

  // The ledger only exists from 068 on. 001-066 were backfilled and cannot record
  // themselves; 067 is the BOOTSTRAP and is exempt on purpose — it has to `create table`
  // before it can insert into it, and it carries `on conflict do nothing` on its own row
  // because it must be safe to re-run against a database that already has the table.
  // Both are violations of the rule for every migration that follows it, which is why the
  // exemption is named here rather than softened in the checker.
  const selfRecording = files.filter(f => Number(f.slice(0, 3)) >= 68)

  it('067 is the bootstrap: it creates the table it inserts into', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '067_schema_migrations_ledger.sql'), 'utf8')
    expect(sql).toMatch(/create table if not exists public\.schema_migrations/i)
    expect(checkLedgerInsert(sql, '067').ok).toBe(false) // exempt, and provably so
  })

  it.each(selfRecording)('%s', file => {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    const { ok, problems } = checkLedgerInsert(sql, file.slice(0, 3))
    expect(ok, `${file}: ${problems.join(' · ')}`).toBe(true)
  })

  it('has no duplicate migration numbers', () => {
    const numbers = files.map(f => f.slice(0, 3))
    const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i)
    expect(dupes, `duplicate numbers: ${dupes.join(', ')}`).toEqual([])
  })

  it('exposes the real column list, so a schema change here is a deliberate edit', () => {
    expect(LEDGER_COLUMNS).toEqual(['version', 'applied_at', 'recorded_at', 'note'])
  })
})
