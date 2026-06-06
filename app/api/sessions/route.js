import { createClient } from '@/lib/supabase/server'

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { assignmentText } = await request.json()
  if (!assignmentText) return Response.json({ error: 'Missing assignment' }, { status: 400 })

  const { data, error } = await supabase
    .from('sessions')
    .insert({ student_id: user.id, assignment_text: assignmentText })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
