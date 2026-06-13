import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import ParentDashboard from '@/components/ParentDashboard'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import { getImpersonation } from '@/lib/impersonation'

export default async function ParentDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: adminProfile } = await supabase
    .from('profiles').select('role, full_name, email').eq('id', user.id).single()

  const imp = await getImpersonation(adminProfile)
  const targetId = imp?.userId ?? user.id

  if (!imp && adminProfile?.role !== 'parent' && adminProfile?.role !== 'admin') redirect('/dashboard')

  const service = imp ? createServiceClient() : supabase

  // Fetch the profile we're viewing as
  const { data: profile } = await service
    .from('profiles').select('role, full_name').eq('id', targetId).single()

  const { data: rels } = await service
    .from('relationships').select('student_id').eq('watcher_id', targetId)

  const studentIds = rels?.map(r => r.student_id) ?? []

  let children = []
  let sessions = []

  if (studentIds.length > 0) {
    const [{ data: profileData }, { data: sessionData }] = await Promise.all([
      service.from('profiles').select('id, full_name, email').in('id', studentIds),
      service.from('sessions')
        .select('id, title, assignment_text, status, persona, created_at, updated_at, student_id, writing_profile, subject, subject_custom_label')
        .in('student_id', studentIds)
        .order('updated_at', { ascending: false }),
    ])
    children = profileData ?? []
    sessions = sessionData ?? []
  }

  return (
    <>
      {imp && <ImpersonationBanner name={imp.name} role={imp.role} />}
      <ParentDashboard
        user={user}
        profile={profile}
        children={children}
        sessions={sessions}
      />
    </>
  )
}
