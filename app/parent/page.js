import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import ParentDashboard from '@/components/ParentDashboard'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import { getImpersonation } from '@/lib/impersonation'
import { getPendingInvitesForEmail } from '@/lib/pendingInvites'
import { computeActualFromDraft } from '@/lib/requirements'

// Freshen the per-assignment word/paragraph readout for IN-PROGRESS sessions
// with a stored target. `sessions.requirements.actual` is only snapshotted when a
// paragraph is saved/completed, so during early WIP (student has locked scaffold
// components but assembled no paragraph yet) it reads 0 — the parent sees
// "0 of 250" while the child is clearly working. Recompute from the live draft
// (paragraphs → scaffold fallback), the same source the transcript uses. Reads are
// RLS-gated (scaffold_watcher_read, migration 048) for a real parent; service-role
// while impersonating. Never lowers a good stored count (draft-aware max-keeps it).
async function withWipActuals(client, sessions) {
  const wip = (sessions ?? []).filter(
    s => s.status !== 'complete' && (s.requirements?.targets?.length ?? 0) > 0
  )
  if (wip.length === 0) return sessions
  const { data: scaffolds } = await client
    .from('paragraph_scaffolds').select('session_id, components')
    .in('session_id', wip.map(s => s.id))
  const bySession = new Map((scaffolds ?? []).map(r => [r.session_id, r.components]))
  const wipIds = new Set(wip.map(s => s.id))
  return (sessions ?? []).map(s => {
    if (!wipIds.has(s.id)) return s
    // No paragraphs table read here — computeActualFromDraft falls back to the
    // scaffold; the stored actual already reflects any assembled paragraphs, so
    // keep whichever count is larger (never regress a good snapshot).
    const draftActual = computeActualFromDraft([], bySession.get(s.id))
    const stored = s.requirements.actual ?? { words: 0, paragraphs: 0 }
    const actual = {
      words: Math.max(stored.words ?? 0, draftActual.words),
      paragraphs: Math.max(stored.paragraphs ?? 0, draftActual.paragraphs),
    }
    return { ...s, requirements: { ...s.requirements, actual } }
  })
}

export default async function ParentDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: adminProfile } = await supabase
    .from('profiles').select('role, full_name, email, onboarding_complete').eq('id', user.id).single()

  const imp = await getImpersonation(adminProfile)
  const targetId = imp?.userId ?? user.id

  if (!imp && adminProfile?.role !== 'parent' && adminProfile?.role !== 'admin') redirect('/folder')

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
        .select('id, title, assignment_text, status, persona, created_at, updated_at, completed_at, last_active_at, student_id, writing_profile, subject, subject_custom_label, requirements')
        .in('student_id', studentIds)
        .order('last_active_at', { ascending: false, nullsFirst: false })
        .limit(100),
    ])
    children = profileData ?? []
    sessions = await withWipActuals(service, sessionData ?? [])
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
    .select('id, title, assignment_text, status, persona, created_at, updated_at, completed_at, last_active_at, is_onboarding, subject, subject_custom_label, requirements')
    .eq('student_id', targetId)
    .order('last_active_at', { ascending: false, nullsFirst: false })
    .limit(20)
  const ownSessions = await withWipActuals(
    service, (ownSessionData ?? []).filter(s => !s.is_onboarding)
  )

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
