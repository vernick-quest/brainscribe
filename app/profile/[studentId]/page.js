import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import WritingProfileCard from '@/components/WritingProfileCard'
import { getSubject } from '@/lib/subjects'
import { getImpersonation } from '@/lib/impersonation'

// Read-only view of a STUDENT'S profile, for a linked watcher (parent/teacher)
// or an admin. Mirrors the writing stats + writing profile from /profile, but
// drops the account form and the parents/invite section (those are the student's
// own). Access is granted by an explicit relationship — never by guessing an id.
export default async function StudentProfilePage({ params }) {
  const { studentId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: adminProfile } = await supabase
    .from('profiles').select('role, full_name').eq('id', user.id).single()

  const imp = await getImpersonation(adminProfile)
  const viewerId = imp?.userId ?? user.id
  const viewerRole = imp ? imp.role : adminProfile?.role

  // Service client — used for membership checks and data fetch once access is
  // confirmed (the relationship/link rows + the student's sessions sit behind RLS).
  const service = createServiceClient()

  // ── Access control ───────────────────────────────────────────
  let allowed = false
  if (!imp && adminProfile?.role === 'admin') {
    allowed = true
  } else if (viewerRole === 'parent') {
    const { data } = await service
      .from('relationships').select('student_id')
      .eq('watcher_id', viewerId).eq('student_id', studentId).limit(1)
    allowed = (data?.length ?? 0) > 0
  } else if (viewerRole === 'teacher') {
    const { data: links } = await service
      .from('assignment_teachers').select('session_id').eq('teacher_id', viewerId)
    const sessionIds = links?.map(l => l.session_id) ?? []
    if (sessionIds.length > 0) {
      const { data } = await service
        .from('sessions').select('id').eq('student_id', studentId).in('id', sessionIds).limit(1)
      allowed = (data?.length ?? 0) > 0
    }
  }

  if (!allowed) {
    redirect(viewerRole === 'teacher' ? '/teacher' : viewerRole === 'parent' ? '/parent' : '/dashboard')
  }

  // ── Data ─────────────────────────────────────────────────────
  const [
    { data: student },
    { count: sessionCount },
    { count: completeCount },
    { data: latestComplete },
    { data: subjectRows },
  ] = await Promise.all([
    service.from('profiles').select('full_name').eq('id', studentId).single(),
    service.from('sessions').select('id', { count: 'exact', head: true }).eq('student_id', studentId),
    service.from('sessions').select('id', { count: 'exact', head: true }).eq('student_id', studentId).eq('status', 'complete'),
    service.from('sessions').select('writing_profile').eq('student_id', studentId).eq('status', 'complete').not('writing_profile', 'is', null).order('updated_at', { ascending: false }).limit(1).single(),
    service.from('sessions').select('subject, subject_custom_label').eq('student_id', studentId),
  ])

  const writingProfile = latestComplete?.writing_profile ?? null
  const studentName = student?.full_name ?? 'Student'
  const firstName = studentName.split(' ')[0]

  const subjectCounts = {}
  for (const s of (subjectRows ?? [])) {
    const key = s.subject === 'other'
      ? (s.subject_custom_label || 'Other')
      : s.subject === 'unspecified' || !s.subject
        ? 'Unspecified'
        : (getSubject(s.subject)?.label ?? s.subject)
    subjectCounts[key] = (subjectCounts[key] ?? 0) + 1
  }
  const subjectBreakdown = Object.entries(subjectCounts)
    .filter(([key]) => key !== 'Unspecified')
    .sort((a, b) => b[1] - a[1])

  const backHref = viewerRole === 'teacher' ? '/teacher' : viewerRole === 'parent' ? '/parent' : '/dashboard'

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>
      <Navbar user={user} profile={adminProfile} />

      <main className="max-w-xl mx-auto px-6 py-10 space-y-8">

        <div>
          <a href={backHref}
            className="inline-flex items-center gap-1.5 text-xs font-medium mb-4 transition hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back
          </a>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
            {firstName}&apos;s writing
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Progress and writing profile.
          </p>
        </div>

        {/* Writing stats */}
        <div className="rounded-2xl p-6 space-y-5"
          style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Writing stats
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl p-4 text-center"
              style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-default)' }}>
              <p className="text-3xl font-bold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
                {sessionCount ?? 0}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Assignments started</p>
            </div>
            <div className="rounded-xl p-4 text-center"
              style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-default)' }}>
              <p className="text-3xl font-bold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
                {completeCount ?? 0}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Completed</p>
            </div>
          </div>

          {subjectBreakdown.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold" style={{ color: 'var(--text-subtle)' }}>By subject</p>
              {subjectBreakdown.map(([label, count]) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-muted)' }}>
                    <div className="h-full rounded-full"
                      style={{ width: `${Math.round((count / (sessionCount ?? 1)) * 100)}%`, backgroundColor: 'var(--accent)', opacity: 0.8 }} />
                  </div>
                  <span className="text-xs shrink-0" style={{ color: 'var(--text-body)', minWidth: 80 }}>{label}</span>
                  <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--text-strong)', minWidth: 20, textAlign: 'right' }}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Writing profile */}
        <div className="rounded-2xl p-6"
          style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <h2 className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: 'var(--text-muted)' }}>
            Writing profile
          </h2>
          <WritingProfileCard
            profile={writingProfile}
            sessionComplete={(completeCount ?? 0) > 0}
            studentName={firstName}
          />
        </div>

      </main>
    </div>
  )
}
