import { createClient } from '@/lib/supabase/server'

// Owner-scoped write of the coach read-aloud preference + auto-mute "don't ask
// again" marker. Uses the USER's authed server client (runs as `authenticated`
// under their JWT) with `.eq('id', user.id)` — NOT the service role. The RLS
// policy "profiles: own" + the per-column UPDATE grant from migration 030 confine
// the write to the caller's own row (see 030_coach_read_aloud.sql).
//
// Body (either or both):
//   { readAloud: boolean }  -> sets coach_read_aloud
//   { dismissed: true }     -> stamps voice_prompt_dismissed_at = now() ("Keep it")
export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const update = {}
  if (typeof body.readAloud === 'boolean') update.coach_read_aloud = body.readAloud
  if (body.dismissed === true) update.voice_prompt_dismissed_at = new Date().toISOString()

  if (Object.keys(update).length === 0) {
    return Response.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { error } = await supabase.from('profiles').update(update).eq('id', user.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
