import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
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

  // Zero assignments ever → skip the empty list and drop them straight on the
  // new-assignment page. (Not while impersonating — admin views the real state.)
  if (!imp && (sessions?.length ?? 0) === 0) redirect('/assignment/new')

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>
      {imp && <ImpersonationBanner name={imp.name} role={imp.role} />}

      <Navbar user={user} profile={adminProfile} />

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-strong)' }}>Hey, {firstName}!</h1>
            <p className="mt-1" style={{ color: 'var(--text-muted)', font: 'var(--type-lead)' }}>Pick up where you left off — or start something new.</p>
          </div>

          {/* New assignment now lives on its own page (decoupled from the list).
              Hidden when impersonating — admin shouldn't create sessions for others. */}
          {!imp && (
            <a href="/assignment/new"
              className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:opacity-90"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--text-on-dark)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              New assignment
            </a>
          )}
        </div>

        {/* The practice run lives in the assignments list like any other piece. */}
        <SessionsList sessions={sessions ?? []} />

      </main>
    </div>
  )
}
