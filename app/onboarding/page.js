import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OnboardingFlow from '@/components/OnboardingFlow'
import { selectOnboardingPrompts } from '@/lib/onboardingPrompts'

// First-time student onboarding. Sits AFTER the role/age (COPPA) gate at /welcome
// and before the dashboard. Only students who haven't completed onboarding land here.
export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, coppa_consent_required, coppa_consent_given')
    .eq('id', user.id)
    .single()

  // Non-students never see onboarding — route them home.
  if (profile?.role === 'admin')   redirect('/admin')
  if (profile?.role === 'parent')  redirect('/parent')
  if (profile?.role === 'teacher') redirect('/teacher')

  // Under-13 students must finish parental consent first.
  if (profile?.coppa_consent_required && !profile?.coppa_consent_given) redirect('/coppa/pending')

  // Note: we deliberately DON'T redirect already-onboarded students away. The
  // dashboard handles the one-time auto-redirect; reaching /onboarding directly
  // (the "try practice" card, or a future "restart onboarding") is intentional.

  // Pick four practice prompts on the server (avoids a hydration mismatch from
  // client-side randomness, and gives us a stable set for this run).
  const prompts = selectOnboardingPrompts()
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  return <OnboardingFlow studentName={firstName} prompts={prompts} />
}
