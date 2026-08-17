// lib/migrationLedger.js — the ledger's insert contract, as code instead of a comment.
//
// Every migration's FIRST statement records itself in public.schema_migrations (067). The
// convention was written down in 067's header and nowhere else, so a lane authoring a
// migration had to READ a prose comment in another file to get it right — and on
// 2026-08-17 one didn't:
//
//     insert into public.schema_migrations (version, name)   -- no `name` column
//     values (70, 'lock_over_claim');                        -- version is TEXT '070'
//
//   ERROR: 42703: column "name" of relation "schema_migrations" does not exist
//
// It failed safely — the insert is the first statement, so nothing else ran — but it
// failed IN THE SQL EDITOR, after a merge, a deploy, and a security review that checked
// the number and the grants and never checked the column names. The premise ("the ledger
// takes (version, name)") was never verified against the table definition. That is the
// CLAUDE.md trap: check the premise before building on it.
//
// This module is the machine-readable form. `migrationLedger.test.js` sweeps every file in
// supabase/migrations/ through it, so the next wrong shape fails in ~1s on `test:run`
// instead of in the SQL editor.
//
// PURE: string in, findings out. No fs, no DB — the test does the reading.

/** Columns of public.schema_migrations, per 067. `version` is TEXT and zero-padded. */
export const LEDGER_COLUMNS = ['version', 'applied_at', 'recorded_at', 'note']

// The self-recording insert. Captures the column list and the values list.
const LEDGER_INSERT_RE =
  /insert\s+into\s+public\.schema_migrations\s*\(([^)]*)\)\s*(?:values\s*\(([^)]*)\)|select)/i

/**
 * Check one migration's self-recording insert against the real table.
 *
 * @param sql       the file's full text
 * @param expected  the zero-padded version the FILENAME claims, e.g. '070'
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function checkLedgerInsert(sql, expected) {
  const src = String(sql || '')
  const problems = []

  const m = LEDGER_INSERT_RE.exec(src)
  if (!m) {
    return { ok: false, problems: ['no `insert into public.schema_migrations (...)` statement'] }
  }

  const columns = m[1].split(',').map(c => c.trim().toLowerCase()).filter(Boolean)
  for (const col of columns) {
    if (!LEDGER_COLUMNS.includes(col)) {
      problems.push(`column "${col}" does not exist — the ledger has ${LEDGER_COLUMNS.join(', ')}`)
    }
  }
  if (!columns.includes('version')) problems.push('does not record `version`')

  // A `select` form is the 067 backfill; only the literal `values` form carries a version
  // we can compare against the filename.
  const values = m[2]
  if (values != null) {
    const first = values.split(',')[0].trim()
    // version is TEXT: '070'. Bare 70 is the mistake that raised 42703's sibling — it
    // would insert '70', sorting wrong and never matching the filename.
    if (!/^'[0-9]{3}'$/.test(first)) {
      problems.push(`version ${first} must be a zero-padded TEXT literal like '${expected}'`)
    } else if (first.slice(1, -1) !== expected) {
      problems.push(`records version ${first} but the filename says '${expected}'`)
    }
  }

  // The insert must come before any DDL, so a duplicate number aborts the script before a
  // schema change lands. Measured by position, not by trusting the author.
  const ddl = /^\s*(create|alter|drop|revoke|grant|comment)\s/im.exec(src)
  if (ddl && ddl.index < m.index) {
    problems.push('DDL appears BEFORE the ledger insert — a duplicate number would abort mid-migration')
  }

  // `on conflict do nothing` on a self-record is the silent no-op 067 exists to prevent.
  const tail = src.slice(m.index, m.index + 400)
  if (/on\s+conflict/i.test(tail) && values != null) {
    problems.push('`on conflict` on the self-record — a duplicate number must fail LOUDLY')
  }

  return { ok: problems.length === 0, problems }
}
