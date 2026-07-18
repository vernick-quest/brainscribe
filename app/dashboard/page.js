import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import SessionsList from '@/components/SessionsList'

import ImpersonationBanner from '@/components/ImpersonationBanner'
import PendingInviteBanner from '@/components/PendingInviteBanner'
import Navbar from '@/components/Navbar'
import { getImpersonation } from '@/lib/impersonation'
import { getPendingInvitesForEmail } from '@/lib/pendingInvites'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Single profile fetch — all fields needed for routing and render in one round trip
  const { data: adminProfile, error: profileError } = await supabase
    .from('profiles')
    .select('role, full_name, email, avatar_url, coppa_consent_required, coppa_consent_given, onboarding_complete, age_bracket')
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

  // "Your assignments" excludes gym-backing sessions rows (a gym practice session
  // reuses a sessions row, marked by gym_session_id). Resilient to the apply-before-
  // deploy window: if the gym_session_id column isn't present yet (migration 025 not
  // applied), fall back to the unfiltered query — pre-migration there are no gym
  // sessions anyway, so nothing is hidden.
  const baseCols = 'id, assignment_text, status, persona, created_at, updated_at, completed_at, title, subject, subject_custom_label, is_onboarding, requirements'
  let sessionsRes = await service
    .from('sessions')
    .select(baseCols)
    .eq('student_id', targetId)
    .is('gym_session_id', null)
    .order('updated_at', { ascending: false })
    .limit(50)
  if (sessionsRes.error) {
    sessionsRes = await service
      .from('sessions')
      .select(baseCols)
      .eq('student_id', targetId)
      .order('updated_at', { ascending: false })
      .limit(50)
  }
  const sessions = sessionsRes.data

  // Pending connection invites addressed to this user — they were invited AFTER
  // already having an account, so the signup trigger never auto-claimed them and
  // (if they didn't get/open the email) they'd otherwise stay unlinked. Surfaced
  // as a confirmation banner; Accept routes through /invite to run the real claim.
  // While impersonating, show the IMPERSONATED user's pending invites (read-only)
  // so an admin can troubleshoot "did my invite land?" without logging in as them.
  // Keyed on the target's email, not the admin's; Accept is suppressed in the banner.
  const pendingInvites = await getPendingInvitesForEmail(imp ? profile?.email : user.email)

  // Zero assignments ever → skip the empty list and drop them straight on the
  // new-assignment page. But keep them here if they have a pending invite to
  // accept. (Not while impersonating — admin views the real state.)
  if (!imp && (sessions?.length ?? 0) === 0 && pendingInvites.length === 0) redirect('/assignment/new')

  // Per-assignment teachers (for the assignment cards). "Who can see your work"
  // is stated on the student's own /profile (the Parents section) rather than
  // hovering over the assignments here — a watcher line on the work surface read
  // as surveillance.
  const sessionIds = (sessions ?? []).map(s => s.id)
  const { data: teacherRows } = sessionIds.length
    ? await service.from('assignment_teachers').select('session_id, teacher_id, profiles(full_name)').in('session_id', sessionIds)
    : { data: [] }

  const teachersBySession = {}
  for (const r of (teacherRows ?? [])) {
    (teachersBySession[r.session_id] ??= []).push({ id: r.teacher_id, name: r.profiles?.full_name ?? 'Teacher' })
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>
      {imp && <ImpersonationBanner name={imp.name} role={imp.role} />}

      {/* While impersonating, the navbar shows the IMPERSONATED user (avatar + role
          nav), so a troubleshooting admin sees what the user sees. `user` stays the
          admin's real auth session (the cross-tab identity guard keys on it). */}
      <Navbar user={user} profile={imp ? profile : adminProfile} />

      <main style={{ maxWidth: 'var(--width-prose)' }} className="mx-auto px-6 py-12">
        <PendingInviteBanner invites={pendingInvites} readOnly={!!imp} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between" style={{ marginBottom: 'var(--space-6)' }}>
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

        {/* Writing Gym — a distinct low-stakes practice mode, given its own weight
            (a full-width banner) so it reads as separate from high-stakes assignments.
            Warm --surface-spark card = soft brand color; navy button ≠ the orange
            "New assignment" primary CTA, so it's prominent-but-secondary, not competing. */}
        {!imp && (
          <a href="/gym"
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between transition hover:opacity-95"
            style={{ backgroundColor: 'var(--surface-spark)', border: '1.5px solid var(--border-accent)', borderRadius: 'var(--radius-md)', padding: 'var(--space-5)', marginBottom: 'var(--space-5)', textDecoration: 'none' }}>
            <div className="flex items-center gap-3">
              <span className="shrink-0 flex items-center justify-center"
                style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-accent)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6.5 6.5h11M6.5 17.5h11M4 9v6M20 9v6M4 12h16"/>
                </svg>
              </span>
              <div>
                <p style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--text-strong)', margin: 0 }}>
                  Want to sharpen your skills?
                </p>
                <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  Build your confidence with quick exercises in the Skill Studio.
                </p>
              </div>
            </div>
            <span className="shrink-0 inline-flex items-center justify-center gap-1.5"
              style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--bg-page)', backgroundColor: 'var(--text-strong)', borderRadius: 'var(--radius-pill)', padding: '10px 18px' }}>
              Enter Skill Studio →
            </span>
          </a>
        )}

        <SessionsList
          sessions={sessions ?? []}
          teachersBySession={teachersBySession}
          canManage={!imp}
          canInvite={true}
        />
      </main>
    </div>
  )
}
