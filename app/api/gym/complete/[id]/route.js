import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { assembleParagraphText } from '@/lib/assembleParagraph'
import { getSkill } from '@/lib/gymCurriculum'
import { ageInYears } from '@/lib/coppa'
import {
  awardPracticed, createPortfolioEntry, recomputeLevel, updateStreakOnComplete,
} from '@/lib/gymAwards'
import {
  scorePlacement, applyPlacementAwards, savePlacement, createPlacementPortfolioEntry,
} from '@/lib/gymPlacement'
import { recomputeSuggestion } from '@/lib/gymSuggest'
import { NextResponse } from 'next/server'

// Turn any confirmed-but-unassembled scaffold paragraphs into flowing prose before we
// read the final draft. Mirrors app/api/sessions/[id]/complete's helper (kept local so
// the gym completion path doesn't reach into the assignment route). Uses the caller's
// RLS-scoped client — the student owns this session, so RLS permits the writes.
async function assembleUnbuiltParagraphs(supabase, sessionId, userId) {
  const [{ data: scaffold }, { data: existing }] = await Promise.all([
    supabase.from('paragraph_scaffolds').select('components').eq('session_id', sessionId).single(),
    supabase.from('paragraphs').select('position, paragraph_index').eq('session_id', sessionId),
  ])
  const built = new Set((existing ?? []).map(p => p.paragraph_index ?? p.position))
  const toBuild = (scaffold?.components ?? [])
    .map((para, idx) => ({ para, idx }))
    .filter(({ para, idx }) =>
      !built.has(idx) &&
      (para.items ?? []).some(c => c.status === 'confirmed' && (c.text || c.nuggetText)))

  await Promise.all(toBuild.map(async ({ para, idx }) => {
    const components = (para.items ?? [])
      .filter(c => c.status === 'confirmed' && (c.text || c.nuggetText))
      .map(c => ({ id: c.id, label: c.label ?? c.id, text: c.text || c.nuggetText }))
    const { assembled, componentText } = await assembleParagraphText({
      components, paragraphType: para.type, sessionId, userId,
    })
    if (!assembled) return
    const { error } = await supabase.from('paragraphs').insert({
      session_id: sessionId,
      scribed_text: assembled,
      raw_spoken_text: componentText,
      position: idx,
      paragraph_index: idx,
      paragraph_type: para.type,
      is_thin: false,
    })
    if (error) console.error('[gym complete auto-assemble]', error.message)
  }))
}

// PATCH /api/gym/complete/[id]  ([id] = the reused sessions row id)
// Completes a gym session: assembles the draft, awards the Practiced badge
// (service-role), commits the typed portfolio entry, advances streak + level.
export async function PATCH(request, { params }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: session } = await supabase
    .from('sessions').select('id, student_id, status, gym_session_id').eq('id', id).single()
  if (!session || session.student_id !== user.id || !session.gym_session_id) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const { data: gymSession } = await supabase
    .from('gym_sessions').select('id, skill_key, tier, status, session_type, created_at').eq('id', session.gym_session_id).single()
  const skill = getSkill(gymSession?.skill_key)
  const isWarmup = gymSession?.session_type === 'warmup'

  // Idempotent — a re-fire (double [COMPLETE], reload) must not double-award.
  if (gymSession?.status === 'complete') {
    const { data: paragraphs } = await supabase
      .from('paragraphs').select('scribed_text, is_thin, position, paragraph_index')
      .eq('session_id', id).order('position')
    return NextResponse.json({ ok: true, alreadyComplete: true, paragraphs: paragraphs ?? [] })
  }

  // ── Idempotency: claim the completion atomically BEFORE any award ──
  // The status read above is only a fast path; two concurrent PATCHes (a double
  // [COMPLETE] in one stream + a reload, or two tabs) can both pass it. Flip the
  // idempotency marker (gym_sessions.status active→complete) with a compare-and-swap
  // and let only the winner proceed to award. A lost CAS (0 rows back) means another
  // request already completed this session — so portfolio/badge/streak/level never
  // re-run and nothing double-awards. Also fixes the partial-failure case: the marker
  // is set FIRST, so a later error can't leave gym_sessions 'active' and re-run awards
  // on the student's next completion attempt. gym_sessions is student-writable by
  // design (migration 025, accepted risk); the award writes below still go through the
  // service-role client in lib/gymAwards.js.
  const durationSeconds = gymSession?.created_at
    ? Math.max(0, Math.round((Date.now() - new Date(gymSession.created_at).getTime()) / 1000))
    : null
  const { data: claimed, error: claimErr } = await supabase
    .from('gym_sessions')
    .update({ status: 'complete', completed_at: new Date().toISOString(), duration_seconds: durationSeconds })
    .eq('id', gymSession.id).eq('status', 'active')
    .select('id')
  if (claimErr) {
    console.error('[gym complete] completion claim failed:', claimErr.message)
    return NextResponse.json({ error: 'Could not complete session.' }, { status: 500 })
  }
  if (!claimed || claimed.length === 0) {
    // Lost the race (or the row was no longer 'active') — another request already owns
    // the completion. Return the same idempotent shape as the fast path; award nothing.
    const { data: paragraphs } = await supabase
      .from('paragraphs').select('scribed_text, is_thin, position, paragraph_index')
      .eq('session_id', id).order('position')
    return NextResponse.json({ ok: true, alreadyComplete: true, paragraphs: paragraphs ?? [] })
  }

  // We own the completion. Mark the writing session complete + assemble any unbuilt
  // paragraphs. (sessions.completed_at is the freshness contract the suggestion engine
  // reads — migration 026; keep stamping it here.)
  const { error: sessErr } = await supabase
    .from('sessions').update({ status: 'complete', completed_at: new Date().toISOString() }).eq('id', id)
  if (sessErr) console.error('[gym complete] sessions status update failed:', sessErr.message)
  await assembleUnbuiltParagraphs(supabase, id, user.id)

  const { data: paragraphs } = await supabase
    .from('paragraphs').select('scribed_text, raw_spoken_text, is_thin, position, paragraph_index')
    .eq('session_id', id).order('position')
  const paragraphTexts = (paragraphs ?? []).map(p => p.scribed_text).filter(Boolean)

  // ── Placement warm-up: score async, pre-award, portfolio entry, entry-point ──
  if (isWarmup) {
    const first = (paragraphs ?? [])[0] ?? {}
    // Voice-first app: if a raw transcript exists, score THAT with the register rules;
    // else the student typed. input_mode drives the Sentence-Variety non-negotiable.
    const inputMode = first.raw_spoken_text ? 'voice_transcript' : 'typed'
    const paragraphText = (first.raw_spoken_text || first.scribed_text || '').trim()

    const { data: prof } = await supabase.from('profiles').select('birthdate, age_bracket').eq('id', user.id).single()
    const age = prof?.birthdate ? ageInYears(new Date(prof.birthdate), new Date()) : null

    let placementResult = null
    if (paragraphText) {
      try {
        placementResult = await scorePlacement({ age, inputMode, paragraph: paragraphText, userId: user.id, sessionId: id })
      } catch (e) { console.error('[gym complete] placement scoring failed:', e) }
    }

    const portfolio = await createPlacementPortfolioEntry({
      studentId: user.id, gymSessionId: gymSession.id, text: paragraphText, inputMode,
    })
    let awarded = []
    if (placementResult) {
      awarded = await applyPlacementAwards(user.id, placementResult.metMarkers, { portfolioEntryId: portfolio?.id ?? null })
      await savePlacement(user.id, {
        scored_at: new Date().toISOString(),
        input_mode: inputMode,
        verdicts: placementResult.verdicts,
        entry_point: placementResult.entryPoint,
        second_look: placementResult.secondLook,
        second_look_done: false,
      })
    }
    // (gym_sessions already marked complete by the compare-and-swap claim above.)
    await updateStreakOnComplete(user.id)
    const level = await recomputeLevel(user.id)
    // Reasoned suggestion now that pre-awards are in (runs off the fresh practiced set).
    await recomputeSuggestion(user.id).catch(e => console.error('[gym complete] recompute:', e))

    return NextResponse.json({
      ok: true,
      warmup: true,
      paragraphs: paragraphs ?? [],
      award: { placement: true, awardedSkills: awarded, level: level.level, leveledUp: level.leveledUp },
    })
  }

  // Service-role award path (badge integrity). Portfolio first so the badge can
  // point its evidence_ref at the artifact.
  const portfolio = await createPortfolioEntry({
    studentId: user.id,
    gymSessionId: gymSession.id,
    skillKey: gymSession.skill_key,
    tier: gymSession.tier,
    paragraphTexts,
  })
  const award = await awardPracticed(user.id, gymSession.skill_key, {
    source: 'session', evidenceRef: portfolio?.id ?? null,
  })

  // (gym_sessions already closed — status/completed_at/duration_seconds stamped by the
  // compare-and-swap claim above, which is what gates this award path.)

  // Streak (demoted) + level milestone. Streak before level so both land in one turn.
  await updateStreakOnComplete(user.id)
  const level = await recomputeLevel(user.id)

  // Recompute the standing suggestion off the fresh practiced set (trigger, not page load).
  after(() => recomputeSuggestion(user.id).catch(e => console.error('[gym complete] recompute:', e)))

  return NextResponse.json({
    ok: true,
    paragraphs: paragraphs ?? [],
    award: {
      skillKey: gymSession.skill_key,
      skillLabel: skill?.label ?? gymSession.skill_key,
      practicedAwarded: award.awarded,
      alreadyHad: award.alreadyHad,
      level: level.level,
      previousLevel: level.previousLevel,
      leveledUp: level.leveledUp,
      portfolioEntryId: portfolio?.id ?? null,
    },
  })
}
