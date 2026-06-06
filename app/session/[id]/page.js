import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TutorSession from '@/components/TutorSession'

export default async function SessionPage({ params }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .single()

  if (!session || session.student_id !== user.id) redirect('/dashboard')

  const { data: messages } = await supabase
    .from('messages')
    .select('role, content')
    .eq('session_id', id)
    .order('created_at')

  return (
    <TutorSession
      session={session}
      initialMessages={messages ?? []}
    />
  )
}
