import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { purgeSubscriberEmail } from '@/lib/subscribers'
import { NextResponse } from 'next/server'

// POST /api/admin/delete-user — permanently delete a user (admin only).
// Deleting the auth.users row cascades to profiles → sessions → messages /
// paragraphs / scaffolds / relationships / assignment_teachers (all ON DELETE
// CASCADE in the schema).
//
// `subscribers` is the ONE table the cascade cannot reach (no FK — see
// lib/subscribers.js), so the waitlist address is purged explicitly below. Without
// it, "removes the account and all its data" is false, and so is the privacy
// policy's promise that an address which became an account is "deleted with the
// account".
export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId } = await request.json()
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  if (userId === user.id) return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 })

  const service = createServiceClient()

  // Read the email BEFORE the delete — the profile row is cascaded away, and the
  // address is the only key `subscribers` can be matched on.
  const { data: target } = await service
    .from('profiles').select('email').eq('id', userId).maybeSingle()

  const { error } = await service.auth.admin.deleteUser(userId)
  if (error) {
    console.error('[admin delete-user]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Best-effort: the account is already gone, so a purge failure is reported, never
  // fatal. Surfaced in the response so an admin can see it rather than assume.
  const { error: purgeErr } = await purgeSubscriberEmail(service, target?.email)

  return NextResponse.json({ ok: true, ...(purgeErr ? { subscriberPurgeError: purgeErr } : {}) })
}
