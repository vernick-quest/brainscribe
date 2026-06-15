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

  // Most recent practice session (to show the paragraph they just wrote).
  const { data: practice } = await supabase
    .from('sessions')
    .select('id')
    .eq('student_id', user.id)
    .eq('is_onboarding', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // The finished paragraph — prefer the assembled prose; if assembly hasn't landed
  // yet (a very fast "Continue"), fall back to the confirmed components joined into
  // one paragraph so the student still sees their whole piece, not nothing.
  let practiceParagraph = null
  if (practice?.id) {
    const [{ data: paras }, { data: scaffold }] = await Promise.all([
      supabase.from('paragraphs').select('scribed_text, position').eq('session_id', practice.id).order('position'),
      supabase.from('paragraph_scaffolds').select('components').eq('session_id', practice.id).single(),
    ])
    const assembled = paras?.map(p => p.scribed_text).filter(Boolean).join('\n\n')
    const fromComponents = (scaffold?.components ?? [])
      .flatMap(sec => sec.items ?? [])
      .filter(it => it.status === 'confirmed' && (it.text || it.nuggetText))
      .map(it => it.text || it.nuggetText)
      .join(' ')
    practiceParagraph = assembled || fromComponents || null
  }

  // Mark onboarding done so the dashboard stops routing them back here.
  const service = createServiceClient()
  await service
    .from('profiles')
    .update({ onboarding_complete: true, onboarding_completed_at: new Date().toISOString() })
    .eq('id', user.id)

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  return (
    <OnboardingComplete
      studentName={firstName}
      practiceSessionId={practice?.id ?? null}
      practiceParagraph={practiceParagraph}
    />
  )
}
