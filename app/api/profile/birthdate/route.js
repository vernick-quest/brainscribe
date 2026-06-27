import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// PATCH /api/profile/birthdate — set or correct a birthdate, the source of truth for
// the COPPA age gate. age_bracket is DERIVED here (<13 → under13) and stored as a
// server-maintained cache: lots of code reads age_bracket, and legacy rows carry a
// bracket with no birthdate, so it can't be a generated column.
//
// All gate writes go through the service client. birthdate/age_bracket/coppa_* are
// columns REVOKEd from `authenticated` by migration 020, so the gate can only move
// through this guarded endpoint — never a raw supabase-js PATCH from the client.
//
// Directional rules (the whole point of this endpoint):
//   • SELF (a student editing their own account) may move INTO protection
//     (→ under13) but NEVER out of it — COPPA actual-knowledge is sticky.
//   • A VERIFIED PARENT linked to the target via `relationships` may move the child
//     across the 13 line BOTH ways — the legitimate correction path. A parent
//     correction INTO under-13 doubles as the consent event (the parent is verified
//     and acting deliberately), so the child stays active instead of being bounced
//     back through the email flow.
//   • An ADMIN may set anything.
//   • Any other actor/target combination is rejected.
// Whenever a write resolves to under-13, the profile photo is dropped (data-min).
//
// NOTE: depends on profiles.birthdate (migration 019) — dead until that's applied.
export async function PATCH(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { birthdate, studentId } = await request.json()

  // Validate: YYYY-MM-DD, a real date, in the past, not absurdly old.
  if (typeof birthdate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) {
    return Response.json({ error: 'A valid birthdate (YYYY-MM-DD) is required.' }, { status: 400 })
  }
  const dob = new Date(`${birthdate}T00:00:00Z`)
  const now = new Date()
  if (Number.isNaN(dob.getTime()) || dob > now || dob.getUTCFullYear() < 1900) {
    return Response.json({ error: 'That birthdate doesn’t look right.' }, { status: 400 })
  }

  const newBracket = ageInYears(dob, now) < 13 ? 'under13' : '13plus'

  const service = createServiceClient()

  const targetId = studentId && studentId !== user.id ? studentId : user.id
  const isSelf = targetId === user.id

  // Actor role (admin override) + target's current gate state.
  const { data: actor } = await service
    .from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = actor?.role === 'admin'

  const { data: target } = await service
    .from('profiles')
    .select('age_bracket, coppa_consent_required, coppa_consent_parent_id')
    .eq('id', targetId)
    .single()
  if (!target) return Response.json({ error: 'Profile not found.' }, { status: 404 })

  const targetProtected = target.age_bracket === 'under13' || target.coppa_consent_required === true

  // ── Authorization ────────────────────────────────────────────────────────────
  let parentEditing = false
  if (!isAdmin) {
    if (isSelf) {
      // Self may move INTO protection but NEVER out of it.
      if (targetProtected && newBracket === '13plus') {
        return Response.json(
          { error: 'This account is registered as under 13 and needs parental approval to change.', code: 'coppa_locked' },
          { status: 403 }
        )
      }
    } else {
      // Editing someone else requires a verified parent→child relationship.
      const { data: rel } = await service
        .from('relationships')
        .select('watcher_id')
        .eq('watcher_id', user.id)
        .eq('student_id', targetId)
        .maybeSingle()
      if (!rel) {
        return Response.json({ error: 'You are not authorized to edit this account.' }, { status: 403 })
      }
      parentEditing = true
    }
  }

  // ── Build the gate update ─────────────────────────────────────────────────────
  const update = { birthdate, age_bracket: newBracket }
  let grantedConsent = false

  if (newBracket === 'under13') {
    update.coppa_consent_required = true
    update.avatar_url = null  // never retain a minor's photo
    if (isAdmin || parentEditing) {
      // Verified parent (or admin) correction IS the consent event — keep the child
      // active rather than bouncing them to /coppa/pending.
      update.coppa_consent_given = true
      update.coppa_consent_given_at = now.toISOString()
      update.coppa_consent_parent_id = parentEditing ? user.id : (target.coppa_consent_parent_id ?? null)
      grantedConsent = true
    } else {
      // Self moving into protection — consent not yet obtained.
      update.coppa_consent_given = false
    }
  } else {
    // Resolved 13+ → consent no longer required (a parent/admin clearing a child, or
    // a self-edit on an account that was never protected).
    update.coppa_consent_required = false
  }

  const { error } = await service.from('profiles').update(update).eq('id', targetId)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Audit-log the consent event when a parent/admin correction grants it.
  if (grantedConsent) {
    const ipAddress = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null
    const userAgent = request.headers.get('user-agent') || null
    await service.from('coppa_consent_log').insert({
      student_id: targetId,
      parent_id: parentEditing ? user.id : null,
      consent_method: parentEditing ? 'parent_birthdate_correction' : 'admin_override',
      ip_address: ipAddress,
      user_agent: userAgent,
      privacy_policy_version: 'v1.0-june-2025',
    })
  }

  return Response.json({ ok: true, age_bracket: newBracket })
}

// Whole years between dob and ref (UTC), accounting for month/day.
function ageInYears(dob, ref) {
  let age = ref.getUTCFullYear() - dob.getUTCFullYear()
  const m = ref.getUTCMonth() - dob.getUTCMonth()
  if (m < 0 || (m === 0 && ref.getUTCDate() < dob.getUTCDate())) age--
  return age
}
