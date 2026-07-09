// lib/gymAwards.js — server-only gym write path. Badge, portfolio, level, streak,
// and progress writes go through the SERVICE-ROLE client (mirrors the COPPA
// gate-write posture): a student must never be able to mint a Practiced/Locked-In
// badge or a portfolio entry by writing to PostgREST directly. RLS makes
// gym_skill_state / gym_progress / portfolio_entries read-only to the student; these
// helpers are the only writers.
//
// NEVER import this into client code. The tables it writes do not exist until
// migration 025 is applied (see supabase/migrations/025_writing_gym.sql).

import { createServiceClient } from '@/lib/supabase/service'
import { GYM_SKILLS, getSkill, getLevel } from '@/lib/gymCurriculum'

// ── Progress row ──────────────────────────────────────────────────────────────

/** Ensure the student has a gym_progress row (level key 'finder' = "Scribe" on first
 *  touch — key is the stored value, display name renamed 2026-07-09). Idempotent. */
export async function ensureGymProgress(studentId) {
  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('gym_progress').select('*').eq('student_id', studentId).maybeSingle()
  if (existing) return existing
  const { data, error } = await supabase
    .from('gym_progress')
    .insert({ student_id: studentId, current_level: 'finder' })
    .select().single()
  if (error) {
    // A concurrent create may have won the race — re-read rather than fail.
    const { data: raced } = await supabase
      .from('gym_progress').select('*').eq('student_id', studentId).maybeSingle()
    if (raced) return raced
    console.error('[gymAwards] ensureGymProgress failed:', error.message)
    return null
  }
  return data
}

// ── Practiced / Locked-In badges ────────────────────────────────────────────

/**
 * Award (or keep) a Practiced badge for a skill. Never downgrades an existing
 * Locked-In badge. `source` ∈ session|placement|profile. Returns
 * { awarded: bool, alreadyHad: 'practiced'|'locked_in'|null }.
 */
export async function awardPracticed(studentId, skillKey, { source = 'session', evidenceRef = null, evidenceSpan = null } = {}) {
  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('gym_skill_state').select('state').eq('student_id', studentId).eq('skill_key', skillKey).maybeSingle()

  if (existing) {
    // Already practiced or locked_in — leave it (badge is one-per-skill forever).
    return { awarded: false, alreadyHad: existing.state }
  }

  const { error } = await supabase.from('gym_skill_state').insert({
    student_id: studentId,
    skill_key: skillKey,
    state: 'practiced',
    practiced_source: source,
    evidence_ref: evidenceRef,
    evidence_span: evidenceSpan,
  })
  if (error) {
    // Unique-violation race → treat as already awarded.
    if (error.code === '23505') return { awarded: false, alreadyHad: 'practiced' }
    console.error('[gymAwards] awardPracticed failed:', error.message)
    return { awarded: false, alreadyHad: null }
  }
  return { awarded: true, alreadyHad: null }
}

/** The set of skill keys the student has at practiced-or-better. */
export async function getPracticedKeys(studentId) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('gym_skill_state').select('skill_key').eq('student_id', studentId)
  return new Set((data ?? []).map(r => r.skill_key))
}

// ── Portfolio ────────────────────────────────────────────────────────────────

/**
 * Shape portfolio content by the skill's output_type from whatever the writing flow
 * produced (assembled paragraph rows). P1 stores the student's real text typed by
 * shape; P2/P3 add structured before/after and blueprint capture in-session.
 */
export function buildPortfolioContent(outputType, paragraphTexts, fullText) {
  const paras = (paragraphTexts ?? []).filter(Boolean)
  switch (outputType) {
    case 'pair':
      return paras.length >= 2
        ? { before: paras[0], after: paras.slice(1).join('\n\n') }
        : { after: fullText }
    case 'multi_paragraph':
      return { paragraphs: paras.length ? paras : [fullText] }
    case 'thesis':
      return { thesis: fullText }
    case 'blueprint':
      return { text: fullText }
    case 'reflection':
      return { text: fullText }
    default:
      return { text: fullText }
  }
}

/**
 * Create the portfolio entry for a completed gym session. Returns the inserted row
 * (or null). `paragraphTexts` are the assembled paragraph strings, in order.
 */
export async function createPortfolioEntry({ studentId, gymSessionId, skillKey, tier, paragraphTexts }) {
  const supabase = createServiceClient()
  const skill = getSkill(skillKey)
  const outputType = skill?.output_type ?? 'paragraph'
  const fullText = (paragraphTexts ?? []).filter(Boolean).join('\n\n')
  if (!fullText) return null   // nothing written — don't create an empty artifact

  const content = buildPortfolioContent(outputType, paragraphTexts, fullText)
  const { data, error } = await supabase.from('portfolio_entries').insert({
    student_id: studentId,
    gym_session_id: gymSessionId,
    skill_key: skillKey,
    skill_label: skill?.label ?? skillKey,
    tier: tier ?? skill?.tier ?? 1,
    entry_type: outputType,
    content,
  }).select().single()
  if (error) {
    console.error('[gymAwards] createPortfolioEntry failed:', error.message)
    return null
  }
  return data
}

// ── Level ──────────────────────────────────────────────────────────────────

/**
 * Recompute the student's level from their current skill states and persist it if it
 * advanced. Levels never regress. Returns { level, previousLevel, leveledUp }.
 */
export async function recomputeLevel(studentId) {
  const supabase = createServiceClient()
  const practiced = await getPracticedKeys(studentId)
  const completedCount = practiced.size // portfolio_review's volume gate is handled at suggestion time
  const level = getLevel(practiced, true) ?? 'finder'

  const { data: prog } = await supabase
    .from('gym_progress').select('current_level').eq('student_id', studentId).maybeSingle()
  const previousLevel = prog?.current_level ?? 'finder'

  const order = ['finder', 'builder', 'craftsman', 'writer']
  const leveledUp = order.indexOf(level) > order.indexOf(previousLevel)
  if (leveledUp) {
    await supabase.from('gym_progress')
      .update({ current_level: level, updated_at: new Date().toISOString() })
      .eq('student_id', studentId)
  }
  return { level: leveledUp ? level : previousLevel, previousLevel, leveledUp }
}

// ── Streak (demoted, weekly cadence, auto-freeze) ───────────────────────────

/** ISO-ish week index (Mon-anchored) since epoch — for weekly-cadence streak math. */
function weekIndex(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  // Shift so Monday = start of week, then integer weeks since epoch.
  const dayNum = (d.getUTCDay() + 6) % 7 // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum)
  return Math.floor(d.getTime() / (7 * 24 * 60 * 60 * 1000))
}

/**
 * Pure weekly-streak transition (exported for testing). Freezes auto-apply and cover
 * skipped weeks (bank cap 2); lapse never says "streak lost" (copy lives in the UI).
 * Input/Output are plain fields off gym_progress.
 */
export function computeStreakUpdate(prev, now = new Date()) {
  const nowWk = weekIndex(now)
  const last = prev.last_session_at ? weekIndex(new Date(prev.last_session_at)) : null
  let streak = prev.current_streak ?? 0
  let freezes = prev.streak_freezes_banked ?? 0

  // Monthly freeze accrual (1/month, cap 2), independent of the streak math.
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  let accruedMonth = prev.freeze_accrued_month ?? null
  if (accruedMonth !== month) {
    freezes = Math.min(2, freezes + 1)
    accruedMonth = month
  }

  if (last === null) {
    streak = 1
  } else {
    const gap = nowWk - last
    if (gap <= 0) {
      // Same week (or clock skew) — count stays, first-of-week already counted.
      streak = Math.max(streak, 1)
    } else if (gap === 1) {
      streak += 1
    } else {
      // gap-1 skipped weeks; cover each with a banked freeze if possible.
      const skipped = gap - 1
      if (freezes >= skipped) {
        freezes -= skipped
        streak += 1
      } else {
        streak = 1
      }
    }
  }

  const longest = Math.max(prev.longest_streak ?? 0, streak)
  return {
    current_streak: streak,
    longest_streak: longest,
    streak_freezes_banked: freezes,
    freeze_accrued_month: accruedMonth,
    last_session_at: now.toISOString(),
  }
}

/** Apply the weekly-streak transition on session completion. */
export async function updateStreakOnComplete(studentId, now = new Date()) {
  const supabase = createServiceClient()
  const { data: prog } = await supabase
    .from('gym_progress').select('*').eq('student_id', studentId).maybeSingle()
  if (!prog) return null
  const next = computeStreakUpdate(prog, now)
  await supabase.from('gym_progress')
    .update({ ...next, updated_at: now.toISOString() })
    .eq('student_id', studentId)
  return next
}
