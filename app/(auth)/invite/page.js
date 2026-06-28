import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { createNotification } from '@/lib/notifications'
import InviteAgeGate from '@/components/InviteAgeGate'
import { MAX_CHILDREN_PER_PARENT, MAX_PARENTS_PER_CHILD } from '@/lib/relationships'

export default async function InvitePage({ searchParams }) {
  const params = await searchParams
  const token = params.token

  if (!token) redirect('/login')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?invite=${token}`)
  }

  // Look up the invite
  const { data: invite } = await supabase
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

  // If the invite matches this user's email and isn't claimed yet, claim it
  if (!invite.claimed_by && invite.email === (user.email ?? '').toLowerCase()) {
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
    if (invite.role === 'parent' && invite.invited_by) {
      // Co-parent invite (sent by a child's guardian) carries an explicit target
      // child in invite.student_id; a student-sent parent invite has no target,
      // so the inviting student (invited_by) is the child. Either way the claimer
      // becomes a read-only watcher — never a consenting guardian (no consent
      // columns are written here).
      pendingRel = { watcher_id: user.id, student_id: invite.student_id ?? invite.invited_by }
    } else if (invite.role === 'student' && invite.invited_by) {
      pendingRel = { watcher_id: invite.invited_by, student_id: user.id }
    }

    // Service client for all the privileged writes below: the role/role_confirmed
    // update (gate columns REVOKEd from `authenticated` by migration 020), the
    // relationship upsert, and the cap counts. Counts in particular need it because
    // under RLS the claimer only sees relationships on their own side, and the
    // insert policy (watcher_id = auth.uid()) would otherwise reject a child
    // claiming a parent-sent invite.
    const service = createServiceClient()

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

    await supabase.from('invites').update({
      claimed_by: user.id,
      claimed_at: new Date().toISOString(),
    }).eq('id', invite.id)

    // Update their profile role — mark confirmed since invite pre-assigns the role.
    // role/role_confirmed are gate columns REVOKEd from `authenticated` by migration
    // 020, so this write goes through the service client created above.
    await service.from('profiles').update({ role: invite.role, role_confirmed: true }).eq('id', user.id)

    // Create the watcher→student link (service client: see the cap note above).
    // A student claiming a parent-sent invite still runs their own age-first /
    // COPPA onboarding separately — this relationship is read-only oversight.
    if (pendingRel) {
      await service.from('relationships').upsert(
        pendingRel,
        { onConflict: 'watcher_id,student_id', ignoreDuplicates: true }
      )
    }

    // Teacher invite scoped to a specific assignment → grant access + notify
    if (invite.role === 'teacher' && invite.assignment_id) {
      await supabase.from('assignment_teachers').insert({
        session_id: invite.assignment_id,
        teacher_id: user.id,
        added_by: invite.invited_by,
      })

      // Fetch session title + student name for the notification message
      const { data: sessionData } = await supabase
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
  const destination = invite.role === 'parent' ? '/parent' : invite.role === 'teacher' ? '/teacher' : '/dashboard'
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
