import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 })

  // The rollup RPCs are SECURITY DEFINER and read cross-user cost/PII. EXECUTE is
  // revoked from anon/authenticated (migration 029) to close an anon-readable leak,
  // so they run ONLY via the service-role client below — gated by the admin check above.
  const svc = createServiceClient()

  // Anthropic — last 30 days, aggregated by day in Postgres (returns ~30 rows
  // instead of every usage row). Falls back to no data if the rollup function
  // hasn't been applied yet.
  const { data: daily, error: rollupError } = await svc.rpc('anthropic_usage_daily', { days: 30 })
  if (rollupError) console.error('[usage] rollup rpc failed:', rollupError.message)

  let totalCost = 0, totalInput = 0, totalOutput = 0, totalCalls = 0
  const byDay = {}

  for (const r of daily ?? []) {
    byDay[r.day] = {
      cost: Number(r.cost) || 0,
      calls: Number(r.calls) || 0,
      input: Number(r.input) || 0,
      output: Number(r.output) || 0,
    }
    totalCost   += Number(r.cost)   || 0
    totalCalls  += Number(r.calls)  || 0
    totalInput  += Number(r.input)  || 0
    totalOutput += Number(r.output) || 0
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

  // Spend by bucket — Users / Testing / Other (graceful empty if migration 028 not applied)
  const { data: catRows, error: byCatError } = await svc.rpc('usage_by_category', { days: 30 })
  if (byCatError) console.error('[usage] usage_by_category rpc failed:', byCatError.message)

  const byCategory = (catRows ?? []).map(r => ({
    category: r.category,
    cost: Number(r.cost) || 0,
    calls: Number(r.calls) || 0,
    isEstimate: !!r.is_estimate_any,
  }))

  // Per-user cost across both services (graceful empty if migration 013 not applied)
  const { data: userRows, error: byUserError } = await svc.rpc('usage_by_user', { days: 30 })
  if (byUserError) console.error('[usage] usage_by_user rpc failed:', byUserError.message)

  const byUser = (userRows ?? []).map(r => ({
    userId: r.user_id,
    email: r.email,
    fullName: r.full_name,
    anthropicCost: Number(r.anthropic_cost) || 0,
    elevenlabsCost: Number(r.elevenlabs_cost) || 0,
    totalCost: Number(r.total_cost) || 0,
    anthropicCalls: Number(r.anthropic_calls) || 0,
    elevenlabsChars: Number(r.elevenlabs_chars) || 0,
  }))

  // Deleted / unattributed spend. api_usage.user_id is ON DELETE SET NULL
  // (migration 013), so a deleted user's rows survive with user_id IS NULL —
  // and usage_by_user filters those out (WHERE user_id IS NOT NULL). Without
  // this bucket the per-user rows silently under-count the true total. We sum
  // the orphaned rows directly (service-role, admin-gated above) so the Cost
  // Per User table reconciles. Zero PII: by definition no identity remains on
  // these rows. Orphan rows are bounded by the number of deleted users, so a
  // client-side sum is fine. (The 30-day window uses server time here vs. the
  // RPC's DB now() — an immaterial sub-second drift for a cost display.)
  const sinceIso = new Date(Date.now() - 30 * 86_400_000).toISOString()
  let unattributed = null
  {
    const { data: orphanRows, error: orphanError } = await svc
      .from('api_usage')
      .select('service, cost_usd, characters')
      .is('user_id', null)
      .gte('created_at', sinceIso)
    if (orphanError) {
      console.error('[usage] unattributed query failed:', orphanError.message)
    } else if (orphanRows && orphanRows.length) {
      let anthropicCost = 0, elevenlabsCost = 0, anthropicCalls = 0, elevenlabsChars = 0
      for (const r of orphanRows) {
        const cost = Number(r.cost_usd) || 0
        if (r.service === 'anthropic') { anthropicCost += cost; anthropicCalls += 1 }
        else if (r.service === 'elevenlabs') { elevenlabsCost += cost; elevenlabsChars += Number(r.characters) || 0 }
      }
      unattributed = {
        anthropicCost,
        elevenlabsCost,
        totalCost: anthropicCost + elevenlabsCost,
        anthropicCalls,
        elevenlabsChars,
        rowCount: orphanRows.length,
      }
    }
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
    byCategory,
    byUser,
    unattributed,
  })
}
