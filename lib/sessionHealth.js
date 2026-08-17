// Session health — did the student's WORK survive?
//
// The nightly guardrail audit reads transcripts and judges COACHING QUALITY. Sierra's
// failure was mechanical: locks that never landed, paragraphs that don't exist, a reply
// cut mid-word. An audit that reads what the coach SAID cannot see whether the student's
// writing SURVIVED, so it said nothing and a human found the loss by reading the session.
//
// Every signal here is DETERMINISTIC — a query over rows we already store, no model call.
// That matters twice over: it costs nothing to run on every session every night, and it
// can be re-derived, so a finding CLEARS when the underlying condition is fixed instead
// of sitting there resolved-but-stale.

// The scaffold-write hole closed 2026-07-21; every session before it can legitimately
// have no scaffold at all. 12 historical sessions sit in that state, and letting them
// flood the tab on the first run is how an admin learns to ignore it. They are still
// recorded, but marked pre-existing so they can be filed once and stay filed.
export const SCAFFOLD_ERA_START = '2026-07-21T00:00:00Z'

// Above this, the student poured a whole essay's worth of words into what the scaffold
// thinks is one section — the "wrong container" shape, where writing is accumulating
// somewhere it will not be assembled from.
export const CHARS_PER_SECTION_LIMIT = 2500

// A couple of turns is someone looking around. Past this with no scaffold row at all,
// the session is producing writing that nothing structured is capturing.
export const TURNS_BEFORE_SCAFFOLD_LIMIT = 8

export const HEALTH_SIGNALS = {
  no_draft_despite_locks: {
    label: 'Locked work never became a draft',
    severity: 'critical',
    blurb: "EVERY scaffold item is confirmed and the session has no paragraphs. The student finished all their pieces and none of it became a draft — this is never normal. (A partially-confirmed scaffold with no paragraphs is just a session in progress, and is not flagged.)",
  },
  truncated_turn: {
    label: 'Coach reply cut off',
    severity: 'high',
    blurb: 'A coach reply hit the token ceiling mid-generation. If a lock token was in the cut-off part, the student was told their work was saved when it was not.',
  },
  complete_without_draft: {
    label: 'Finished with nothing saved',
    severity: 'critical',
    blurb: 'The session is marked complete but has no paragraphs at all. Whatever the student wrote is not in the draft.',
  },
  overstuffed_section: {
    label: 'Writing piling up in one section',
    severity: 'medium',
    blurb: 'The student has written far more per scaffold section than a section holds — their words may be accumulating somewhere the draft will not assemble from.',
  },
  late_scaffold: {
    label: 'Wrote for a while with no structure',
    severity: 'medium',
    blurb: 'The student took many turns before any scaffold existed, so early work had nothing structured to land in.',
  },
}

export const HEALTH_SEVERITY_RANK = { critical: 0, high: 1, medium: 2 }

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)

// Confirmed scaffold items across every section.
export function countConfirmedItems(components) {
  return allItems(components).filter(i => i?.status === 'confirmed').length
}

export function allItems(components) {
  if (!Array.isArray(components)) return []
  return components.flatMap(sec => (Array.isArray(sec?.items) ? sec.items : []))
}

// Has the student finished every piece the scaffold asked for?
//
// This is the difference between a loss and a session in progress, and it was measured,
// not assumed: 12 of 15 active sessions have zero paragraphs, because paragraphs are
// written at assembly. Baron's live session had 3 confirmed + 1 still `working` and no
// paragraphs — perfectly healthy, mid-flight. Sierra's had ALL FOUR confirmed and no
// paragraphs, which is the shape that means her finished writing never became a draft.
// Requiring EVERY item to be confirmed is what separates the two.
export function allItemsConfirmed(components) {
  const items = allItems(components)
  return items.length > 0 && items.every(i => i?.status === 'confirmed')
}

export function countSections(components) {
  return Array.isArray(components) ? components.length : 0
}

// Evaluate one session. Input is plain data so this stays unit-testable:
//   session      { id, status, is_onboarding, created_at, truncated_turns,
//                  truncated_turns_no_lock }
//   components   paragraph_scaffolds.components (or null when no scaffold row)
//   paragraphCount, studentTurns, studentChars, turnsBeforeScaffold
// Returns an array of findings, worst first. Empty array = healthy.
export function evaluateSessionHealth({
  session = {},
  components = null,
  paragraphCount = 0,
  studentTurns = 0,
  studentChars = 0,
  turnsBeforeScaffold = null,
} = {}) {
  const out = []
  // The warm-up is a scripted hook with no scaffold and no draft by design — every
  // signal below would fire on it and every one would be wrong.
  if (session.is_onboarding === true) return out

  const confirmed = countConfirmedItems(components)
  const sections = countSections(components)
  const hasScaffold = components !== null && components !== undefined
  const preEra = session.created_at ? new Date(session.created_at) < new Date(SCAFFOLD_ERA_START) : false

  const add = (type, detail, extra = {}) => out.push({
    type,
    severity: HEALTH_SIGNALS[type].severity,
    label: HEALTH_SIGNALS[type].label,
    detail,
    preExisting: preEra,
    ...extra,
  })

  // 1. THE LOUDEST ONE. EVERY scaffold item confirmed and still zero paragraphs: the
  //    student finished all their pieces and none of it became a draft. Sierra's exact
  //    shape, and it would have caught her on day one.
  //
  //    The "every" matters. "Any confirmed item + no paragraphs" also matches an ordinary
  //    in-progress session — measured against live data, 12 of 15 active sessions have no
  //    paragraphs yet — and would have flagged two healthy sessions alongside the real one.
  if (allItemsConfirmed(components) && paragraphCount === 0) {
    add('no_draft_despite_locks',
      `all ${confirmed} scaffold item${confirmed === 1 ? '' : 's'} confirmed but 0 paragraphs`)
  }

  // 2. Complete with nothing saved (the known lost-haiku class). Reported separately
  //    from #1 because a complete session with no locks EITHER is its own failure.
  if (session.status === 'complete' && paragraphCount === 0 && confirmed === 0) {
    add('complete_without_draft', 'marked complete with 0 paragraphs and no confirmed items')
  }

  // 3. Truncation. `truncated_turns_no_lock` is the discriminator — a cut-off reply that
  //    was ALSO missing its lock token is the one that silently loses work. Pre-fix rows
  //    have a MEANINGLESS no_lock value, so treat null/undefined as UNKNOWN, never as 0:
  //    claiming "no locks were dropped" from a field that never counted them is exactly
  //    the reassuring-direction error.
  const trunc = num(session.truncated_turns)
  if (trunc > 0) {
    const noLock = session.truncated_turns_no_lock
    const noLockKnown = noLock !== null && noLock !== undefined
    add('truncated_turn',
      `${trunc} truncated coach turn${trunc === 1 ? '' : 's'}` +
      (noLockKnown
        ? (num(noLock) > 0 ? ` · ${num(noLock)} with NO lock token — work may have been dropped` : ' · 0 recorded without a lock token')
        : ' · lock status UNKNOWN (recorded before the counter fix)'),
      { noLockKnown, noLockCount: noLockKnown ? num(noLock) : null })
  }

  // 4. Wrong-container shape: far more student writing per section than a section holds.
  if (sections > 0 && studentChars / sections > CHARS_PER_SECTION_LIMIT) {
    add('overstuffed_section',
      `${Math.round(studentChars / sections)} student chars per scaffold section ` +
      `(${studentChars} across ${sections})`)
  }

  // 5. Long stretch of writing before any structure existed.
  if (!hasScaffold && studentTurns > TURNS_BEFORE_SCAFFOLD_LIMIT) {
    add('late_scaffold', `${studentTurns} student turns and no scaffold row exists`)
  } else if (Number.isFinite(turnsBeforeScaffold) && turnsBeforeScaffold > TURNS_BEFORE_SCAFFOLD_LIMIT) {
    add('late_scaffold', `${turnsBeforeScaffold} student turns before a scaffold appeared`)
  }

  out.sort((a, b) => HEALTH_SEVERITY_RANK[a.severity] - HEALTH_SEVERITY_RANK[b.severity])
  return out
}

// Worst severity across a set of findings, or null when healthy.
export function worstSeverity(findings) {
  const list = Array.isArray(findings) ? findings : []
  if (!list.length) return null
  return list.reduce((w, f) =>
    HEALTH_SEVERITY_RANK[f.severity] < HEALTH_SEVERITY_RANK[w] ? f.severity : w, list[0].severity)
}
