import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import ParentDashboard from '@/components/ParentDashboard'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import { getImpersonation } from '@/lib/impersonation'
import { getPendingInvitesForEmail } from '@/lib/pendingInvites'

export default async function ParentDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: adminProfile } = await supabase
    .from('profiles').select('role, full_name, email, onboarding_complete').eq('id', user.id).single()

  const imp = await getImpersonation(adminProfile)
  const targetId = imp?.userId ?? user.id

  if (!imp && adminProfile?.role !== 'parent' && adminProfile?.role !== 'admin') redirect('/dashboard')

  // First-time parent: run them through onboarding once (they can opt out of the practice).
  if (!imp && adminProfile?.role === 'parent' && !adminProfile?.onboarding_complete) redirect('/onboarding')

  const service = imp ? createServiceClient() : supabase

  // Fetch the profile we're viewing as
  const { data: profile } = await service
    .from('profiles').select('role, full_name, birthdate, avatar_url, email').eq('id', targetId).single()

  const { data: rels } = await service
    .from('relationships').select('student_id').eq('watcher_id', targetId)

  const studentIds = rels?.map(r => r.student_id) ?? []

  let children = []
  let sessions = []

  if (studentIds.length > 0) {
    const [{ data: profileData }, { data: sessionData }] = await Promise.all([
      service.from('profiles').select('id, full_name, email, avatar_url, age_bracket, birthdate').in('id', studentIds),
      service.from('sessions')
        .select('id, title, assignment_text, status, persona, created_at, updated_at, completed_at, student_id, writing_profile, subject, subject_custom_label, requirements')
        .in('student_id', studentIds)
        .order('updated_at', { ascending: false })
        .limit(100),
    ])
    children = profileData ?? []
    sessions = sessionData ?? []
  }

  // Teachers added to each child's assignments, so the parent can see + manage
  // them. Two queries (not an embed) to avoid the dual-FK ambiguity on
  // assignment_teachers (teacher_id + added_by both reference profiles). The
  // teacher *profile* lookup uses the service client: RLS lets a parent read the
  // assignment_teachers rows but not a teacher's profile row, and the parent —
  // who invited the teacher by email — is entitled to see their name here.
  let teachersBySession = {}
  if (sessions.length > 0) {
    const elevated = imp ? service : createServiceClient()
    const { data: atRows } = await elevated
      .from('assignment_teachers')
      .select('session_id, teacher_id')
      .in('session_id', sessions.map(s => s.id))
    const teacherIds = [...new Set((atRows ?? []).map(r => r.teacher_id))]
    let teacherProfiles = {}
    if (teacherIds.length > 0) {
      const { data: tp } = await elevated
        .from('profiles').select('id, full_name, email').in('id', teacherIds)
      for (const p of tp ?? []) teacherProfiles[p.id] = p
    }
    for (const r of atRows ?? []) {
      (teachersBySession[r.session_id] ??= []).push(teacherProfiles[r.teacher_id] ?? { id: r.teacher_id })
    }
  }

  // The parent's OWN writing (they can use the coaches too) — separate from their
  // children's work, and excluding any practice/onboarding run.
  const { data: ownSessionData } = await service
    .from('sessions')
    .select('id, title, assignment_text, status, persona, created_at, updated_at, completed_at, is_onboarding, subject, subject_custom_label, requirements')
    .eq('student_id', targetId)
    .order('updated_at', { ascending: false })
    .limit(20)
  const ownSessions = (ownSessionData ?? []).filter(s => !s.is_onboarding)

  // Pending connection invites (e.g. a student invited this parent, who already
  // had an account). Surfaced as a confirmation banner. Not while impersonating.
  // Impersonating → show the target's pending invites read-only (troubleshooting).
  const pendingInvites = await getPendingInvitesForEmail(imp ? profile?.email : user.email)

  return (
    <>
      {imp && <ImpersonationBanner name={imp.name} role={imp.role} />}
      <ParentDashboard
        user={user}
        profile={profile}
        viewerId={targetId}
        children={children}
        sessions={sessions}
        teachersBySession={teachersBySession}
        ownSessions={ownSessions}
        pendingInvites={pendingInvites}
        impersonating={!!imp}
      />
    </>
  )
}
