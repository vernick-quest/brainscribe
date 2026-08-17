import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import AdminDashboard from '@/components/AdminDashboard'
import { attentionForStudent } from '@/lib/attention'

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

  // login_count/last_login_at arrive with 059, last_seen_at with 065. Selecting a
  // column that doesn't exist yet fails the WHOLE profiles query, which would render
  // an empty admin panel between deploy and apply — so ask for them, and fall back to
  // the base column list if the DB doesn't have them yet.
  const PROFILE_COLS_BASE = 'id, full_name, email, role, created_at, sessions_used, onboarding_complete, age_bracket, coppa_consent_given, avatar_url, is_beta_circle'
  async function readProfiles() {
    const withLogins = await service.from('profiles')
      .select(`${PROFILE_COLS_BASE}, login_count, last_login_at, last_seen_at`).order('role').order('created_at')
    if (!withLogins.error) return withLogins
    console.warn('[admin] login/presence columns unavailable (migration 059/065 not applied yet):', withLogins.error.message)
    return service.from('profiles').select(PROFILE_COLS_BASE).order('role').order('created_at')
  }

  const [
    { data: allProfiles },
    { data: allSessions },
    { data: allRelationships },
    { data: allAssignmentTeachers },
    { data: auditFindings },
    authUsers,
    healthRes,
    scaffoldRes,
  ] = await Promise.all([
    readProfiles(),
    service.from('sessions').select('id, title, assignment_text, status, student_id, persona, is_onboarding, created_at, updated_at, completed_at, last_active_at, lock_over_claims').order('updated_at', { ascending: false }),
    service.from('relationships').select('watcher_id, student_id'),
    service.from('assignment_teachers').select('session_id, teacher_id'),
    // Open guardrail-audit findings, for the per-student warning count. severity
    // 'none' rows are the clean-audit ledger, not warnings.
    service.from('transcript_audit_findings').select('session_id, student_id, severity, resolved'),
    // last_sign_in_at lives on auth.users, not profiles — reachable only through the
    // admin API. perPage covers the whole user base in one call today; if it ever
    // exceeds this the list simply truncates (sign-in shows as "—"), never errors.
    service.auth.admin.listUsers({ page: 1, perPage: 1000 }).catch(() => null),
    // Mechanical health findings (069). Fail-soft to [] so the roster still renders if
    // the table is missing — but note that means the column UNDER-reports rather than
    // erroring, so a read failure is logged loudly below.
    service.from('session_health_findings')
      .select('session_id, signal, severity, pre_existing, acknowledged, detail'),
    // Scaffold items carrying revisionRefused — the guard's record of a write it declined.
    service.from('paragraph_scaffolds').select('session_id, components'),
  ])

  if (healthRes?.error) console.error('[admin] session_health read failed — attention column will UNDER-report:', healthRes.error.message)
  if (scaffoldRes?.error) console.error('[admin] scaffold read failed — refused-revision signal missing:', scaffoldRes.error.message)

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
  // profiles.last_seen_at (migration 065) is the only true PRESENCE signal — stamped
  // by the session middleware on ordinary authenticated requests. The other two are
  // kept in the max() as a floor: last_seen_at starts accruing at deploy, and a
  // long-lived login that never re-authenticates would otherwise read as never-seen.
  const lastSeenById = new Map()
  const ids = new Set([
    ...lastSignInById.keys(), ...lastActiveById.keys(),
    ...(allProfiles ?? []).map(p => p.id),
  ])
  for (const id of ids) {
    const presence = (allProfiles ?? []).find(p => p.id === id)?.last_seen_at ?? null
    const candidates = [presence, lastSignInById.get(id), lastActiveById.get(id)].filter(Boolean)
    lastSeenById.set(id, candidates.length
      ? candidates.reduce((a, b) => (new Date(b) > new Date(a) ? b : a))
      : null)
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

  // ── The ⚠ column: everything that needs Robert, in one number ──────────────────
  // Every in-scope detector feeds this (see lib/attention.js for the design rule and
  // why the count is per-SESSION rather than per-finding).
  const sessionsByOwner = new Map()
  for (const s of allSessions ?? []) {
    if (!s.student_id) continue
    if (!sessionsByOwner.has(s.student_id)) sessionsByOwner.set(s.student_id, [])
    sessionsByOwner.get(s.student_id).push(s)
  }
  const healthByStudent = new Map()
  {
    const ownerOf = new Map((allSessions ?? []).map(s => [s.id, s.student_id]))
    for (const f of healthRes?.data ?? []) {
      const owner = ownerOf.get(f.session_id)
      if (!owner) continue
      if (!healthByStudent.has(owner)) healthByStudent.set(owner, [])
      healthByStudent.get(owner).push(f)
    }
  }
  const refusedBySession = new Map()
  for (const sc of scaffoldRes?.data ?? []) {
    const items = (Array.isArray(sc.components) ? sc.components : []).flatMap(c => (Array.isArray(c?.items) ? c.items : []))
    const refused = items.filter(i => i?.revisionRefused)
    if (refused.length) {
      refusedBySession.set(sc.session_id, {
        crossSection: refused.some(i => i.revisionRefused === 'cross-section'),
        kind: refused.some(i => i.revisionRefused === 'cross-section') ? 'cross-section' : 'inexact',
      })
    }
  }
  const attentionById = new Map()
  for (const p of allProfiles ?? []) {
    const mine = sessionsByOwner.get(p.id) ?? []
    attentionById.set(p.id, attentionForStudent({
      healthFindings: healthByStudent.get(p.id) ?? [],
      auditFindings: (auditFindings ?? []).filter(f => f.student_id === p.id),
      lockOverClaimSessions: mine.filter(s => Number(s.lock_over_claims) > 0)
        .map(s => ({ id: s.id, count: Number(s.lock_over_claims) })),
      refusedRevisionSessions: mine.filter(s => refusedBySession.has(s.id))
        .map(s => ({ id: s.id, ...refusedBySession.get(s.id) })),
    }))
  }

  const profilesWithActivity = (allProfiles ?? []).map(p => ({
    ...p,
    // Kept for anything that genuinely wants "when did they authenticate".
    last_sign_in_at: lastSignInById.get(p.id) ?? null,
    // What the roster's "Last seen" column and its sort read.
    last_seen_at: lastSeenById.get(p.id) ?? null,
    // Superseded by `attention` — kept only so nothing reading the old field breaks.
    audit_warnings: warningsById.get(p.id) ?? null,
    attention: attentionById.get(p.id) ?? null,
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
