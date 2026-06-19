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
            className="inline-flex items-center gap-1.5 text-xs font-medium mb-4 transition hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            My assignments
          </a>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-strong)' }}>New assignment</h1>
          <p className="mt-1" style={{ color: 'var(--text-muted)', font: 'var(--type-lead)' }}>
            Add your assignment, pick the coach who fits it best, and we'll take it from there.
          </p>
        </div>
        {ageOk ? <NewSessionForm /> : <WriteAgeGate role={profile?.role} />}
      </main>
    </div>
  )
}
