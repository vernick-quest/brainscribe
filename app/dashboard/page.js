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

  // Check for admin impersonation FIRST — an impersonating admin should land on the
  // impersonated student's dashboard, not be bounced to /admin.
  const imp = await getImpersonation(adminProfile)
  const targetId = imp?.userId ?? user.id

  // Admins (when NOT remoted into someone) belong on /admin, never this page.
  if (!imp && adminProfile?.role === 'admin') redirect('/admin')

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

  // Per-assignment teachers + the watchers who can see this student's work.
  const sessionIds = (sessions ?? []).map(s => s.id)
  const [{ data: teacherRows }, { data: watcherRows }] = await Promise.all([
    sessionIds.length
      ? service.from('assignment_teachers').select('session_id, teacher_id, profiles(full_name)').in('session_id', sessionIds)
      : Promise.resolve({ data: [] }),
    service.from('relationships').select('watcher_id, profiles!relationships_watcher_id_fkey(full_name, role)').eq('student_id', targetId),
  ])

  const teachersBySession = {}
  for (const r of (teacherRows ?? [])) {
    (teachersBySession[r.session_id] ??= []).push({ id: r.teacher_id, name: r.profiles?.full_name ?? 'Teacher' })
  }
  const watchers = (watcherRows ?? []).map(w => ({
    name: w.profiles?.full_name ?? 'Someone', role: w.profiles?.role ?? 'watcher',
  }))

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>
      {imp && <ImpersonationBanner name={imp.name} role={imp.role} />}

      <Navbar user={user} profile={adminProfile} />

      <main style={{ maxWidth: 'var(--width-prose)' }} className="mx-auto px-6 py-12">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between" style={{ marginBottom: 'var(--space-2)' }}>
          <h1 style={{ font: 'var(--type-title)', color: 'var(--text-strong)', margin: 0 }}>Your assignments</h1>

          {/* New assignment lives on its own page; hidden while impersonating. */}
          {!imp && (
            <a href="/assignment/new"
              className="shrink-0 inline-flex items-center gap-1.5 transition hover:opacity-90"
              style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--text-on-accent)', backgroundColor: 'var(--accent)', borderRadius: 'var(--radius-pill)', padding: '10px 18px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              New assignment
            </a>
          )}
        </div>

        {/* Watcher line — who can see this student's work */}
        {watchers.length > 0 && (
          <div className="inline-flex items-center gap-2" style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', marginBottom: 'var(--space-5)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-subtle)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            {watchers.map(w => w.name).join(' and ')} can see your work
          </div>
        )}

        <SessionsList
          sessions={sessions ?? []}
          teachersBySession={teachersBySession}
          canManage={!imp}
        />
      </main>
    </div>
  )
}
