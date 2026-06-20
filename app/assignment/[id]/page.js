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
    .from('profiles').select('full_name, role, onboarding_complete').eq('id', user.id).single()

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
        .select('full_name')
        .eq('id', session.student_id)
        .single(),
    ])

    return (
      <TeacherAssignmentView
        session={session}
        messages={messages ?? []}
        paragraphs={paragraphs ?? []}
        studentName={studentProfile?.full_name ?? 'Student'}
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
    .select('full_name, onboarding_complete')
    .eq('id', session.student_id)
    .single()

  const firstName = ownerProfile?.full_name?.split(' ')[0] ?? 'there'

  // Onboarding "practice mode" (banner, exit control) applies only while the OWNER is
  // still doing the tour. Once they've finished onboarding, a practice session opens
  // like any other completed assignment.
  const onboardingMode = session.is_onboarding === true && !ownerProfile?.onboarding_complete

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
    />
  )
}
