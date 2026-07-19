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

  if (!imp && adminProfile?.role !== 'parent' && adminProfile?.role !== 'admin') redirect('/folder')

  const service = imp ? createServiceClient() : supabase

  // The profile we're viewing as (the impersonated parent, or the real user).
  const { data: profile } = await service
    .from('profiles').select('role, full_name, email, avatar_url, birthdate, phone, coparent_of').eq('id', targetId).single()

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

  // Pending child-invites this parent has generated but no child has claimed yet.
  // Surfaced so "I added a child" doesn't read as "0 linked / nothing happened" —
  // the link is shareable again and the state is visible until the child signs in.
  // Service client + an explicit invited_by filter: the parent owns these rows, so
  // this can't leak anyone else's invites, and it isn't clipped by invites RLS.
  const invSvc = createServiceClient()
  const { data: pendingRaw } = await invSvc
    .from('invites')
    .select('id, email, token, created_at, expires_at')
    .eq('invited_by', targetId)
    .eq('role', 'student')
    .is('claimed_at', null)
    .order('created_at', { ascending: false })
  const pendingInvites = pendingRaw ?? []

  // Co-parents this parent has invited (to list), and — if the viewer is themselves
  // a co-parent — the primary parent they mirror (for the "you can't add children"
  // notice). Service client + explicit owner filter, like pendingInvites above.
  const { data: coParents } = await invSvc
    .from('profiles').select('id, full_name, email, avatar_url').eq('coparent_of', targetId)
  let primaryParentName = null
  if (profile?.coparent_of) {
    const { data: primary } = await invSvc
      .from('profiles').select('full_name, email').eq('id', profile.coparent_of).single()
    primaryParentName = primary?.full_name || primary?.email || 'the primary parent'
  }

  return (
    <>
      {imp && <ImpersonationBanner name={imp.name} role={imp.role} />}
      <ParentSettings
        user={user}
        profile={profile}
        viewerId={targetId}
        children={children}
        pendingInvites={pendingInvites}
        coParents={coParents ?? []}
        coparentOf={profile?.coparent_of ?? null}
        primaryParentName={primaryParentName}
        maxChildren={MAX_CHILDREN_PER_PARENT}
        impersonating={!!imp}
      />
    </>
  )
}
