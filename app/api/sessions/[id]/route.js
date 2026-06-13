import { createClient } from '@/lib/supabase/server'

const VALID_SUBJECTS = [
  'english', 'humanities', 'history_us', 'history_world', 'social_studies',
  'civics', 'economics', 'science_biology', 'science_chemistry', 'science_physics',
  'science_general', 'foreign_language', 'psychology', 'art', 'drama', 'music',
  'computer_science', 'health', 'personal_statement', 'other', 'unspecified',
]

export async function PATCH(request, { params }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { subject, subject_custom_label } = await request.json()
  if (!VALID_SUBJECTS.includes(subject)) return Response.json({ error: 'Invalid subject' }, { status: 400 })

  const { error } = await supabase
    .from('sessions')
    .update({
      subject,
      subject_custom_label: subject === 'other' ? (subject_custom_label || null) : null,
    })
    .eq('id', id)
    .eq('student_id', user.id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

export async function DELETE(request, { params }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Only allow deleting own sessions
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', id)
    .eq('student_id', user.id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
