// lib/gymSuggest.js — Writing Gym suggestion engine (P2). DETERMINISTIC, zero model
// calls. Implements suggestion-engine.md §§2–6 (the pseudocode is the spec). Maps the
// student's OWN analyzeWriting growth-area phrasing → skill_keys via SKILL_SIGNALS,
// then resolves a single suggested card with a reason code + the matched phrase.
//
// Precedence (§3.5): revisit_regression > profile_gap (unlocked, stable) >
// revisit_plateau > prereq_for_gap > curriculum sequential. cold_start and the stale
// branches preempt. A gap NEVER unlocks a prereq-locked skill — it queues.
//
// The [SKILL_OUTCOME] gym-side signal (clicked/struggled) is coach-ai lane and NOT
// built this pass: gym_sessions.skill_outcome stays null ⇒ treated as 'progressing'
// (neutral), so those branches are coded but dormant until the token ships.

import {
  GYM_SKILLS, SKILL_SIGNALS, SKILL_SIGNALS_VERSION, K,
  getSkill, getUnlockedSkills, getNextSequentialSkill, feedsInto, isUnlocked,
} from '@/lib/gymCurriculum'
import { createServiceClient } from '@/lib/supabase/service'

const lc = s => String(s ?? '').toLowerCase()
const WEEK = Object.fromEntries(GYM_SKILLS.map(s => [s.key, s.week]))

// Which skills does a list of free-text phrases map to? Returns Map<skill, {phrase}>
// (first matching phrase kept) plus the set of phrases that matched nothing (telemetry).
function matchPhrases(phrases) {
  const hits = new Map()
  const unmapped = []
  for (const phrase of (phrases ?? [])) {
    const p = lc(phrase)
    let matchedAny = false
    for (const skill of Object.keys(SKILL_SIGNALS)) {
      const signals = SKILL_SIGNALS[skill]
      if (signals.length && signals.some(sig => p.includes(sig))) {
        matchedAny = true
        if (!hits.has(skill)) hits.set(skill, { phrase })
      }
    }
    if (!matchedAny && p.trim()) unmapped.push(phrase)
  }
  return { hits, unmapped }
}

// mapGaps — candidate gaps from the CURRENT aggregate. growth_areas weight 2,
// patterns weight 1. matchedPhrase prefers a growth_areas phrase.
function mapGaps(aggregate) {
  const g = matchPhrases(aggregate?.growth_areas)
  const pat = matchPhrases(aggregate?.patterns)
  const skills = new Set([...g.hits.keys(), ...pat.hits.keys()])
  const candidates = []
  for (const skill of skills) {
    const matchWeight = (g.hits.has(skill) ? 2 : 0) + (pat.hits.has(skill) ? 1 : 0)
    const matchedPhrase = g.hits.get(skill)?.phrase ?? pat.hits.get(skill)?.phrase ?? null
    candidates.push({ skill, matchWeight, matchedPhrase, streak: 0 })
  }
  return { candidates, unmapped: g.unmapped } // patterns-only unmapped not alarmed (habits)
}

// streak(skill) — consecutive most-recent session profiles whose growth_areas map to
// the skill (patterns don't count toward streaks).
function growthStreak(skill, sessionProfiles) {
  const signals = SKILL_SIGNALS[skill] ?? []
  let n = 0
  for (const sp of sessionProfiles) {
    const areas = (sp?.growth_areas ?? []).map(lc)
    if (areas.some(a => signals.some(sig => a.includes(sig)))) n++
    else break
  }
  return n
}

function mapsToSkill(skill, phrases) {
  const signals = SKILL_SIGNALS[skill] ?? []
  return (phrases ?? []).map(lc).some(p => signals.some(sig => p.includes(sig)))
}

// wasPriorStrength — skill appeared in strengths[] of ≥1 (earlier) session profile.
function wasPriorStrength(skill, sessionProfiles) {
  return sessionProfiles.some(sp => mapsToSkill(skill, sp?.strengths))
}

// postBadgeStreak — consecutive recent session profiles (completed AFTER the badge)
// whose growth_areas map to the skill. Badge date = earliest completed gym session for
// the skill. A 'struggled' gym outcome on the skill adds +1 (dormant: outcome is null).
function postBadgeStreak(skill, sessionProfiles, gymSessions) {
  const badgeDates = gymSessions
    .filter(s => s.skill_key === skill && s.completed_at)
    .map(s => new Date(s.completed_at).getTime())
  if (!badgeDates.length) return 0
  const badgeDate = Math.min(...badgeDates)
  const after = sessionProfiles.filter(sp => sp.completed_at && new Date(sp.completed_at).getTime() > badgeDate)
  let n = growthStreak(skill, after)
  const struggled = gymSessions.some(s => s.skill_key === skill && s.skill_outcome === 'struggled')
  if (struggled) n += 1
  return n
}

function daysBetween(a, b) { return (a.getTime() - new Date(b).getTime()) / 86400000 }

function suggest(skillKey, reason, reason_detail = null, extra = {}) {
  return {
    skill_key: skillKey,
    reason,
    reason_detail,
    queued: extra.queued ?? [],
    soften: extra.soften ?? false,
    stale: extra.stale ?? false,
    computed_at: extra.now ? extra.now.toISOString() : null,
    signals_version: SKILL_SIGNALS_VERSION,
  }
}

/**
 * The engine. All inputs are plain values (no DB), so it's fully testable.
 *   practicedKeys          Set/array of skills at practiced+
 *   completedSessionCount  # completed gym sessions (portfolio_review volume gate)
 *   aggregate              profiles.writing_profile_aggregate (may be null)
 *   sessionProfiles        [{ growth_areas, strengths, patterns, completed_at }], newest first
 *   gymSessions            [{ skill_key, skill_outcome, completed_at }]
 *   overrideHistory        { [skill_key]: consecutiveOverrides }
 *   revisitState           { revisitsSinceShown, cooldownUntil:{[skill]:iso}, declines:{[skill]:n} }
 *   now                    Date
 * Returns { suggestion, unmapped } — suggestion is the stored object; unmapped is the
 * growth-area phrases that mapped to nothing (telemetry, gates the §1 escalation).
 */
export function suggestNextSkill({
  practicedKeys = [], completedSessionCount = 0, aggregate = null,
  sessionProfiles = [], gymSessions = [], overrideHistory = {}, revisitState = {}, now = new Date(),
}) {
  const practiced = practicedKeys instanceof Set ? practicedKeys : new Set(practicedKeys)
  const unlockedSet = new Set(getUnlockedSkills(practiced, completedSessionCount).map(s => s.key))
  const seq = getNextSequentialSkill(practiced, completedSessionCount)
  const isCompleted = k => practiced.has(k)

  // revisitAllowed — rate limit (≤1 per REVISIT_RATE suggestions) + 21d cooldown after 2 declines.
  const revisitAllowed = (skill) => {
    const cd = revisitState.cooldownUntil?.[skill]
    if (cd && new Date(cd).getTime() > now.getTime()) return false
    if ((revisitState.revisitsSinceShown ?? K.REVISIT_RATE) < K.REVISIT_RATE) return false
    return true
  }

  // ── Branch 0: curriculum finished ──
  if (!seq) return { suggestion: suggest(null, 'complete', null, { now }), unmapped: [] }

  // ── Branch 1: sparse data ──
  const n = aggregate?.based_on_count ?? 0
  if (!aggregate || n === 0) return { suggestion: suggest(seq.key, 'cold_start', null, { now }), unmapped: [] }
  if (n === 1) return { suggestion: suggest(seq.key, 'curriculum', null, { now }), unmapped: [] }

  // ── Branch 6b: hard-stale profile ──
  const ageDays = aggregate.updated_at ? daysBetween(now, aggregate.updated_at) : 0
  if (ageDays > K.STALE_HARD_DAYS) {
    return { suggestion: suggest(seq.key, 'curriculum', null, { stale: true, now }), unmapped: [] }
  }

  // ── Map free text → candidates ──
  const { candidates: mapped, unmapped } = mapGaps(aggregate)
  let candidates = mapped.map(c => ({ ...c, streak: growthStreak(c.skill, sessionProfiles) }))

  // applyGymSignals (§6c/6d) — dormant while skill_outcome is null:
  //   clicked(skill) ≤30d → drop candidate; struggled(skill) → streak += 1.
  candidates = candidates.filter(c => {
    const clicked = gymSessions.some(s =>
      s.skill_key === c.skill && s.skill_outcome === 'clicked' &&
      s.completed_at && daysBetween(now, s.completed_at) <= K.GYM_SIGNAL_FRESH_DAYS)
    return !clicked
  }).map(c => {
    const struggled = gymSessions.some(s => s.skill_key === c.skill && s.skill_outcome === 'struggled')
    return struggled ? { ...c, streak: c.streak + 1 } : c
  })

  // ── Branch 1c: n === 2 unanimity ──
  if (n === 2) {
    candidates = candidates.filter(c =>
      sessionProfiles.length >= 2 &&
      mapsToSkill(c.skill, sessionProfiles[0]?.growth_areas) &&
      mapsToSkill(c.skill, sessionProfiles[1]?.growth_areas))
  }

  // ── Branch 6a: soft-stale → STABLE only ──
  const isStable = c => c.streak >= K.STABLE_STREAK
  if (ageDays > K.STALE_SOFT_DAYS) candidates = candidates.filter(isStable)

  // ── Branch 4: regression (prior strength reappears, streak ≥3) ──
  const regression = candidates.find(c =>
    isCompleted(c.skill) && wasPriorStrength(c.skill, sessionProfiles) && c.streak >= K.REGRESSION_STREAK)
  if (regression && revisitAllowed(regression.skill)) {
    return { suggestion: suggest(regression.skill, 'revisit_regression', regression.matchedPhrase, { now }), unmapped }
  }

  // Open stable gaps, best-first (score = matchWeight + streak; tiebreak earlier week).
  const scoreOf = c => c.matchWeight + c.streak
  const openGaps = candidates
    .filter(c => !isCompleted(c.skill) && isStable(c))
    .sort((a, b) => scoreOf(b) - scoreOf(a) || WEEK[a.skill] - WEEK[b.skill])

  // Locked (prereq-locked) gaps → queue decoration (never occupy the slot).
  const queued = openGaps
    .filter(c => !unlockedSet.has(c.skill))
    .map(c => ({ skill_key: c.skill, matchedPhrase: c.matchedPhrase }))

  // ── Branch 2a: open stable gap in an UNLOCKED skill ──
  const unlockedGap = openGaps.find(c => unlockedSet.has(c.skill))
  if (unlockedGap) {
    const soften = (overrideHistory[unlockedGap.skill] ?? 0) >= K.OVERRIDE_SOFTEN
    return { suggestion: suggest(unlockedGap.skill, 'profile_gap', unlockedGap.matchedPhrase, { queued, soften, now }), unmapped }
  }

  // ── Branch 3: plateau revisit ──
  const plateau = candidates.find(c =>
    isCompleted(c.skill) && postBadgeStreak(c.skill, sessionProfiles, gymSessions) >= K.PLATEAU_STREAK)
  if (plateau && revisitAllowed(plateau.skill)) {
    return { suggestion: suggest(plateau.skill, 'revisit_plateau', plateau.matchedPhrase, { queued, now }), unmapped }
  }

  // ── Branch 2c: queued locked gap has an unlocked feeder ──
  if (queued.length) {
    const feeder = feedsInto(queued[0].skill_key).find(s => unlockedSet.has(s.key) && !isCompleted(s.key))
    if (feeder && feeder.key !== seq.key) {
      return { suggestion: suggest(feeder.key, 'prereq_for_gap', queued[0].skill_key, { queued, now }), unmapped }
    }
  }

  // ── Default: sequential ──
  return { suggestion: suggest(seq.key, 'curriculum', null, { queued, now }), unmapped }
}

// UI copy contract (§ Reason codes). Templates; the coach/UI may rewrite in-voice.
export function reasonLine(suggestion) {
  if (!suggestion) return ''
  const label = k => getSkill(k)?.label ?? k
  const d = suggestion.reason_detail
  switch (suggestion.reason) {
    case 'cold_start':    return 'Everyone starts with The Hook — the gym gets personal as you finish assignments.'
    case 'curriculum':    return suggestion.stale
      ? 'Next up in your path. Finish an assignment to refresh your writing profile.'
      : 'Next up in your path.'
    case 'profile_gap':   return suggestion.soften
      ? `You're on a roll with your own picks — ${label(suggestion.skill_key)} is still here when you want it.`
      : d ? `Because your last few assignments mention "${d}".` : 'Because your recent writing points here.'
    case 'prereq_for_gap':return `${label(suggestion.skill_key)} builds toward ${label(d)}, which your profile flags.`
    case 'revisit_plateau':   return d
      ? `Your recent assignments still mention "${d}" — a second pass usually lands it.`
      : 'A second pass on this usually lands it.'
    case 'revisit_regression':return d
      ? `"${d}" used to be a strength — worth a quick tune-up.`
      : 'This used to be a strength — worth a quick tune-up.'
    case 'complete':      return "You've done all 24. Pick anything — it's your gym now."
    default:              return 'Next up in your path.'
  }
}

export function queuedLabel(skillKey) {
  const s = getSkill(skillKey)
  const tierName = s?.tier === 1 ? 'Foundations' : s?.tier === 2 ? 'Structure' : 'Craft'
  return `Queued for you — unlocks as you finish ${tierName}`
}

// ── Recompute + persist (service-role). Runs on trigger, never on page load. ──
export async function recomputeSuggestion(studentId, now = new Date()) {
  const supabase = createServiceClient()

  const [{ data: progress }, { data: profileRow }, { data: states }, { data: gymSessions }, { data: recentSessions }] = await Promise.all([
    supabase.from('gym_progress').select('*').eq('student_id', studentId).maybeSingle(),
    supabase.from('profiles').select('writing_profile_aggregate').eq('id', studentId).single(),
    supabase.from('gym_skill_state').select('skill_key').eq('student_id', studentId),
    supabase.from('gym_sessions').select('skill_key, skill_outcome, completed_at, status').eq('student_id', studentId),
    supabase.from('sessions').select('writing_profile, completed_at')
      .eq('student_id', studentId).eq('status', 'complete')
      .not('writing_profile', 'is', null)
      .order('completed_at', { ascending: false }).limit(K.SESSION_LOOKBACK),
  ])
  if (!progress) return null // no gym engagement yet

  const practicedKeys = (states ?? []).map(s => s.skill_key)
  const completedGym = (gymSessions ?? []).filter(s => s.status === 'complete')
  const sessionProfiles = (recentSessions ?? []).map(s => ({
    growth_areas: s.writing_profile?.growth_areas ?? [],
    strengths: s.writing_profile?.strengths ?? [],
    patterns: s.writing_profile?.patterns ?? [],
    completed_at: s.completed_at,
  }))

  const { suggestion, unmapped } = suggestNextSkill({
    practicedKeys,
    completedSessionCount: completedGym.length,
    aggregate: profileRow?.writing_profile_aggregate ?? null,
    sessionProfiles,
    gymSessions: completedGym,
    overrideHistory: progress.override_history ?? {},
    revisitState: progress.revisit_state ?? {},
    now,
  })

  // Telemetry: unmapped growth-area phrases (drift alarm for the §1 40% escalation).
  for (const phrase of unmapped) {
    console.log('[gym-telemetry] unmapped_growth_area', JSON.stringify({ phrase, signals_version: SKILL_SIGNALS_VERSION }))
  }

  await supabase.from('gym_progress')
    .update({
      suggested_next_skill: suggestion.skill_key,
      suggested_reason: suggestion,
      updated_at: now.toISOString(),
    })
    .eq('student_id', studentId)

  return suggestion
}

/**
 * Record whether the student followed or overrode the standing suggestion when they
 * started `startedSkill`. Maintains override_history[suggestedSkill] (consecutive
 * overrides; reset on follow) so the copy can soften after K.OVERRIDE_SOFTEN. Also logs
 * suggestion→action telemetry. Service-role.
 */
export async function recordSuggestionAction(studentId, startedSkill) {
  const supabase = createServiceClient()
  const { data: progress } = await supabase
    .from('gym_progress').select('suggested_next_skill, override_history').eq('student_id', studentId).maybeSingle()
  if (!progress?.suggested_next_skill) return
  const suggested = progress.suggested_next_skill
  const history = { ...(progress.override_history ?? {}) }
  const followed = startedSkill === suggested
  if (followed) history[suggested] = 0
  else history[suggested] = (history[suggested] ?? 0) + 1
  console.log('[gym-telemetry] suggestion_action', JSON.stringify({ suggested, startedSkill, followed }))
  await supabase.from('gym_progress').update({ override_history: history }).eq('student_id', studentId)
}
