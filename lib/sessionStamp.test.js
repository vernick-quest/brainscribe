import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { sessionStamp } from './sessionStamp.js'
import { COACH_RULES_VERSION } from './prompts.js'

// The stamp's whole value is that it is present on EVERY session. The failure mode is
// not a wrong value — it is a missing one on some creation path, which turns null from
// "predates the column" into "predates it, or came in through a route nobody stamped".
// That ambiguity is unrecoverable after the fact: you cannot tell the two apart later.
describe('sessionStamp', () => {
  it('carries the current rules version and both keys', () => {
    const s = sessionStamp()
    expect(s.coach_rules_version).toBe(COACH_RULES_VERSION)
    expect(Object.keys(s).sort()).toEqual(['coach_rules_version', 'deploy_sha'])
  })

  it('deploy_sha is null rather than undefined outside Vercel', () => {
    // undefined would be DROPPED from the insert payload rather than written as null,
    // so the column stays null either way — but only one of those is deliberate.
    expect(sessionStamp().deploy_sha).toBeNull()
  })

  // The real guard: find every route that inserts into `sessions` and require it to
  // stamp. Written as a filesystem sweep, not a list, because a hand-maintained list of
  // call sites is exactly what missed three of them the first time — a NEW route added
  // later would never be added to a list, but it will be caught here.
  it('every route that inserts a sessions row uses the stamp', () => {
    const root = path.join(process.cwd(), 'app', 'api')
    const offenders = []

    // Deliberately unstamped. The demo seeder fabricates transcripts that no coach ever
    // produced, so stamping them would assert "this session ran on rules cd85d2e…" about
    // turns that never happened — a fabricated value, which is precisely what the
    // nullable column exists to avoid. Null is the honest answer for a fixture.
    const EXEMPT = new Set(['app/api/admin/seed-demo/route.js'])

    const walk = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) { walk(full); continue }
        if (entry.name !== 'route.js') continue
        const rel = path.relative(process.cwd(), full)
        if (EXEMPT.has(rel)) continue
        const src = fs.readFileSync(full, 'utf8')
        // `.from('sessions')` through to `.insert(`, allowing chained calls but NOT
        // another `.from(` — otherwise a sessions UPDATE followed by a messages INSERT
        // reads as a sessions insert (it did, on the persona-switch route).
        if (!/from\('sessions'\)(?:(?!\.from\()[\s\S]){0,400}?\.insert\(/.test(src)) continue
        if (!src.includes('sessionStamp')) offenders.push(rel)
      }
    }
    walk(root)

    expect(offenders, `these create sessions rows without a provenance stamp:\n${offenders.join('\n')}`).toEqual([])
  })
})
