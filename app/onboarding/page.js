import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OnboardingFlow from '@/components/OnboardingFlow'
import { selectOnboardingPrompts } from '@/lib/onboardingPrompts'

// First-time onboarding. Sits AFTER the age/role (COPPA) gate at /welcome and
// before the dashboard. Everyone 13+ (or a consented student) sees it once;
// parents/teachers get the explanation and can opt out of the practice paragraph.
export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, coppa_consent_required, coppa_consent_given, onboarding_complete')
    .eq('id', user.id)
    .single()

  // Admins never onboard.
  if (profile?.role === 'admin') redirect('/admin')

  // Under-13 students must finish parental consent first.
  if (profile?.coppa_consent_required && !profile?.coppa_consent_given) redirect('/coppa/pending')

  // RESUME: if a still-onboarding user already started a practice paragraph and
  // left, drop them back INTO it instead of replaying the whole tour. (Practice
  // mode hides the back-link and uses "Exit practice", so there's no redirect
  // loop.) status defaults non-'complete' on insert, so filter in JS to be
  // null-safe. Only for users who haven't finished onboarding — an onboarded
  // user reaching /onboarding via "try practice" still sees the tour.
  if (!profile?.onboarding_complete) {
    const { data: practice } = await supabase
      .from('sessions')
      .select('id, status')
      .eq('student_id', user.id)
      .eq('is_onboarding', true)
      .order('created_at', { ascending: false })
      .limit(5)
    const resumable = (practice ?? []).find(s => s.status !== 'complete')
    if (resumable) redirect(`/assignment/${resumable.id}`)
  }

  // Note: we deliberately DON'T redirect already-onboarded users away. The role
  // dashboards handle the one-time auto-redirect; reaching /onboarding directly
  // (the "try practice" card, or a future "restart onboarding") is intentional.

  // Pick four practice prompts on the server (avoids a hydration mismatch from
  // client-side randomness, and gives us a stable set for this run).
  const prompts = selectOnboardingPrompts()
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  return <OnboardingFlow studentName={firstName} prompts={prompts} role={profile?.role ?? 'student'} />
}
