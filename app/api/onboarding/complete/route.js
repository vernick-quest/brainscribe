import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

// Marks the signed-in student as having seen/dismissed onboarding so the dashboard
// stops auto-routing them into it. Called both when they finish the practice
// paragraph and when they skip. Uses the service client to set the flag — the
// caller is authenticated and we only ever write their own row.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { error } = await service
    .from('profiles')
    .update({ onboarding_complete: true, onboarding_completed_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) {
    console.error('[onboarding/complete] update failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
