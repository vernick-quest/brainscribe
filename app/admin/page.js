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
    .select('role, full_name, email, avatar_url')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/folder')

  // Use service client to bypass RLS — admin sees everything
  const service = createServiceClient()

  // login_count/last_login_at arrive with migration 059. Selecting a column that
  // doesn't exist yet fails the WHOLE profiles query, which would render an empty
  // admin panel between deploy and apply — so ask for them, and fall back to the
  // pre-059 column list if the DB doesn't have them yet.
  const PROFILE_COLS_BASE = 'id, full_name, email, role, created_at, sessions_used, onboarding_complete, age_bracket, coppa_consent_given, avatar_url, is_beta_circle'
  async function readProfiles() {
    const withLogins = await service.from('profiles')
      .select(`${PROFILE_COLS_BASE}, login_count, last_login_at`).order('role').order('created_at')
    if (!withLogins.error) return withLogins
    console.warn('[admin] login columns unavailable (migration 059 not applied yet):', withLogins.error.message)
    return service.from('profiles').select(PROFILE_COLS_BASE).order('role').order('created_at')
  }

  const [
    { data: allProfiles },
    { data: allSessions },
    { data: allRelationships },
    { data: allAssignmentTeachers },
    { data: auditFindings },
    authUsers,
  ] = await Promise.all([
    readProfiles(),
    service.from('sessions').select('id, title, assignment_text, status, student_id, persona, is_onboarding, created_at, updated_at, completed_at, last_active_at').order('updated_at', { ascending: false }),
    service.from('relationships').select('watcher_id, student_id'),
    service.from('assignment_teachers').select('session_id, teacher_id'),
    // Open guardrail-audit findings, for the per-student warning count. severity
    // 'none' rows are the clean-audit ledger, not warnings.
    service.from('transcript_audit_findings').select('session_id, student_id, severity, resolved'),
    // last_sign_in_at lives on auth.users, not profiles — reachable only through the
    // admin API. perPage covers the whole user base in one call today; if it ever
    // exceeds this the list simply truncates (sign-in shows as "—"), never errors.
    service.auth.admin.listUsers({ page: 1, perPage: 1000 }).catch(() => null),
  ])

  const lastSignInById = new Map(
    (authUsers?.data?.users ?? []).map(u => [u.id, u.last_sign_in_at ?? null])
  )

  // "Last seen" = the LATER of last authentication and last real activity.
  //
  // auth.users.last_sign_in_at only moves when someone completes a fresh sign-in.
  // Supabase refreshes the session token silently, so a user who stays logged in for
  // weeks keeps a stale timestamp: Baron last authenticated on 2026-07-22 and was
  // writing an hour ago, yet the column read "17 days" and sorted him near the bottom.
  // sessions.last_active_at IS touched on real coach/student turns (it is what the
  // assignment lists already sort by), so taking the max of the two makes the column
  // mean what it says — and makes the roster's "newest first" order true.
  const lastActiveById = new Map()
  for (const sess of allSessions ?? []) {
    const t = sess.last_active_at ?? sess.updated_at
    if (!t || !sess.student_id) continue
    const cur = lastActiveById.get(sess.student_id)
    if (!cur || new Date(t) > new Date(cur)) lastActiveById.set(sess.student_id, t)
  }
  const lastSeenById = new Map()
  for (const id of new Set([...lastSignInById.keys(), ...lastActiveById.keys()])) {
    const a = lastSignInById.get(id), b = lastActiveById.get(id)
    lastSeenById.set(id, !a ? (b ?? null) : !b ? a : (new Date(b) > new Date(a) ? b : a))
  }

  // Unresolved, non-'none' findings per student, split by weight so the UI can
  // colour a high-severity count differently from a low one.
  const warningsById = new Map()
  for (const f of auditFindings ?? []) {
    if (!f.student_id || f.resolved || f.severity === 'none') continue
    const w = warningsById.get(f.student_id) ?? { total: 0, high: 0 }
    w.total += 1
    if (f.severity === 'high') w.high += 1
    warningsById.set(f.student_id, w)
  }

  // Per-ASSIGNMENT warning counts, so an expanded student card can say which of
  // their assignments the finding is actually on rather than only that the student
  // has one somewhere.
  const warningsBySession = {}
  for (const f of auditFindings ?? []) {
    if (!f.session_id || f.resolved || f.severity === 'none') continue
    const w = warningsBySession[f.session_id] ?? { total: 0, high: 0 }
    w.total += 1
    if (f.severity === 'high') w.high += 1
    warningsBySession[f.session_id] = w
  }

  const profilesWithActivity = (allProfiles ?? []).map(p => ({
    ...p,
    // Kept for anything that genuinely wants "when did they authenticate".
    last_sign_in_at: lastSignInById.get(p.id) ?? null,
    // What the roster's "Last seen" column and its sort read.
    last_seen_at: lastSeenById.get(p.id) ?? null,
    audit_warnings: warningsById.get(p.id) ?? null,
  }))

  return (
    <AdminDashboard
      currentUser={user}
      currentProfile={profile}
      profiles={profilesWithActivity}
      sessions={allSessions ?? []}
      sessionWarnings={warningsBySession}
      relationships={allRelationships ?? []}
      assignmentTeachers={allAssignmentTeachers ?? []}
    />
  )
}
