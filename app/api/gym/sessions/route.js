import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { canUseCoach, coachGateResponse, ageInYears } from '@/lib/coppa'
import { getSkill, getGradeBand, getUnlockedSkills } from '@/lib/gymCurriculum'
import { getChallenge } from '@/lib/gymChallengeBank'
import { ensureGymProgress, getPracticedKeys } from '@/lib/gymAwards'
import { buildWarmupAssignmentText } from '@/lib/gymPlacement'
import { recordSuggestionAction } from '@/lib/gymSuggest'
import { getImpersonation } from '@/lib/impersonation'
import { after } from 'next/server'

// Compose the student-facing practice card the coach works from. The band card's
// coach-only guidance (skill-check bar + anti-gaming note) is NOT included here — the
// gym tutor route injects those into the coach prompt so the student never reads them
// as rules. Kept warm and low-stakes: this is a practice rep, not an assignment.
function buildChallengeText(skill, card) {
  const opts = []
  if (card?.practiceA) opts.push(`A) ${card.practiceA}`)
  if (card?.practiceB) opts.push(`B) ${card.practiceB}`)
  return [
    `Skill Studio — ${skill.label}`,
    skill.description ? `Today we're practicing: ${skill.description}.` : '',
    card?.warmup ? `\nWarm-up: ${card.warmup}` : '',
    opts.length ? `\nPick one to practice:\n${opts.join('\n\n')}` : '',
  ].filter(Boolean).join('\n')
}

// POST /api/gym/sessions — start a gym practice session for one skill.
// Creates a gym_sessions row (gym metadata + progression) linked to a reused
// coaching `sessions` row (the writing surface: messages/paragraphs/scaffold via the
// existing TutorSession plumbing).
export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Admin remote-in is view + link only — no destructive "act-as" writes. Starting a
  // gym session creates rows as the user, so block it while an admin is impersonating
  // (same guard as POST /api/sessions; getImpersonation only honours the cookie for a
  // real admin).
  const { data: actor } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (await getImpersonation(actor)) {
    return Response.json({ error: "Exit remote-in to start practice — admins can't start work as a user." }, { status: 403 })
  }

  // Denial-of-wallet backstop, shared budget shape with assignment session creation.
  if (!await checkRateLimit(`gym-sessions:day:${user.id}`, 30, 86400)) {
    return rateLimited("You've started a lot of practice sessions today — try again tomorrow.")
  }

  // COPPA coach age gate (role-independent) — no one reaches the coach without a 13+
  // assertion or completed consent. /api/gym/tutor + /api/scribe* re-check it too.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, age_bracket, coppa_consent_required, coppa_consent_given, birthdate, access_granted')
    .eq('id', user.id).single()
  if (!canUseCoach(profile)) return coachGateResponse()

  // Beta-launch access gate (additive + independent of the COPPA gate above). Same
  // enforcement as POST /api/sessions: block only a fresh, un-invited, un-redeemed
  // self-signup. Block ONLY on an explicit non-true value so an odd row never crashes
  // session creation. Requires migration 045 (access_granted column) — deploy AFTER
  // it is applied or this select throws.
  if (profile?.access_granted !== true) {
    return Response.json({ error: 'Enter your Beta Circle code to start writing with a coach.', code: 'access_code_required' }, { status: 403 })
  }

  const { skillKey, persona = 'owen', warmup = false } = await request.json()

  await ensureGymProgress(user.id)

  // ── Placement warm-up: a synthetic "session" that isn't a real skill ──
  // Fun personal paragraph, scored async on completion (never a test). No skill, no
  // prereq check, no challenge card.
  if (warmup) {
    const { data: gymSession, error: gymErr } = await supabase
      .from('gym_sessions')
      .insert({ student_id: user.id, skill_key: 'placement_warmup', tier: 1, coach_persona: persona, session_type: 'warmup', status: 'active' })
      .select().single()
    if (gymErr) {
      console.error('[gym/sessions] warmup gym_sessions insert failed:', gymErr.message)
      return Response.json({ error: gymErr.message }, { status: 500 })
    }
    const { data: session, error: sessErr } = await supabase
      .from('sessions')
      .insert({ student_id: user.id, assignment_text: buildWarmupAssignmentText(), persona, subject: 'unspecified', title: 'Gym — warm-up', gym_session_id: gymSession.id })
      .select().single()
    if (sessErr) {
      console.error('[gym/sessions] warmup sessions insert failed:', sessErr.message)
      await supabase.from('gym_sessions').delete().eq('id', gymSession.id)
      return Response.json({ error: sessErr.message }, { status: 500 })
    }
    const { error: linkErr } = await supabase.from('gym_sessions').update({ session_id: session.id }).eq('id', gymSession.id)
    if (linkErr) {
      // Without the back-link, /skill-studio/session/[id] redirects away (unreachable session).
      // Roll both rows back so a retry starts clean rather than stranding the student.
      console.error('[gym/sessions] warmup back-link failed:', linkErr.message)
      await supabase.from('sessions').delete().eq('id', session.id)
      await supabase.from('gym_sessions').delete().eq('id', gymSession.id)
      return Response.json({ error: linkErr.message }, { status: 500 })
    }
    return Response.json({ gymSessionId: gymSession.id, sessionId: session.id, warmup: true })
  }

  const skill = getSkill(skillKey)
  if (!skill) return Response.json({ error: 'Unknown skill' }, { status: 400 })

  // Enforce per-skill prerequisite unlocks server-side (never trust the client): a
  // locked skill can't be started. Roots + prereqs-met are allowed. (Placement
  // pre-awards and the full suggestion engine are P2; P1 is straight prereq gating.)
  const practiced = await getPracticedKeys(user.id)
  const unlocked = new Set(getUnlockedSkills(practiced, practiced.size).map(s => s.key))
  if (!unlocked.has(skill.key)) {
    return Response.json({ error: 'This skill is still locked.', code: 'skill_locked' }, { status: 403 })
  }

  // Grade band from age when we have a birthdate; else fall back to the bracket.
  const age = profile?.birthdate ? ageInYears(new Date(profile.birthdate), new Date()) : null
  const band = getGradeBand({ age, ageBracket: profile?.age_bracket })
  const card = getChallenge(skill.key, band)
  const assignmentText = buildChallengeText(skill, card)

  // 1) gym_sessions row (the gym-domain record).
  const { data: gymSession, error: gymErr } = await supabase
    .from('gym_sessions')
    .insert({
      student_id: user.id,
      skill_key: skill.key,
      tier: skill.tier,
      coach_persona: persona,
      session_type: 'standard',
      status: 'active',
    })
    .select().single()
  if (gymErr) {
    console.error('[gym/sessions] gym_sessions insert failed:', gymErr.message)
    return Response.json({ error: gymErr.message }, { status: 500 })
  }

  // 2) reused coaching sessions row (the writing surface), linked back to the gym row.
  const { data: session, error: sessErr } = await supabase
    .from('sessions')
    .insert({
      student_id: user.id,
      assignment_text: assignmentText,
      persona,
      subject: 'unspecified',
      title: `Gym — ${skill.label}`,
      gym_session_id: gymSession.id,
    })
    .select().single()
  if (sessErr) {
    console.error('[gym/sessions] sessions insert failed:', sessErr.message)
    // Roll back the orphan gym row so a retry is clean.
    await supabase.from('gym_sessions').delete().eq('id', gymSession.id)
    return Response.json({ error: sessErr.message }, { status: 500 })
  }

  // 3) close the loop: gym_sessions.session_id → the writing session.
  const { error: linkErr } = await supabase.from('gym_sessions').update({ session_id: session.id }).eq('id', gymSession.id)
  if (linkErr) {
    // Back-link is load-bearing: /skill-studio/session/[id] redirects away when session_id is
    // null. Roll both rows back so the student's retry is clean, not a dead session.
    console.error('[gym/sessions] back-link failed:', linkErr.message)
    await supabase.from('sessions').delete().eq('id', session.id)
    await supabase.from('gym_sessions').delete().eq('id', gymSession.id)
    return Response.json({ error: linkErr.message }, { status: 500 })
  }

  // Override/follow tracking for the suggestion engine (soften copy after 3 overrides).
  after(() => recordSuggestionAction(user.id, skill.key).catch(e => console.error('[gym/sessions] recordSuggestionAction:', e)))

  return Response.json({
    gymSessionId: gymSession.id,
    sessionId: session.id,
    skillKey: skill.key,
    skillLabel: skill.label,
  })
}
