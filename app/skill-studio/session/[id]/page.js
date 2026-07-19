import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import TutorSession from '@/components/TutorSession'
import { getSkill } from '@/lib/gymCurriculum'

// A gym practice session. [id] = gym_sessions.id. It reuses the full coaching surface
// (TutorSession + the scribe/assemble/scaffold plumbing) against the linked `sessions`
// row, pointed at the gym-mode coach (/api/gym/tutor) and the gym completion path
// (/api/gym/complete/[sessionRowId]) via props — the component itself is unchanged.
export default async function GymSessionPage({ params }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: gymSession } = await supabase
    .from('gym_sessions')
    .select('id, student_id, session_id, skill_key, tier, status')
    .eq('id', id).single()

  // Ownership + existence. (Watchers get read-only gym surfaces later; P1 is the
  // student's own practice only.)
  if (!gymSession || gymSession.student_id !== user.id || !gymSession.session_id) {
    redirect('/skill-studio')
  }

  const [{ data: session }, { data: profile }] = await Promise.all([
    supabase.from('sessions').select('*').eq('id', gymSession.session_id).single(),
    supabase.from('profiles').select('full_name, role, avatar_url, age_bracket, coach_read_aloud, voice_prompt_dismissed_at').eq('id', user.id).single(),
  ])
  if (!session) redirect('/skill-studio')

  const [{ data: messages }, { data: paragraphs }, { data: scaffoldData }] = await Promise.all([
    supabase.from('messages').select('role, content').eq('session_id', session.id).order('created_at'),
    supabase.from('paragraphs').select('*').eq('session_id', session.id).order('position'),
    supabase.from('paragraph_scaffolds').select('*').eq('session_id', session.id).single(),
  ])

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const skill = getSkill(gymSession.skill_key)
  // Edge-geo country for the crisis card (read at render only, never stored).
  const geoCountry = (await headers()).get('x-vercel-ip-country') || null

  return (
    <TutorSession
      session={session}
      initialMessages={messages ?? []}
      initialParagraphs={paragraphs ?? []}
      initialScaffold={scaffoldData ?? null}
      studentName={firstName}
      country={geoCountry}
      user={user}
      profile={profile}
      tutorEndpoint="/api/gym/tutor"
      completeEndpoint={`/api/gym/complete/${session.id}`}
      gym={{
        skillKey: gymSession.skill_key,
        skillLabel: skill?.label ?? 'Practice',
        tier: gymSession.tier,
        backHref: '/skill-studio',
        portfolioHref: '/skill-studio/portfolio',
      }}
    />
  )
}
