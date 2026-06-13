import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import AdminDashboard from '@/components/AdminDashboard'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, email')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  // Use service client to bypass RLS — admin sees everything
  const service = createServiceClient()

  const [
    { data: allProfiles },
    { data: allSessions },
    { data: allRelationships },
    { data: allAssignmentTeachers },
  ] = await Promise.all([
    service.from('profiles').select('id, full_name, email, role, created_at, sessions_used').order('role').order('created_at'),
    service.from('sessions').select('id, title, assignment_text, status, student_id, persona, created_at, updated_at').order('updated_at', { ascending: false }),
    service.from('relationships').select('watcher_id, student_id'),
    service.from('assignment_teachers').select('session_id, teacher_id'),
  ])

  return (
    <AdminDashboard
      currentUser={user}
      currentProfile={profile}
      profiles={allProfiles ?? []}
      sessions={allSessions ?? []}
      relationships={allRelationships ?? []}
      assignmentTeachers={allAssignmentTeachers ?? []}
    />
  )
}
