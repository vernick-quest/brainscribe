import { createClient } from '@/lib/supabase/server'

const ALLOWED_ROLES = ['student', 'parent', 'teacher']

export async function PATCH(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { role: requestedRole, age_bracket } = await request.json()

  // COPPA actual-knowledge is sticky: once an account has self-declared under-13
  // (recorded as age_bracket='under13' or coppa_consent_required=true), it can
  // NEVER re-declare 13+ to escape the consent gate. Without this, a child could
  // re-open /welcome, pick "13 or older," and reach the coach with no parent
  // approval. Fetch the existing profile and reject any such downgrade outright.
  const { data: existing } = await supabase
    .from('profiles')
    .select('age_bracket, coppa_consent_required, coppa_consent_given')
    .eq('id', user.id)
    .single()

  const alreadyUnder13 = existing?.age_bracket === 'under13' || existing?.coppa_consent_required === true
  if (alreadyUnder13 && age_bracket === '13plus') {
    return Response.json(
      { error: 'This account is registered as under 13 and needs parental approval.', code: 'coppa_locked' },
      { status: 403 }
    )
  }

  // Under-13 accounts can ONLY be students — never parent/teacher — regardless of
  // what the client sends. Age-first onboarding enforces this in the UI; this is
  // the server-side backstop that keeps a minor from ever holding a watcher role.
  const role = age_bracket === 'under13' ? 'student' : requestedRole

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
