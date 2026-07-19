import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NewSessionForm from '@/components/NewSessionForm'
import Navbar from '@/components/Navbar'
import WriteAgeGate from '@/components/WriteAgeGate'
import { getImpersonation } from '@/lib/impersonation'

// Canonical "new assignment" page. Decoupled from the assignments list so a
// student with no work lands straight here, and the dashboard's "New assignment"
// button points at it. Works for ANY role (parent/teacher write their own too);
// access to the coach is granted by ownership downstream — this page only gates
// on the 13+/consent age check. (/write is kept as an alias that redirects here.)
export default async function NewAssignmentPage({ searchParams }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, age_bracket, avatar_url, coppa_consent_required, coppa_consent_given')
    .eq('id', user.id)
    .single()

  // Admin remote-in is view + link only. Creating an assignment is a data-writing
  // act as the user, so an impersonating admin never reaches the form — send them
  // back to the impersonated user's own home (POST /api/sessions also 403s the write
  // as a server backstop). Checked before the generic admin redirect so the remoted-in
  // case lands in the user's context, not /admin. getImpersonation only honours the
  // cookie for a real admin.
  const imp = await getImpersonation(profile)
  if (imp) {
    const home = imp.role === 'parent' ? '/parent' : imp.role === 'teacher' ? '/teacher' : '/folder'
    redirect(home)
  }

  if (profile?.role === 'admin') redirect('/admin')

  // Under-13 students must finish parental consent first (same gate as elsewhere).
  if (profile?.coppa_consent_required && !profile?.coppa_consent_given) redirect('/coppa/pending')

  const ageOk = profile?.age_bracket === '13plus' || profile?.coppa_consent_given === true

  // Head Grader "work on this with your coach" prefill: ?revise=<sessionId>&gap=<i>
  // opens a NEW session on the same assignment, optionally oriented toward one
  // rubric criterion (the rubric's own words — never a suggestion). Everything is
  // read under RLS, so a crafted id only prefills work the caller may already see;
  // any failure falls back to a blank form.
  let initialAssignmentText = ''
  let initialFocus = ''
  const reviseId = typeof sp?.revise === 'string' ? sp.revise : ''
  if (reviseId) {
    const { data: prior } = await supabase
      .from('sessions').select('assignment_text, student_id').eq('id', reviseId).single()
    if (prior?.assignment_text && prior.student_id === user.id) {
      initialAssignmentText = prior.assignment_text
      const gapIdx = Number.parseInt(sp?.gap, 10)
      if (Number.isInteger(gapIdx) && gapIdx >= 0) {
        const { data: rubricRow } = await supabase
          .from('rubrics').select('feedback_text').eq('session_id', reviseId).single()
        try {
          const env = rubricRow?.feedback_text ? JSON.parse(rubricRow.feedback_text) : null
          const crit = env?.v === 1 ? env.review?.criteria?.[gapIdx] : null
          // Only the criterion's own text (verbatim from the rubric) — no gap
          // note, no advice — becomes the coach's orienting focus line.
          if (crit?.criterion) initialFocus = crit.criterion
        } catch { /* unparseable review — no focus, just the assignment */ }
      }
    }
  }

  // Where the back-link returns to — the role's assignments home.
  const listHref = profile?.role === 'parent' ? '/parent' : profile?.role === 'teacher' ? '/teacher' : '/folder'

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
            Folder
          </a>
          <h1 style={{ font: 'var(--type-title)', color: 'var(--text-strong)', margin: '0 0 4px' }}>Start a new assignment</h1>
          <p style={{ font: 'var(--type-lead)', color: 'var(--text-muted)', margin: 0 }}>
            Add your assignment and pick the coach who fits it best — we&apos;ll take it from there.
          </p>
        </div>
        {ageOk
          ? <NewSessionForm initialAssignmentText={initialAssignmentText} initialFocus={initialFocus} />
          : <WriteAgeGate role={profile?.role} />}
      </main>
    </div>
  )
}
