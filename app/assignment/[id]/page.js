import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import TutorSession from '@/components/TutorSession'
import TeacherAssignmentView from '@/components/TeacherAssignmentView'
import { getImpersonation } from '@/lib/impersonation'

export default async function AssignmentPage({ params }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: adminProfile } = await supabase
    .from('profiles').select('full_name, role, onboarding_complete, avatar_url, age_bracket').eq('id', user.id).single()

  const imp = await getImpersonation(adminProfile)

  // When impersonating, use the service client so RLS doesn't block the impersonated user's data
  const service = imp ? createServiceClient() : supabase
  const effectiveUserId = imp?.userId ?? user.id

  const [{ data: session }, { data: profile }] = await Promise.all([
    service.from('sessions').select('*').eq('id', id).single(),
    imp
      ? service.from('profiles').select('full_name, role, onboarding_complete').eq('id', effectiveUserId).single()
      : Promise.resolve({ data: adminProfile }),
  ])

  const role = imp ? 'student' : adminProfile?.role
  // The writer experience is granted by OWNERSHIP, not role — a parent or teacher
  // who owns this session writes in it exactly like a student. A teacher only gets
  // the read-only view when watching SOMEONE ELSE'S session (i.e. not the owner).
  const isOwner   = imp ? true : session?.student_id === user.id
  const isAdmin   = !imp && role === 'admin'
  const isTeacher = !imp && role === 'teacher' && !isOwner

  // If RLS blocked the session fetch or user has no valid claim to this page
  if (!session) {
    redirect(role === 'teacher' ? '/teacher' : role === 'parent' ? '/parent' : '/dashboard')
  }
  if (!isOwner && !isAdmin && !isTeacher) {
    redirect('/dashboard')
  }

  // ── Teacher read-only view ───────────────────────────────────
  if (isTeacher) {
    const [{ data: messages }, { data: paragraphs }, { data: studentProfile }] = await Promise.all([
      supabase
        .from('messages')
        .select('role, content, created_at')
        .eq('session_id', id)
        .order('created_at'),
      supabase
        .from('paragraphs')
        .select('*')
        .eq('session_id', id)
        .order('position'),
      supabase
        .from('profiles')
        .select('full_name, avatar_url, age_bracket')
        .eq('id', session.student_id)
        .single(),
    ])

    return (
      <TeacherAssignmentView
        session={session}
        messages={messages ?? []}
        paragraphs={paragraphs ?? []}
        studentName={studentProfile?.full_name ?? 'Student'}
        studentAvatarUrl={studentProfile?.avatar_url ?? null}
        studentAgeBracket={studentProfile?.age_bracket ?? null}
        user={user}
        teacherProfile={profile}
        writingProfile={session.writing_profile ?? null}
      />
    )
  }

  // ── Student / admin: full TutorSession ───────────────────────
  const { data: messages } = await service
    .from('messages')
    .select('role, content')
    .eq('session_id', id)
    .order('created_at')

  const { data: paragraphs } = await service
    .from('paragraphs')
    .select('*')
    .eq('session_id', id)
    .order('position')

  // Linked teachers for this assignment
  const { data: assignmentTeachers } = await service
    .from('assignment_teachers')
    .select('teacher_id, profiles(full_name)')
    .eq('session_id', id)

  // Scaffold for the active paragraph.
  const { data: scaffoldData } = await service
    .from('paragraph_scaffolds')
    .select('*')
    .eq('session_id', id)
    .single()

  // Name + onboarding flag come from the SESSION OWNER, never from whoever the admin
  // is currently remoted into — a stale remote-in must never relabel someone else's
  // session (this is how a friend's practice once got greeted with another kid's name).
  const { data: ownerProfile } = await service
    .from('profiles')
    .select('full_name')
    .eq('id', session.student_id)
    .single()

  const firstName = ownerProfile?.full_name?.split(' ')[0] ?? 'there'

  // A practice session is ALWAYS the hook-only onboarding experience (banner, exit
  // control, fixed-Owen, reveal handoff). The server (/api/tutor) keys the hook-only
  // coach prompt off `is_onboarding` alone, so the client UI must use the same signal —
  // otherwise a re-entered practice session gets a hook-only coach inside a full
  // normal-mode UI (wrong greeting, no banner, completion routed to the transcript).
  const onboardingMode = session.is_onboarding === true

  // The writing view is active-only: a completed assignment reopens at its canonical
  // end-state page (/transcript). Exempt the live FTUE tour — the practice run must
  // stay in TutorSession until the student reaches the finale (which sets
  // onboarding_complete and then routes through /transcript?onboarding=1 itself).
  // Teachers never reach here (read-only branch returned above); completion mid-session
  // is client-side in TutorSession, so this only bites on a fresh load/reopen.
  if (isOwner && session.status === 'complete' && !onboardingMode) {
    redirect(`/transcript/${id}`)
  }

  return (
    <TutorSession
      session={session}
      initialMessages={messages ?? []}
      initialParagraphs={paragraphs ?? []}
      initialScaffold={scaffoldData ?? null}
      studentName={firstName}
      initialTeachers={(assignmentTeachers ?? []).map(t => ({ id: t.teacher_id, name: t.profiles?.full_name ?? null }))}
      user={user}
      profile={profile}
      onboarding={onboardingMode}
      impersonation={imp ? { name: imp.name, role: imp.role } : null}
    />
  )
}
