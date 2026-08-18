import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── Why a test reads source files (2026-08-17) ───────────────────────────────────────
// Twice inside one change the starting draft was fetched and then silently not delivered:
//
//   1. `.order('position'),,` — a double comma makes an array HOLE, so the destructured
//      name bound to `undefined` and the fetch result landed at an index nobody read. The
//      feature was DEAD in the live writing session.
//   2. `startingDraft` was used in JSX but never added to the destructuring list at all.
//
// `npm run build` passed BOTH times. `npm run test:run` passed both times (826, then 848).
// `npx eslint` passed the first, and enabling `no-sparse-arrays` does not help while lint
// has 58 pre-existing errors and gates nothing. Nothing in the definition of done can see a
// value that was never wired up: there is no type checker on these .js files and no DOM to
// render them into.
//
// So the wiring is asserted at the source level. Precedent: migrationLedger.test.js already
// reads supabase/migrations/* off disk for the same reason — some invariants only exist in
// the text. Assert on the VALUE (the identifier is bound, the producer is called, the value
// is used), never on "it compiled".
const ROOT = join(import.meta.dirname, '..')
const read = f => readFileSync(join(ROOT, f), 'utf8')

const WIRINGS = [
  {
    what: 'the transcript renders the starting draft',
    file: 'app/transcript/[id]/page.js',
    bound: /,\s*startingDraft\s*\]\s*=\s*await Promise\.all\(/,
    calls: /fetchStartingDraft\(\s*db\s*,\s*id\s*\)/,
    uses: /startingDraft=\{startingDraft\}/,
  },
  {
    what: 'the live session receives the starting draft',
    file: 'app/assignment/[id]/page.js',
    bound: /^\s*startingDraft,\s*$/m,
    calls: /fetchStartingDraft\(\s*service\s*,\s*id\s*\)/,
    uses: /initialStartingDraft=\{startingDraft\}/,
  },
  {
    what: 'TutorSession renders the card from its prop',
    file: 'components/TutorSession.js',
    bound: /initialStartingDraft = null,/,
    calls: /<StartingDraftCard/,
    uses: /startingDraft=\{initialStartingDraft\}/,
  },
]

describe('starting draft — the value reaches the screen, not just the server', () => {
  for (const w of WIRINGS) {
    it(`${w.what}: identifier bound, producer called, value used`, () => {
      const src = read(w.file)
      expect(w.bound.test(src), `${w.file}: identifier is not bound`).toBe(true)
      expect(w.calls.test(src), `${w.file}: producer is never called`).toBe(true)
      expect(w.uses.test(src), `${w.file}: value is fetched but never used`).toBe(true)
    })
  }
})

describe('no sparse-array holes in the files that had one', () => {
  // `,,` in an array literal shifts every later element by one and binds a name to
  // undefined. This is the literal SEV-1, pinned in the literal files it happened in.
  for (const f of [...new Set(WIRINGS.map(w => w.file))]) {
    it(`${f} has no \`,,\``, () => {
      expect(/,\s*,/.test(read(f)), `${f} contains a sparse-array hole`).toBe(false)
    })
  }
})
