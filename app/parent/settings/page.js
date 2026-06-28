import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import ParentSettings from '@/components/ParentSettings'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import { getImpersonation } from '@/lib/impersonation'
import { MAX_CHILDREN_PER_PARENT, MAX_PARENTS_PER_CHILD } from '@/lib/relationships'

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
    const [{ data: kids }, { data: allRels }] = await Promise.all([
      service.from('profiles')
        .select('id, full_name, email, avatar_url, age_bracket, birthdate, coppa_consent_parent_id')
        .in('id', studentIds),
      // Count how many parents each child has, to gate the co-parent invite at the
      // 2-per-child cap (service client so the count isn't clipped by RLS, which
      // only shows the caller's own side of relationships).
      service.from('relationships').select('student_id').in('student_id', studentIds),
    ])
    const parentCount = {}
    for (const r of allRels ?? []) parentCount[r.student_id] = (parentCount[r.student_id] ?? 0) + 1

    children = (kids ?? []).map(c => ({
      ...c,
      // A co-parent may be invited only by the child's recorded consenting
      // guardian (under-13), and only while under the per-child parent cap.
      canAddCoParent:
        c.age_bracket === 'under13' &&
        c.coppa_consent_parent_id === targetId &&
        (parentCount[c.id] ?? 0) < MAX_PARENTS_PER_CHILD,
      // The birthdate endpoint restricts gate writes to the recorded consenting
      // guardian, or — if none recorded yet — any linked parent (bootstrap). So
      // a co-parent who isn't the guardian sees the birthday read-only; offering
      // an Edit button would only 403 (auth/coppa 739178b).
      canEditBirthdate: !c.coppa_consent_parent_id || c.coppa_consent_parent_id === targetId,
    }))
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
