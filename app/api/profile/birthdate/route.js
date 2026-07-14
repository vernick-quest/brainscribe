import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { deriveAgeBracket, evaluateGateEdit } from '@/lib/coppa'
import { generateConfirmToken, sendSecondStepConfirmEmail } from '@/lib/coppaConsent'

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

  // Gate writes are cheap but sensitive (they can auto-grant consent + write
  // audit-log rows) — cap the churn per account.
  if (!await checkRateLimit(`birthdate:${user.id}`, 15, 3600)) {
    return rateLimited('Too many birthdate changes — please try again later.')
  }

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

  const newBracket = deriveAgeBracket(dob, now)

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

  // ── Authorization — the directional/guardian rules live in lib/coppa.js ──────
  let hasWatcherLink = false
  if (!isAdmin && !isSelf) {
    const { data: rel } = await service
      .from('relationships')
      .select('watcher_id')
      .eq('watcher_id', user.id)
      .eq('student_id', targetId)
      .maybeSingle()
    hasWatcherLink = !!rel
  }

  const decision = evaluateGateEdit({
    actorId: user.id,
    actorRole: actor?.role,
    targetId,
    target,
    newBracket,
    hasWatcherLink,
  })
  if (!decision.allowed) {
    return Response.json({ error: decision.error, code: decision.code }, { status: decision.status })
  }
  const parentEditing = decision.parentEditing

  // ── Build the gate update ─────────────────────────────────────────────────────
  const update = { birthdate, age_bracket: newBracket }
  let grantedConsent = false   // admin instant-grant (logged below)
  let bootstrapEmailPlus = false  // parent correction → email-plus second step

  if (newBracket === 'under13') {
    update.coppa_consent_required = true
    update.avatar_url = null  // never retain a minor's photo
    if (isAdmin) {
      // Admin override — instant grant (admins are trusted; unchanged).
      update.coppa_consent_given = true
      update.coppa_consent_given_at = now.toISOString()
      update.coppa_consent_parent_id = target.coppa_consent_parent_id ?? null
      grantedConsent = true
    } else if (parentEditing) {
      // EMAIL-PLUS (decision (c)): a parent correction is only STEP 1 now — it no
      // longer instant-grants consent (that single in-app action was the weak VPC).
      // Set the gate but keep consent UNGIVEN; the child waits at /coppa/pending
      // until the parent acts on the confirmation email sent below. Consent lands
      // at /coppa/confirm (grantConsentForPending), which records the guardian.
      update.coppa_consent_given = false
      bootstrapEmailPlus = true
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

  // Audit-log an admin instant-grant at the moment it happens.
  if (grantedConsent) {
    const ipAddress = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null
    const userAgent = request.headers.get('user-agent') || null
    await service.from('coppa_consent_log').insert({
      student_id: targetId,
      parent_id: null,
      consent_method: 'admin_override',
      ip_address: ipAddress,
      user_agent: userAgent,
      privacy_policy_version: 'v1.0-june-2025',
    })
  }

  // Parent correction → kick off the email-plus second step. The confirmation email
  // goes to the acting parent's own verified address; consent is granted only when
  // they act on it at /coppa/confirm. Reuse an existing non-approved pending row if
  // one exists (e.g. the child already submitted a parent email), else create one.
  if (bootstrapEmailPlus) {
    const confirmToken = generateConfirmToken()
    const parentEmail = user.email
    const { data: existing } = await service
      .from('pending_coppa_signups')
      .select('id')
      .eq('student_id', targetId)
      .neq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing) {
      await service.from('pending_coppa_signups').update({
        parent_email: parentEmail, status: 'pending',
        first_step_at: now.toISOString(), confirm_token: confirmToken, confirm_sent_at: now.toISOString(),
      }).eq('id', existing.id)
    } else {
      await service.from('pending_coppa_signups').insert({
        student_id: targetId, parent_email: parentEmail,
        first_step_at: now.toISOString(), confirm_token: confirmToken, confirm_sent_at: now.toISOString(),
      })
    }

    const { data: child } = await service
      .from('profiles').select('full_name').eq('id', targetId).single()
    await sendSecondStepConfirmEmail({ parentEmail, studentName: child?.full_name, confirmToken })
  }

  return Response.json({ ok: true, age_bracket: newBracket, consentPending: bootstrapEmailPlus })
}
