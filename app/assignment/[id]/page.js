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
    .from('profiles').select('full_name, role').eq('id', user.id).single()

  const imp = await getImpersonation(adminProfile)

  // When impersonating, use the service client so RLS doesn't block the impersonated user's data
  const service = imp ? createServiceClient() : supabase
  const effectiveUserId = imp?.userId ?? user.id

  const [{ data: session }, { data: profile }] = await Promise.all([
    service.from('sessions').select('*').eq('id', id).single(),
    imp
      ? service.from('profiles').select('full_name, role').eq('id', effectiveUserId).single()
      : Promise.resolve({ data: adminProfile }),
  ])

  const role = imp ? 'student' : adminProfile?.role
  const isAdmin   = !imp && role === 'admin'
  const isStudent = imp ? true : role === 'student' && session?.student_id === user.id
  const isTeacher = !imp && role === 'teacher'

  // If RLS blocked the session fetch or user has no valid role for this page
  if (!session) {
    redirect(role === 'teacher' ? '/teacher' : role === 'parent' ? '/parent' : '/dashboard')
  }
  if (!isAdmin && !isStudent && !isTeacher) {
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

  // Sidebar: student's own sessions
  const [{ data: allSessions }, { data: scaffoldData }] = await Promise.all([
    service
      .from('sessions')
      .select('id, assignment_text, persona, created_at, updated_at, status, subject, subject_custom_label')
      .eq('student_id', session.student_id)
      .order('created_at', { ascending: false }),
    service
      .from('paragraph_scaffolds')
      .select('*')
      .eq('session_id', id)
      .single(),
  ])

  // Build teacher name map for sidebar — only the current session has resolved names
  // (joining profiles for other sessions is blocked by RLS on the user client)
  const teacherBySession = {}
  for (const row of (assignmentTeachers ?? [])) {
    if (!teacherBySession[id]) {
      teacherBySession[id] = row.profiles?.full_name ?? null
    }
  }

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  return (
    <TutorSession
      session={session}
      initialMessages={messages ?? []}
      initialParagraphs={paragraphs ?? []}
      initialScaffold={scaffoldData ?? null}
      studentName={firstName}
      allSessions={(allSessions ?? []).map(s => ({ ...s, teacherName: teacherBySession[s.id] ?? null }))}
      initialTeachers={(assignmentTeachers ?? []).map(t => ({ id: t.teacher_id, name: t.profiles?.full_name ?? null }))}
      user={user}
      profile={profile}
    />
  )
}
