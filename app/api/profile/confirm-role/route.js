import { createClient } from '@/lib/supabase/server'

const ALLOWED_ROLES = ['student', 'parent', 'teacher']

export async function PATCH(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, age_bracket } = await request.json()

  // Admins are never self-assigned — only manually set in the DB
  if (!ALLOWED_ROLES.includes(role)) {
    return Response.json({ error: 'Invalid role' }, { status: 400 })
  }

  const update = { role, role_confirmed: true }

  if (age_bracket === '13plus' || age_bracket === 'under13') {
    update.age_bracket = age_bracket
  }

  // Under-13 students need parental consent before accessing the app
  if (age_bracket === 'under13' && role === 'student') {
    update.coppa_consent_required = true
    update.coppa_consent_given = false
  }

  const { error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', user.id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true, role, age_bracket })
}
