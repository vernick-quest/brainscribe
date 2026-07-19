import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { createNotification } from '@/lib/notifications'
import InviteAgeGate from '@/components/InviteAgeGate'
import { MAX_CHILDREN_PER_PARENT, MAX_PARENTS_PER_CHILD } from '@/lib/relationships'
import { maybeGrantBetaCircle } from '@/lib/access'

export default async function InvitePage({ searchParams }) {
  const params = await searchParams
  const token = params.token

  if (!token) redirect('/login')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?invite=${token}`)
  }

  // Look up the invite with the service client: the token IS the capability, so
  // the lookup shouldn't depend on invites being SELECT-able by `authenticated`
  // (the 001 "read by token" policy is `using (true)` — world-readable — and is
  // slated for removal; this page must keep working once it's gone).
  const service = createServiceClient()
  const { data: invite } = await service
    .from('invites')
    .select('*')
    .eq('token', token)
    .single()

  if (!invite) {
    return <InviteError message="This invite link is invalid." />
  }

  if (invite.claimed_by && invite.claimed_by !== user.id) {
    return <InviteError message="This invite has already been used." />
  }

  // Check expiry
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return <InviteError message="This invite link has expired. Please ask for a new one." />
  }

  // Claim when the invite matches this user's email and is unclaimed — OR was
  // already claimed by THIS user. The 001 handle_new_user trigger auto-claims a
  // matching invite at signup (stamping claimed_by + role) BEFORE this page can
  // run its guards or create the relationship/assignment grant, so a fresh-signup
  // claim used to arrive here pre-claimed and skip all of it. Re-running is safe:
  // every write below is guarded or idempotent.
  if ((!invite.claimed_by || invite.claimed_by === user.id) && invite.email === (user.email ?? '').toLowerCase()) {
    const { data: claimerProfile } = await supabase
      .from('profiles').select('age_bracket, role, role_confirmed').eq('id', user.id).single()

    // Don't silently convert an already-established account into a different role.
    // (An active student accepting a parent invite would otherwise lose their
    // student home; a single account can't be both with the current role model.)
    if (claimerProfile?.role_confirmed && claimerProfile.role !== invite.role) {
      return <InviteError message={`This account is already set up as a ${claimerProfile.role}. To join as a ${invite.role}, sign in with a different account.`} />
    }

    // Parent/teacher accounts require 13+. Gate on age before granting the role:
    // if we don't know their age yet, ask; an under-13 can't accept the invite.
    // Student invites (a parent linking their child) are exempt — students can be
    // any age, and the child still runs their own age-first onboarding afterward.
    if (invite.role !== 'student' && claimerProfile?.age_bracket !== '13plus') {
      if (claimerProfile?.age_bracket === 'under13') {
        return <InviteError message="Parent and teacher invites are for ages 13 and older, so this invite can't be used on your account." />
      }
      // Age not asserted yet — collect it, then the invite claims on re-run.
      return <InviteAgeGate token={token} role={invite.role} />
    }

    // Both the parent invite (student invited a parent) and the student invite
    // (parent invited a child) create one watcher→student relationship. Resolve
    // who is the parent (watcher) and who is the child (student) for this claim.
    let pendingRel = null
    if (invite.role === 'parent' && !invite.coparent && invite.invited_by) {
      // Per-child co-guardian invite (sent by a child's guardian) carries an explicit
      // target child in invite.student_id; a student-sent parent invite has no target,
      // so the inviting student (invited_by) is the child. Either way the claimer
      // becomes a read-only watcher — never a consenting guardian (no consent
      // columns are written here). Account-level co-parent invites (invite.coparent)
      // link MULTIPLE children and are handled after the role update below.
      pendingRel = { watcher_id: user.id, student_id: invite.student_id ?? invite.invited_by }
    } else if (invite.role === 'student' && invite.invited_by) {
      pendingRel = { watcher_id: invite.invited_by, student_id: user.id }
    }

    // All privileged writes below run on the service client created above: the
    // role/role_confirmed update (gate columns REVOKEd from `authenticated` by
    // migration 020), the relationship upsert, and the cap counts. Counts in
    // particular need it because under RLS the claimer only sees relationships on
    // their own side, and the insert policy (watcher_id = auth.uid()) would
    // otherwise reject a child claiming a parent-sent invite.

    // Enforce relationship caps BEFORE consuming the invite, so a capped link
    // doesn't burn the token or flip the profile role.
    if (pendingRel) {
      const { data: existing } = await service
        .from('relationships').select('id')
        .eq('watcher_id', pendingRel.watcher_id)
        .eq('student_id', pendingRel.student_id)
        .limit(1)

      // Skip the caps for an already-linked pair (idempotent re-claim).
      if (!(existing?.length)) {
        const [{ count: childCount }, { count: parentCount }] = await Promise.all([
          service.from('relationships').select('id', { count: 'exact', head: true }).eq('watcher_id', pendingRel.watcher_id),
          service.from('relationships').select('id', { count: 'exact', head: true }).eq('student_id', pendingRel.student_id),
        ])
        if ((childCount ?? 0) >= MAX_CHILDREN_PER_PARENT) {
          return <InviteError message={`That parent account is already linked to the maximum of ${MAX_CHILDREN_PER_PARENT} students.`} />
        }
        if ((parentCount ?? 0) >= MAX_PARENTS_PER_CHILD) {
          return <InviteError message={`That student already has the maximum of ${MAX_PARENTS_PER_CHILD} parents linked.`} />
        }
      }
    }

    // Burn the token (service client — invites has NO UPDATE policy for
    // `authenticated`, so a user-scoped update here silently affected 0 rows and
    // claimed invites never actually got stamped).
    if (!invite.claimed_by) {
      await service.from('invites').update({
        claimed_by: user.id,
        claimed_at: new Date().toISOString(),
      }).eq('id', invite.id)
    }

    // Update their profile role — mark confirmed since invite pre-assigns the role.
    // role/role_confirmed are gate columns REVOKEd from `authenticated` by migration
    // 020, so this write goes through the service client created above.
    //
    // Beta-launch access-gate inheritance: an invited user (parent, teacher, student,
    // or co-parent — every branch of this claim) inherits coach ACCESS through the
    // relationship, so they never see the Beta Circle code step. Set on the same
    // write; column added by migration 045.
    await service.from('profiles').update({ role: invite.role, role_confirmed: true, access_granted: true }).eq('id', user.id)
    // …and, if this invitee is a STUDENT, take a Beta Circle slot up to the fluid cap
    // of 100 (the cohort counts students only; maybeGrantBetaCircle no-ops for an
    // invited parent/teacher). Best-effort — never blocks the invite claim.
    await maybeGrantBetaCircle(service, user.id)

    // Account-level co-parent claim: tether B to the primary parent A and inherit
    // ALL of A's current children as a read-only watcher (future children auto-link
    // in the student-claim branch below). Per-child parent cap respected — a child
    // already at the cap is skipped. coparent_of is the marker that later blocks B
    // from adding their own children (/api/invites).
    if (invite.coparent && invite.invited_by) {
      await service.from('profiles').update({ coparent_of: invite.invited_by }).eq('id', user.id)
      const { data: primaryKids } = await service
        .from('relationships').select('student_id').eq('watcher_id', invite.invited_by)
      for (const { student_id } of primaryKids ?? []) {
        const { count } = await service
          .from('relationships').select('id', { count: 'exact', head: true }).eq('student_id', student_id)
        if ((count ?? 0) >= MAX_PARENTS_PER_CHILD) continue
        await service.from('relationships').upsert(
          { watcher_id: user.id, student_id },
          { onConflict: 'watcher_id,student_id', ignoreDuplicates: true }
        )
      }
    }

    // Create the watcher→student link (service client: see the cap note above).
    // A student claiming a parent-sent invite still runs their own age-first /
    // COPPA onboarding separately — this relationship is read-only oversight.
    if (pendingRel) {
      await service.from('relationships').upsert(
        pendingRel,
        { onConflict: 'watcher_id,student_id', ignoreDuplicates: true }
      )

      // Co-parent inheritance — FUTURE children: when a child newly links to a
      // primary parent A, also link A's co-parents to that child (read-only),
      // respecting the per-child parent cap. Only on a student→parent link.
      if (invite.role === 'student' && invite.invited_by) {
        const { data: coParents } = await service
          .from('profiles').select('id').eq('coparent_of', invite.invited_by)
        for (const cp of coParents ?? []) {
          const { count } = await service
            .from('relationships').select('id', { count: 'exact', head: true }).eq('student_id', user.id)
          if ((count ?? 0) >= MAX_PARENTS_PER_CHILD) break
          await service.from('relationships').upsert(
            { watcher_id: cp.id, student_id: user.id },
            { onConflict: 'watcher_id,student_id', ignoreDuplicates: true }
          )
        }
      }
    }

    // Teacher invite scoped to a specific assignment → grant access + notify.
    // Service client: no RLS policy lets the claiming TEACHER insert their own
    // assignment_teachers row (only the student owner / linked parent "manage"),
    // so the user-scoped insert silently failed. Idempotency guard keeps a
    // re-claim (e.g. after the signup trigger pre-claimed) from duplicating the
    // grant or re-sending the notification.
    if (invite.role === 'teacher' && invite.assignment_id) {
      const { data: existingGrant } = await service
        .from('assignment_teachers').select('id')
        .eq('session_id', invite.assignment_id)
        .eq('teacher_id', user.id)
        .maybeSingle()
      if (existingGrant) redirect('/teacher')

      await service.from('assignment_teachers').insert({
        session_id: invite.assignment_id,
        teacher_id: user.id,
        added_by: invite.invited_by,
      })

      // Fetch session title + student name for the notification message
      const { data: sessionData } = await service
        .from('sessions')
        .select('title, assignment_text, profiles!sessions_student_id_fkey(full_name)')
        .eq('id', invite.assignment_id)
        .single()

      const assignmentLabel = sessionData?.title
        || sessionData?.assignment_text?.slice(0, 60) + (sessionData?.assignment_text?.length > 60 ? '…' : '')
        || 'an assignment'
      const studentName = sessionData?.profiles?.full_name ?? 'A student'

      await createNotification({
        teacherId: user.id,
        teacherEmail: user.email,
        sessionId: invite.assignment_id,
        type: 'assignment_shared',
        message: `${studentName} added you to their assignment: "${assignmentLabel}"`,
      })
    }
  }

  // Route to the right dashboard
  const destination = invite.role === 'parent' ? '/parent' : invite.role === 'teacher' ? '/teacher' : '/folder'
  redirect(destination)
}

function InviteError({ message }) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--brand-cream)' }}>
      <div className="bg-white rounded-2xl shadow p-10 text-center space-y-4 max-w-sm border border-orange-100">
        <h2 className="text-xl font-bold text-red-500">Invite Error</h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{message}</p>
        <a href="/login" className="text-sm font-medium hover:underline" style={{ color: 'var(--brand-orange)' }}>Back to login</a>
      </div>
    </div>
  )
}
