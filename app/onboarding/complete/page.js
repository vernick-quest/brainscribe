import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getImpersonation } from '@/lib/impersonation'
import { redirect } from 'next/navigation'
import OnboardingComplete from '@/components/OnboardingComplete'

// Final send-off, reached from the practice transcript: Owen's quick encouragement,
// then on to the dashboard. (The finished essay was just shown on the transcript, so
// this screen doesn't repeat it.)
export default async function OnboardingCompletePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Honor admin "remote in" — greet the impersonated student by their name.
  const { data: adminProfile } = await supabase
    .from('profiles').select('role, full_name').eq('id', user.id).single()
  const imp = await getImpersonation(adminProfile)
  const effectiveUserId = imp?.userId ?? user.id

  const profile = imp
    ? (await createServiceClient().from('profiles').select('full_name').eq('id', effectiveUserId).single()).data
    : adminProfile

  // Mark onboarding done for the REAL signed-in student only — never during a remote-in.
  if (!imp) {
    await createServiceClient()
      .from('profiles')
      .update({ onboarding_complete: true, onboarding_completed_at: new Date().toISOString() })
      .eq('id', user.id)
  }

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  return <OnboardingComplete studentName={firstName} />
}
