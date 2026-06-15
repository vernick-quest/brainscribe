import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

// PATCH /api/admin/set-onboarding — admin toggles a user's onboarding flag.
// Setting complete=false means their next sign-in routes them through onboarding
// again (handy for testing, and a useful at-a-glance check generally).
export async function PATCH(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, complete } = await request.json()
  if (!userId || typeof complete !== 'boolean') {
    return NextResponse.json({ error: 'Invalid fields' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('profiles')
    .update({
      onboarding_complete: complete,
      onboarding_completed_at: complete ? new Date().toISOString() : null,
    })
    .eq('id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
