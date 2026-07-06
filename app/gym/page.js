import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import GymHome from '@/components/GymHome'
import { getNextSequentialSkill } from '@/lib/gymCurriculum'

export default async function GymPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Navbar needs age_bracket (COPPA photo suppression). Gym is available to all
  // account types in v1 (no free-tier lockout yet — that's blocked on entitlements);
  // the coach age gate is enforced when a session is STARTED, not for viewing.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, avatar_url, age_bracket, onboarding_complete')
    .eq('id', user.id).single()

  // These reads are independent — run them together. Each defaults to empty if the
  // gym tables aren't present yet (migration 025 not applied) so the page renders an
  // empty gym rather than crashing during the apply-before-deploy window.
  const [progressRes, statesRes, portfolioRes, completedRes] = await Promise.all([
    supabase.from('gym_progress').select('current_level, current_streak, longest_streak').eq('student_id', user.id).maybeSingle(),
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

  const suggested = getNextSequentialSkill(new Set(practicedKeys), completedSessionCount)

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
        suggestedSkillKey={suggested?.key ?? null}
        portfolioCount={portfolioCount}
      />
    </div>
  )
}
