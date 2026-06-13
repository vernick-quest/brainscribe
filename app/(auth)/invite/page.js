import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { createNotification } from '@/lib/notifications'

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
  if (!invite.claimed_by && invite.email === user.email) {
    await supabase.from('invites').update({
      claimed_by: user.id,
      claimed_at: new Date().toISOString(),
    }).eq('id', invite.id)

    // Update their profile role — mark confirmed since invite pre-assigns the role
    await supabase.from('profiles').update({ role: invite.role, role_confirmed: true }).eq('id', user.id)

    // Parent invite → create relationship with the student who sent the invite
    if (invite.role === 'parent' && invite.invited_by) {
      await supabase.from('relationships').insert({
        watcher_id: user.id,
        student_id: invite.invited_by,
      }).single() // ignore duplicate error if already linked
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
