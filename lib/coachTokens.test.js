import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { hasLandedLockToken } from './coachTokens.js'

// Two halves to this file, and both are load-bearing:
//   1. The BEHAVIOUR — a token that opens and never closes is a dropped lock, not a lock.
//   2. The PARITY — the client's real regex, read off disk, agrees. The bug was two
//      hand-copied regexes drifting by one character, so asserting the behaviour alone
//      would leave the actual failure mode uncovered.

// What a truncated turn really looks like: max_tokens cuts mid-payload, so the token has
// its name and colon and then just stops. This is the shape that read as "lock present".
const CUT_MID_PAYLOAD = 'Nice work. [DONE:hook:Sierra had been walking the same trail every'
const CUT_AT_COLON    = 'Got it. [DONE:'
const CUT_AT_NAME     = 'Locking that in now. [PARA_DON'
const CUT_BARE        = 'That does it — [COMPLET'

describe('hasLandedLockToken — a lock counts only once it CLOSES', () => {
  it('does NOT count a payload cut off mid-word (the shipped bug)', () => {
    expect(hasLandedLockToken(CUT_MID_PAYLOAD)).toBe(false)
  })

  it('does NOT count a token cut at the colon, the name, or a bare token', () => {
    expect(hasLandedLockToken(CUT_AT_COLON)).toBe(false)
    expect(hasLandedLockToken(CUT_AT_NAME)).toBe(false)
    expect(hasLandedLockToken(CUT_BARE)).toBe(false)
  })

  it('counts every closed lock form the client parses', () => {
    expect(hasLandedLockToken('[DONE:hook:She had walked it every morning.]')).toBe(true)
    expect(hasLandedLockToken('[THESIS:Recess should be longer.]')).toBe(true)
    expect(hasLandedLockToken('[PARA_DONE:0:Introduces the trail.]')).toBe(true)
    expect(hasLandedLockToken('[COMPLETE]')).toBe(true)
    expect(hasLandedLockToken('[CARE]')).toBe(true)
  })

  it('counts an empty payload — the client parses it, so it landed', () => {
    // Whether an empty [DONE:] is GOOD is resolveDoneText's problem. Here the only
    // question is whether a lock reached the client, and this one did.
    expect(hasLandedLockToken('[DONE:hook:]')).toBe(true)
  })

  it('counts a multi-line payload — narrative locks carry real newlines (Rule 5b)', () => {
    expect(hasLandedLockToken('[DONE:body:First scene.\n\n"Run," she said.\n\nThen home.]')).toBe(true)
  })

  it('counts the closed lock in a turn that ALSO got cut afterwards', () => {
    // A turn can land its lock and then be cut mid-prose. That is cut prose, not a
    // dropped lock — the discriminator has to tell those apart.
    expect(hasLandedLockToken('[DONE:hook:She walked the trail.] Now for the next bit, which is where')).toBe(true)
  })

  it('does NOT count the non-lock tokens', () => {
    // Structure/focus/capture signals. Dropping one loses no confirmed words, and
    // counting them would re-open the same blindness through a different door.
    for (const t of ['[SCAFFOLD:narrative:5]', '[ACTIVE:hook]', '[NUGGET:c0:some words]', '[SOURCE:NASA page]']) {
      expect(hasLandedLockToken(t)).toBe(false)
    }
  })

  it('does not count prose that merely talks about locking in', () => {
    expect(hasLandedLockToken("Great — I'll mark that paragraph as done now.")).toBe(false)
  })

  it('returns false on junk instead of throwing — it runs inside a finally block', () => {
    for (const junk of [null, undefined, '', 42, {}, []]) {
      expect(hasLandedLockToken(junk)).toBe(false)
    }
  })
})

// ── Parity with the client, read off disk ───────────────────────────────────────────
// The counter is only meaningful if it answers the client's question. Assert against the
// LIVE regex rather than a copy of it, so a change in TutorSession.js fails here.
const clientSrc = fs.readFileSync(
  path.join(process.cwd(), 'components', 'TutorSession.js'), 'utf8',
)

describe('parity with components/TutorSession.js', () => {
  const m = /const tokenRE = \/(.+?)\/g/.exec(clientSrc)

  it('still finds the client tokenRE (rename this test if the parser moves)', () => {
    expect(m).not.toBeNull()
  })

  it('agrees with the client on every colon-form lock fixture', () => {
    const clientRE = new RegExp(m[1], 'g')
    const onlyLocks = t => {
      clientRE.lastIndex = 0
      let hit, found = false
      while ((hit = clientRE.exec(t)) !== null) {
        if (['DONE', 'THESIS', 'PARA_DONE'].includes(hit[1])) found = true
      }
      return found
    }
    const fixtures = [
      CUT_MID_PAYLOAD, CUT_AT_COLON, CUT_AT_NAME,
      '[DONE:hook:She had walked it every morning.]',
      '[THESIS:Recess should be longer.]',
      '[PARA_DONE:0:Introduces the trail.]',
      '[DONE:body:First scene.\n\n"Run," she said.]',
      '[DONE:hook:She walked the trail.] and then it got cut off right about',
      '[SCAFFOLD:narrative:5]',
      '[ACTIVE:hook]',
    ]
    for (const t of fixtures) {
      expect({ fixture: t.slice(0, 40), landed: hasLandedLockToken(t) })
        .toEqual({ fixture: t.slice(0, 40), landed: onlyLocks(t) })
    }
  })

  it('the bare tokens are still matched by exact literal, closing bracket included', () => {
    // [COMPLETE] and [CARE] never go through tokenRE — the client tests them with
    // includes(), which is why they too require the closing bracket.
    expect(clientSrc).toContain("includes('[COMPLETE]')")
    expect(clientSrc).toContain("includes('[CARE]')")
  })
})

describe('the truncation counter uses this helper, not its own regex', () => {
  // The defect was a SECOND regex, so the regression to guard is a second regex
  // reappearing — not a wrong value.
  const routeSrc = fs.readFileSync(
    path.join(process.cwd(), 'app', 'api', 'tutor', 'route.js'), 'utf8',
  )

  it('calls hasLandedLockToken', () => {
    expect(routeSrc).toContain('hasLandedLockToken(fullText)')
  })

  it('no longer carries the opening-bracket pattern that under-reported', () => {
    expect(routeSrc).not.toMatch(/\[\(DONE\|THESIS\|PARA_DONE\|COMPLETE\|CARE\)\[:/)
  })
})
