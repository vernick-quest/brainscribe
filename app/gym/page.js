import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import GymHome from '@/components/GymHome'
import { getNextSequentialSkill } from '@/lib/gymCurriculum'
import { initGymForStudent } from '@/lib/gymPlacement'
import { reasonLine } from '@/lib/gymSuggest'

export default async function GymPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Navbar needs age_bracket (COPPA photo suppression). Gym is available to all
  // account types in v1 (no free-tier lockout yet — that's blocked on entitlements);
  // the coach age gate is enforced when a session is STARTED, not for viewing.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, avatar_url, age_bracket, onboarding_complete, writing_profile_aggregate')
    .eq('id', user.id).single()

  // First-touch init: create gym_progress, and profile-seed existing assignment-mode
  // students (their profile IS their placement). Idempotent — no-op after first visit.
  // Guarded so a missing gym table (pre-migration) can't break the page.
  try { await initGymForStudent(user.id) } catch (e) { console.error('[gym] init:', e) }

  const [progressRes, statesRes, portfolioRes, completedRes] = await Promise.all([
    supabase.from('gym_progress').select('current_level, current_streak, longest_streak, suggested_next_skill, suggested_reason, placement').eq('student_id', user.id).maybeSingle(),
    supabase.from('gym_skill_state').select('skill_key, state').eq('student_id', user.id),
    supabase.from('portfolio_entries').select('id', { count: 'exact', head: true }).eq('student_id', user.id),
    supabase.from('gym_sessions').select('id', { count: 'exact', head: true }).eq('student_id', user.id).eq('status', 'complete'),
  ])

  const progress = progressRes.data ?? null
  const states = statesRes.data ?? []
  const skillStates = Object.fromEntries(states.map(s => [s.skill_key, s.state]))
  const practicedKeys = states.map(s => s.skill_key)
  const portfolioCount = portfolioRes.count ?? 0
  const completedSessionCount = completedRes.count ?? 0
  const aggCount = profile?.writing_profile_aggregate?.based_on_count ?? 0

  // A brand-new gym-first student (no placement, no practiced skills, no completed
  // sessions, no assignment profile) starts with the warm-up. Everyone else goes
  // straight to a suggested skill.
  const needsWarmup = !progress?.placement && practicedKeys.length === 0
    && completedSessionCount === 0 && aggCount < 1

  // Prefer the persisted, reasoned suggestion (from a recompute trigger); fall back to
  // the sequential default (fresh account with no triggers yet).
  const storedReason = progress?.suggested_reason ?? null
  const seqNext = getNextSequentialSkill(new Set(practicedKeys), completedSessionCount)
  const suggestedSkillKey = storedReason?.skill_key ?? seqNext?.key ?? null
  const suggestionReason = storedReason ? reasonLine(storedReason) : null
  const queued = (storedReason?.queued ?? []).map(q => q.skill_key ?? q).filter(Boolean)

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>
      <Navbar user={user} profile={profile} />
      <GymHome
        levelKey={progress?.current_level ?? 'finder'}
        streak={progress?.current_streak ?? 0}
        practicedCount={practicedKeys.length}
        skillStates={skillStates}
        practicedKeys={practicedKeys}
        completedSessionCount={completedSessionCount}
        suggestedSkillKey={suggestedSkillKey}
        suggestionReason={suggestionReason}
        queuedKeys={queued}
        needsWarmup={needsWarmup}
        portfolioCount={portfolioCount}
      />
    </div>
  )
}
