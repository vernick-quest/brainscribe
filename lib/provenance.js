// lib/provenance.js — Lever B: deterministic lock-time provenance check.
//
// PURE brain (no Next/Supabase imports) so the exact check we ship also runs in
// scripts/verify/provenance.mjs — same pattern as lib/gradeAgainstRubric.js.
//
// The problem it closes (Fable coach red-team, 2026-07-11): the coach's anti-
// ghostwrite guardrails police LENGTH per turn, not AUTHORSHIP. Short-form
// (haiku) lines, incremental <12-word clause-laundering, and token
// false-attribution all let coach-authored words become "the student's" locked
// text. This check asks, deterministically, at lock time: do the words being
// locked actually trace back to the STUDENT's own words?
//
// ESL-SAFE BY DESIGN: it scores CONTENT-WORD overlap (fluency-insensitive), so an
// ESL student's own imperfect re-voicing passes (their content words trace to
// their turns) while a coach's fluent substitution fails (new content words the
// student never said). No ESL flag, no disable toggle — the same check protects
// every student, and ESL students are the ones MOST exposed to fluent-rewrite
// laundering, so they must not be exempted.

// Function words are ignored for overlap scoring: the scribe legitimately fixes
// them ("kids is" -> "kids are"), and a student adds their own ("and", "the")
// when voicing a fragment whole. NOTE: the coach SUPPLYING a connective is a
// separate Rule-6 concern enforced in the prompt, not here.
const STOP = new Set(('a an the is are was were be been being am i you he she it we they ' +
  'me him her us them my your his its our their this that these those and or but so ' +
  'to of in on at for with as by from up out if then than do does did have has had ' +
  'will would can could should may might must not no yes just very really too also ' +
  'get got there here what which who whom when where why how about into over under ' +
  'after before because while during of off down again more most some any all each ' +
  'im ive youre dont cant like okay ok yeah um uh')
  .split(' '))

// Crude, ESL-friendly inflection strip so "kids"->"kid", "having"->"have",
// "worries"->"worry" all match their stem across a student's own variants.
function stem(w) {
  return w
    .replace(/ies$/, 'y')
    .replace(/(ing|ed|es|s)$/, '')
    .replace(/([a-z])\1$/, '$1') // running->run (double-consonant tidy)
}

export function contentTokens(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(w => !STOP.has(w))
    .map(stem)
    .filter(w => w.length > 1)
}

// checkProvenance(lockedText, studentSources, opts)
//   lockedText     — the text about to be locked (scribed paragraph, nugget, thesis line)
//   studentSources — array of the student's OWN words: the paragraph's raw_spoken_text,
//                    plus the student's role:'user' message turns this session.
//   opts.noveltyThreshold — max fraction of locked content-words that may be ABSENT
//                    from the student's sources before we treat the lock as coach-authored.
//                    Calibrated in scripts/verify/provenance.mjs.
//
// Returns { studentSimilarity, novelFraction, novelWords, contentCount, pass }.
export function checkProvenance(lockedText, studentSources = [], opts = {}) {
  const noveltyThreshold = opts.noveltyThreshold ?? 0.34
  const locked = contentTokens(lockedText)

  // Nothing substantive to check (pure function words / empty) — don't block.
  if (locked.length === 0) {
    return { studentSimilarity: 1, novelFraction: 0, novelWords: [], contentCount: 0, pass: true }
  }

  const studentSet = new Set(
    (Array.isArray(studentSources) ? studentSources : [studentSources]).flatMap(contentTokens)
  )

  const novelWords = locked.filter(w => !studentSet.has(w))
  const novelFraction = novelWords.length / locked.length
  const studentSimilarity = 1 - novelFraction

  return {
    studentSimilarity,
    novelFraction,
    novelWords,
    contentCount: locked.length,
    // Short locks (a haiku line, a hook) are high-variance: 1 novel word out of 3
    // is 0.33. Require an ABSOLUTE floor too so a 3-word line needs >1 novel word
    // to fail — avoids nuking a legitimate short student line on a single stem miss.
    pass: novelFraction <= noveltyThreshold || novelWords.length <= 1,
  }
}
