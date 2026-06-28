import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import ParentSettings from '@/components/ParentSettings'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import { getImpersonation } from '@/lib/impersonation'
import { MAX_CHILDREN_PER_PARENT } from '@/lib/relationships'

// Canonical parent account home. The dashboard (/parent) focuses on the
// children's writing; account + relationship management lives here.
export default async function ParentSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: adminProfile } = await supabase
    .from('profiles').select('role, full_name, email, avatar_url').eq('id', user.id).single()

  const imp = await getImpersonation(adminProfile)
  const targetId = imp?.userId ?? user.id

  if (!imp && adminProfile?.role !== 'parent' && adminProfile?.role !== 'admin') redirect('/dashboard')

  const service = imp ? createServiceClient() : supabase

  // The profile we're viewing as (the impersonated parent, or the real user).
  const { data: profile } = await service
    .from('profiles').select('role, full_name, email, avatar_url, birthdate').eq('id', targetId).single()

  const { data: rels } = await service
    .from('relationships').select('student_id').eq('watcher_id', targetId)
  const studentIds = rels?.map(r => r.student_id) ?? []

  let children = []
  if (studentIds.length > 0) {
    const { data } = await service
      .from('profiles')
      .select('id, full_name, email, avatar_url, age_bracket, birthdate')
      .in('id', studentIds)
    children = data ?? []
  }

  return (
    <>
      {imp && <ImpersonationBanner name={imp.name} role={imp.role} />}
      <ParentSettings
        user={user}
        profile={profile}
        viewerId={targetId}
        children={children}
        maxChildren={MAX_CHILDREN_PER_PARENT}
        impersonating={!!imp}
      />
    </>
  )
}
