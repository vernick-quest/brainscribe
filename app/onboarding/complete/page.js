import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import OnboardingComplete from '@/components/OnboardingComplete'

// Reflection screen shown after the practice paragraph is finished. Reaching here
// means the student has done the practice run, so we mark onboarding complete.
export default async function OnboardingCompletePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('full_name').eq('id', user.id).single()

  // Most recent practice session (to offer a "see your paragraph" link).
  const { data: practice } = await supabase
    .from('sessions')
    .select('id')
    .eq('student_id', user.id)
    .eq('is_onboarding', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Mark onboarding done so the dashboard stops routing them back here.
  const service = createServiceClient()
  await service
    .from('profiles')
    .update({ onboarding_complete: true, onboarding_completed_at: new Date().toISOString() })
    .eq('id', user.id)

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  return <OnboardingComplete studentName={firstName} practiceSessionId={practice?.id ?? null} />
}
