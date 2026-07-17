import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'

// POST /api/profile/confirm-name  { firstName, lastName }
//
// Records that the user confirmed (or corrected) their display name. The name
// feeds the COPPA consent email, so /welcome soft-prompts suspicious Google
// display names ("Next Level Soccer") before age/role — see BACKLOG.md.
//
// Auth via the user-scoped client; the WRITE goes through the service client:
// display_name_confirmed / display_name_confirmed_at are server-written columns
// with NO `authenticated` grant on purpose (profiles is deny-by-default per
// migration 020, columns added in 040), so the flag can only move through this
// endpoint. full_name rides along in the same service write.
export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Name confirmation happens about once per account lifetime.
  if (!await checkRateLimit(`confirm-name:${user.id}`, 10, 3600)) {
    return rateLimited('Too many attempts — please try again later.')
  }

  const { firstName, lastName } = await request.json()
  const first = (firstName ?? '').trim().slice(0, 60)
  const last = (lastName ?? '').trim().slice(0, 60)
  if (!first) return Response.json({ error: 'First name is required.' }, { status: 400 })

  const fullName = [first, last].filter(Boolean).join(' ')

  const service = createServiceClient()
  const { error } = await service
    .from('profiles')
    .update({
      full_name: fullName,
      display_name_confirmed: true,
      display_name_confirmed_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    console.error('[confirm-name]', error.message)
    return Response.json({ error: 'Failed to save.' }, { status: 500 })
  }
  return Response.json({ ok: true, fullName })
}
