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

  // Reader for the impersonated user's data (service bypasses RLS); otherwise the
  // signed-in user's own client + RLS is enough.
  const reader = imp ? createServiceClient() : supabase

  const profile = imp
    ? (await reader.from('profiles').select('full_name').eq('id', effectiveUserId).single()).data
    : adminProfile

  // Mark onboarding done for the REAL signed-in student only — never during a remote-in.
  if (!imp) {
    await createServiceClient()
      .from('profiles')
      .update({ onboarding_complete: true, onboarding_completed_at: new Date().toISOString() })
      .eq('id', user.id)
  }

  // Pull the opening line the student just locked in, to reveal it large on this
  // screen. It lives as the confirmed component of the practice session's scaffold —
  // that's their exact words, not a reassembled paraphrase.
  const { data: practice } = await reader
    .from('sessions')
    .select('id')
    .eq('student_id', effectiveUserId)
    .eq('is_onboarding', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let hook = null
  if (practice?.id) {
    const { data: sc } = await reader
      .from('paragraph_scaffolds')
      .select('components')
      .eq('session_id', practice.id)
      .maybeSingle()
    const items = sc?.components?.[0]?.items ?? []
    hook = items.find(it => it.status === 'confirmed' && it.text)?.text
      ?? items.find(it => it.text)?.text
      ?? null
  }

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  return <OnboardingComplete studentName={firstName} practiceSessionId={practice?.id ?? null} hook={hook} />
}
