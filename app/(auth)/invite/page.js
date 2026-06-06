import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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

  // If the invite matches this user's email and isn't claimed yet, claim it
  if (!invite.claimed_by && invite.email === user.email) {
    await supabase.from('invites').update({
      claimed_by: user.id,
      claimed_at: new Date().toISOString(),
    }).eq('id', invite.id)

    // Update their profile role
    await supabase.from('profiles').update({ role: invite.role }).eq('id', user.id)
  }

  redirect('/dashboard')
}

function InviteError({ message }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-indigo-50">
      <div className="bg-white rounded-2xl shadow p-10 text-center space-y-4 max-w-sm">
        <h2 className="text-xl font-bold text-red-600">Invite Error</h2>
        <p className="text-gray-600">{message}</p>
        <a href="/login" className="text-indigo-600 underline text-sm">Back to login</a>
      </div>
    </div>
  )
}
