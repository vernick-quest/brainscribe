import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// DELETE /api/invites/[id] — revoke a pending invite the caller created.
// Scoped hard to `invited_by = caller` AND `claimed_at is null`, so a parent can
// only cancel their OWN still-unaccepted invites (never someone else's, and never
// one that's already been claimed into a live relationship). Service client because
// invites has no DELETE policy for `authenticated`; the eq-filters are the guard.
export async function DELETE(request, { params }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { error } = await service
    .from('invites')
    .delete()
    .eq('id', id)
    .eq('invited_by', user.id)
    .is('claimed_at', null)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
