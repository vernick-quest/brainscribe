import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NewSessionForm from '@/components/NewSessionForm'
import Navbar from '@/components/Navbar'
import WriteAgeGate from '@/components/WriteAgeGate'

// Canonical "new assignment" page. Decoupled from the assignments list so a
// student with no work lands straight here, and the dashboard's "New assignment"
// button points at it. Works for ANY role (parent/teacher write their own too);
// access to the coach is granted by ownership downstream — this page only gates
// on the 13+/consent age check. (/write is kept as an alias that redirects here.)
export default async function NewAssignmentPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, age_bracket, coppa_consent_required, coppa_consent_given')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin')

  // Under-13 students must finish parental consent first (same gate as elsewhere).
  if (profile?.coppa_consent_required && !profile?.coppa_consent_given) redirect('/coppa/pending')

  const ageOk = profile?.age_bracket === '13plus' || profile?.coppa_consent_given === true

  // Where the back-link returns to — the role's assignments home.
  const listHref = profile?.role === 'parent' ? '/parent' : profile?.role === 'teacher' ? '/teacher' : '/dashboard'

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>
      <Navbar user={user} profile={profile} />
      <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        <div>
          <a href={listHref}
            className="inline-flex items-center gap-1.5 mb-4 transition hover:opacity-70"
            style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-muted)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
            Assignments
          </a>
          <h1 style={{ font: 'var(--type-title)', color: 'var(--text-strong)', margin: '0 0 4px' }}>Start a new assignment</h1>
          <p style={{ font: 'var(--type-lead)', color: 'var(--text-muted)', margin: 0 }}>
            Add your assignment and pick the coach who fits it best — we&apos;ll take it from there.
          </p>
        </div>
        {ageOk ? <NewSessionForm /> : <WriteAgeGate role={profile?.role} />}
      </main>
    </div>
  )
}
