import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 })

  // Anthropic — last 30 days
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: rows } = await supabase
    .from('api_usage')
    .select('created_at, model, input_tokens, output_tokens, cost_usd')
    .eq('service', 'anthropic')
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  const byDay = {}
  let totalCost = 0, totalInput = 0, totalOutput = 0, totalCalls = 0

  for (const r of rows ?? []) {
    const day = r.created_at.slice(0, 10)
    if (!byDay[day]) byDay[day] = { cost: 0, calls: 0, input: 0, output: 0 }
    byDay[day].cost   += r.cost_usd ?? 0
    byDay[day].calls  += 1
    byDay[day].input  += r.input_tokens  ?? 0
    byDay[day].output += r.output_tokens ?? 0
    totalCost   += r.cost_usd ?? 0
    totalInput  += r.input_tokens  ?? 0
    totalOutput += r.output_tokens ?? 0
    totalCalls  += 1
  }

  // ElevenLabs — live subscription data
  // Requires a key with user_read permission (may differ from the TTS key)
  const elKey = process.env.ELEVENLABS_ADMIN_KEY ?? process.env.ELEVENLABS_API_KEY
  let elevenlabs = null
  try {
    const elRes = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': elKey },
      next: { revalidate: 0 },
    })
    if (elRes.ok) {
      const sub = await elRes.json()
      elevenlabs = {
        characterCount: sub.character_count ?? 0,
        characterLimit: sub.character_limit ?? 0,
        resetUnix: sub.next_character_count_reset_unix ?? null,
        tier: sub.tier ?? null,
      }
    }
  } catch (e) {
    console.error('[usage] ElevenLabs fetch failed:', e)
  }

  return Response.json({
    anthropic: {
      totalCost,
      totalInput,
      totalOutput,
      totalCalls,
      byDay: Object.entries(byDay)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 14)
        .map(([day, s]) => ({ day, ...s })),
    },
    elevenlabs,
  })
}
