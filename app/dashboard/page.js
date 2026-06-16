import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import NewSessionForm from '@/components/NewSessionForm'
import SessionsList from '@/components/SessionsList'

import ImpersonationBanner from '@/components/ImpersonationBanner'
import Navbar from '@/components/Navbar'
import { getImpersonation } from '@/lib/impersonation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Single profile fetch — all fields needed for routing and render in one round trip
  const { data: adminProfile, error: profileError } = await supabase
    .from('profiles')
    .select('role, full_name, email, coppa_consent_required, coppa_consent_given, onboarding_complete, age_bracket')
    .eq('id', user.id)
    .single()
  if (profileError) console.error('[dashboard] profile fetch error:', profileError.message)

  // Fast-path admin redirect (admins are never students on this page)
  if (adminProfile?.role === 'admin') redirect('/admin')

  // Check for admin impersonation
  const imp = await getImpersonation(adminProfile)
  const targetId = imp?.userId ?? user.id

  // If not impersonating, enforce role redirects
  if (!imp) {
    if (adminProfile?.role === 'parent')  redirect('/parent')
    if (adminProfile?.role === 'teacher') redirect('/teacher')

    // COPPA guard: under-13 students must complete parental consent
    if (adminProfile?.coppa_consent_required && !adminProfile?.coppa_consent_given) {
      redirect('/coppa/pending')
    }

    // Legacy account with no recorded age (predates age-first) — send them through
    // the age step before anything else, so the coach age gate can't dead-end them.
    if (!adminProfile?.age_bracket) {
      redirect('/welcome')
    }

    // First-time student: send them through onboarding once. (Only the real
    // signed-in student — never when an admin is impersonating.)
    if (!adminProfile?.onboarding_complete) {
      redirect('/onboarding')
    }
  }

  // Fetch profile for the target user (self or impersonated)
  const service = imp ? createServiceClient() : supabase
  const { data: profile } = await service.from('profiles').select('*').eq('id', targetId).single()

  const { data: sessions } = await service
    .from('sessions')
    .select('id, assignment_text, status, persona, created_at, updated_at, title, subject, subject_custom_label, is_onboarding')
    .eq('student_id', targetId)
    .order('updated_at', { ascending: false })
    .limit(50)

  // Keep the practice run out of the real assignment list; surface it as its own card.
  const realSessions   = (sessions ?? []).filter(s => !s.is_onboarding)
  const practiceSession = (sessions ?? []).find(s => s.is_onboarding) ?? null

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>
      {imp && <ImpersonationBanner name={imp.name} role={imp.role} />}

      <Navbar user={user} profile={adminProfile} />

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-strong)' }}>Hey, {firstName}! 👋</h1>
          <p className="mt-1" style={{ color: 'var(--text-muted)', font: 'var(--type-lead)' }}>What are we writing today? Add your assignment, pick the coach who fits it best, and we'll take it from there.</p>
        </div>

        {/* Hide new session form when impersonating — admin shouldn't create sessions for other users */}
        {!imp && <NewSessionForm />}

        {/* Practice (onboarding) card: link to the warm-up if they did it, or offer it if they skipped */}
        {!imp && (
          practiceSession ? (
            <a href={practiceSession.status === 'complete' ? `/transcript/${practiceSession.id}` : `/assignment/${practiceSession.id}`}
              className="flex items-center gap-3 rounded-2xl px-4 py-3 transition"
              style={{ backgroundColor: 'var(--surface-spark)', border: '1px solid var(--border-accent)' }}>
              <span className="text-xl leading-none">✎</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Your practice paragraph</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>The warm-up you wrote with Owen</p>
              </div>
              <span className="text-sm font-semibold shrink-0" style={{ color: 'var(--accent)' }}>View →</span>
            </a>
          ) : (
            <a href="/onboarding"
              className="flex items-center gap-3 rounded-2xl px-4 py-3 transition"
              style={{ backgroundColor: 'var(--surface-spark)', border: '1px solid var(--border-accent)' }}>
              <span className="text-xl leading-none">✎</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>New here? Try a quick practice</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Write one short paragraph with Owen — about 10 minutes</p>
              </div>
              <span className="text-sm font-semibold shrink-0" style={{ color: 'var(--accent)' }}>Start →</span>
            </a>
          )
        )}

        <SessionsList sessions={realSessions} />

      </main>
    </div>
  )
}
