import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import TeacherDashboard from '@/components/TeacherDashboard'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import { getImpersonation } from '@/lib/impersonation'
import { getPendingInvitesForEmail } from '@/lib/pendingInvites'

export default async function TeacherDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: adminProfile } = await supabase
    .from('profiles').select('role, full_name, onboarding_complete').eq('id', user.id).single()

  const imp = await getImpersonation(adminProfile)
  const targetId = imp?.userId ?? user.id

  if (!imp && adminProfile?.role !== 'teacher' && adminProfile?.role !== 'admin') redirect('/dashboard')

  // First-time teacher: run them through onboarding once (they can opt out of the practice).
  if (!imp && adminProfile?.role === 'teacher' && !adminProfile?.onboarding_complete) redirect('/onboarding')

  const service = imp ? createServiceClient() : supabase

  const { data: profile } = await service
    .from('profiles').select('role, full_name, avatar_url, age_bracket, email').eq('id', targetId).single()

  // All session IDs this teacher has been added to
  const { data: teacherLinks } = await service
    .from('assignment_teachers').select('session_id').eq('teacher_id', targetId)

  const sessionIds = teacherLinks?.map(l => l.session_id) ?? []

  let sessions = []
  let students = []

  if (sessionIds.length > 0) {
    const { data: sessionData } = await service
      .from('sessions')
      .select('id, title, assignment_text, status, persona, created_at, updated_at, completed_at, student_id, subject, subject_custom_label, requirements')
      .in('id', sessionIds)
      .order('updated_at', { ascending: false })
      .limit(100)

    sessions = sessionData ?? []

    const studentIds = [...new Set(sessions.map(s => s.student_id))]
    if (studentIds.length > 0) {
      const { data: studentData } = await service
        .from('profiles').select('id, full_name, email, avatar_url, age_bracket').in('id', studentIds)
      students = studentData ?? []
    }
  }

  // Notifications for the target teacher
  const { data: notifications } = await service
    .from('teacher_notifications')
    .select('id, type, message, read, created_at, session_id')
    .eq('teacher_id', targetId)
    .order('created_at', { ascending: false })
    .limit(30)

  // The teacher's OWN writing (they can use the coaches too) — separate from the
  // assignments they review, and excluding any practice/onboarding run.
  const { data: ownSessionData } = await service
    .from('sessions')
    .select('id, title, assignment_text, status, persona, updated_at, is_onboarding')
    .eq('student_id', targetId)
    .order('updated_at', { ascending: false })
    .limit(20)
  const ownSessions = (ownSessionData ?? []).filter(s => !s.is_onboarding)

  // Pending connection invites (e.g. a student added this teacher — who already
  // had an account — to an assignment). Surfaced as a confirmation banner; Accept
  // routes through /invite which runs the real claim guards. Not while impersonating.
  // Impersonating → show the target's pending invites read-only (troubleshooting).
  const pendingInvites = await getPendingInvitesForEmail(imp ? profile?.email : user.email)

  return (
    <>
      {imp && <ImpersonationBanner name={imp.name} role={imp.role} />}
      <TeacherDashboard
        user={user}
        profile={profile}
        students={students}
        sessions={sessions}
        notifications={notifications ?? []}
        ownSessions={ownSessions}
        pendingInvites={pendingInvites}
        impersonating={!!imp}
      />
    </>
  )
}
