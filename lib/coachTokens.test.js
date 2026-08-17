import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { hasLandedLockToken, stripCoachTokens } from './coachTokens.js'

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

describe('stripCoachTokens — nothing machine-facing reaches a human record', () => {
  it('removes every control token, including the two the gym copy missed', () => {
    // [CARE] and [SOURCE] were absent from app/api/gym/tutor's own regex, so a gym turn
    // carrying them persisted them verbatim into `messages` — read later by parents,
    // teachers and the audit judge. A child-safety signal is the last thing that should
    // survive as a stray token in someone else's view of the transcript.
    const raw = 'Nice. [SCAFFOLD:essay:3][ACTIVE:hook][NUGGET:c0:words][DONE:hook:Her words.]' +
                '[THESIS:A claim.][PARA_DONE:0:Sums up.][SOURCE:NASA page][DICTATE][CARE][COMPLETE] Keep going.'
    const out = stripCoachTokens(raw)
    for (const t of ['SCAFFOLD', 'ACTIVE', 'NUGGET', 'DONE', 'THESIS', 'PARA_DONE', 'SOURCE', 'DICTATE', 'CARE', 'COMPLETE']) {
      expect(out).not.toContain(t)
    }
    expect(out).not.toContain('[')
    // Double space is the long-standing behaviour of this strip, not a defect: the tokens
    // sat between two spaced words. Asserting it pins the behaviour rather than quietly
    // inviting a "tidy-up" that would change what every existing transcript looks like.
    expect(out).toBe('Nice.  Keep going.')
  })

  it('keeps the student-facing prose around the tokens', () => {
    expect(stripCoachTokens("That's locked in. [DONE:hook:She walked the trail.] Next up: context."))
      .toBe("That's locked in.  Next up: context.")
  })

  it('leaves a turn with no tokens alone apart from trimming', () => {
    expect(stripCoachTokens('  What did that feel like?  ')).toBe('What did that feel like?')
  })

  it('strips a multi-line payload without eating the surrounding text', () => {
    expect(stripCoachTokens('Locked.\n[DONE:body:Scene one.\n\n"Run," she said.]\nNice work.'))
      .toBe('Locked.\n\nNice work.')
  })

  it('is not confused by a truncated token — it leaves the fragment visible', () => {
    // Deliberate: an unclosed token cannot be safely removed (we do not know where it
    // ends), and leaving it VISIBLE is the honest failure. Silently swallowing the rest
    // of the turn would hide a cut.
    expect(stripCoachTokens('Nice. [DONE:hook:she had been walking')).toContain('[DONE:hook:')
  })

  it('returns empty string on junk rather than throwing', () => {
    for (const junk of [null, undefined, 42, {}, []]) expect(stripCoachTokens(junk)).toBe('')
  })

  it('the global flag does not leak state between calls', () => {
    // COACH_TOKEN_RE is /g. A shared instance used with .test() would alternate; .replace()
    // resets lastIndex, so identical input must give identical output every time.
    const t = 'a [COMPLETE] b'
    expect(stripCoachTokens(t)).toBe(stripCoachTokens(t))
  })
})

describe('every coach route strips through the shared helper', () => {
  // The defect class is a per-route copy, so sweep for one reappearing.
  const routes = ['app/api/tutor/route.js', 'app/api/gym/tutor/route.js']

  for (const rel of routes) {
    const src = fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

    it(`${rel} calls stripCoachTokens`, () => {
      expect(src).toContain('stripCoachTokens(')
    })

    it(`${rel} defines no token regex of its own`, () => {
      expect(src).not.toMatch(/const\s+TOKEN_RE\s*=/)
      expect(src).not.toMatch(/\\\[DICTATE\\\]/)
    })

    it(`${rel} checks stop_reason — a cut turn is a successful API call`, () => {
      expect(src).toContain('stop_reason')
      expect(src).toContain('record_coach_turn_truncation')
    })

    it(`${rel} does not sit at the old 1000-token ceiling`, () => {
      expect(src).not.toMatch(/max_tokens:\s*1000\b/)
    })
  }
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
