// THROWAWAY — pricing sprint data pull. DO NOT COMMIT. Reads via service role,
// prints only aggregates (no emails, no keys, no content).
// Run: node --env-file=.env.local scripts/fable-pricing-pull.mjs
import { createClient } from '@supabase/supabase-js'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

async function all(table, select, pageSize = 1000) {
  let rows = [], from = 0
  for (;;) {
    const { data, error } = await supa.from(table).select(select).range(from, from + pageSize - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows = rows.concat(data)
    if (data.length < pageSize) return rows
    from += pageSize
  }
}

const usage = await all('api_usage', 'created_at, service, model, session_id, user_id, input_tokens, output_tokens, characters, cost_usd')
const sessions = await all('sessions', 'id, student_id, status, created_at, updated_at')
const profiles = await all('profiles', 'id, role, created_at, sessions_used')
let gymSessions = []
try { gymSessions = await all('gym_sessions', 'id, student_id, session_id, status, session_type, created_at') } catch (e) { console.log('gym_sessions unavailable:', e.message) }

const num = x => Number(x) || 0
const pct = (arr, p) => {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]
}
const usd = x => '$' + x.toFixed(4)
const sum = arr => arr.reduce((a, b) => a + b, 0)

console.log('=== TOTALS ===')
console.log('api_usage rows:', usage.length, '| sessions:', sessions.length, '| gym_sessions:', gymSessions.length, '| profiles:', profiles.length)
const roleCounts = {}
for (const p of profiles) roleCounts[p.role] = (roleCounts[p.role] || 0) + 1
console.log('roles:', JSON.stringify(roleCounts))
console.log('profiles.sessions_used values:', JSON.stringify([...new Set(profiles.map(p => p.sessions_used))]))
console.log('total logged cost:', usd(sum(usage.map(u => num(u.cost_usd)))))
const first = usage.map(u => u.created_at).sort()[0]
console.log('usage window:', first, '→', usage.map(u => u.created_at).sort().at(-1))

console.log('\n=== COST BY SERVICE/MODEL ===')
const byModel = {}
for (const u of usage) {
  const k = u.service === 'anthropic' ? `anthropic:${u.model}` : 'elevenlabs:tts'
  byModel[k] ??= { cost: 0, calls: 0, in: 0, out: 0, chars: 0 }
  const b = byModel[k]
  b.cost += num(u.cost_usd); b.calls++
  b.in += num(u.input_tokens); b.out += num(u.output_tokens); b.chars += num(u.characters)
}
for (const [k, b] of Object.entries(byModel).sort((a, z) => z[1].cost - a[1].cost))
  console.log(`${k.padEnd(38)} cost=${usd(b.cost)} calls=${b.calls} inTok=${b.in} outTok=${b.out} chars=${b.chars}`)

// --- per-session costs (only sessions with any logged usage) ---
const sessMeta = new Map(sessions.map(s => [s.id, s]))
const gymBySessionId = new Map(gymSessions.filter(g => g.session_id).map(g => [g.session_id, g]))
const perSession = new Map()
for (const u of usage) {
  if (!u.session_id) continue
  const e = perSession.get(u.session_id) ?? { anth: 0, el: 0, sonnetIn: 0, sonnetOut: 0, sonnetCalls: 0, haikuCalls: 0, haikuCost: 0, chars: 0, calls: 0 }
  if (u.service === 'anthropic') {
    e.anth += num(u.cost_usd)
    if ((u.model || '').includes('sonnet')) { e.sonnetIn += num(u.input_tokens); e.sonnetOut += num(u.output_tokens); e.sonnetCalls++ }
    else { e.haikuCalls++; e.haikuCost += num(u.cost_usd) }
  } else e.el += num(u.cost_usd), e.chars += num(u.characters)
  e.calls++
  perSession.set(u.session_id, e)
}

function report(label, ids) {
  const rows = ids.map(id => ({ id, ...perSession.get(id) })).filter(r => r.calls)
  const totals = rows.map(r => r.anth + r.el)
  const anth = rows.map(r => r.anth), el = rows.map(r => r.el)
  console.log(`\n=== ${label} (n=${rows.length} with usage) ===`)
  if (!rows.length) return
  console.log(`total/session:  median=${usd(pct(totals, 50))} p90=${usd(pct(totals, 90))} max=${usd(Math.max(...totals))} mean=${usd(sum(totals) / rows.length)}`)
  console.log(`anthropic:      median=${usd(pct(anth, 50))} p90=${usd(pct(anth, 90))}`)
  console.log(`elevenlabs:     median=${usd(pct(el, 50))} p90=${usd(pct(el, 90))} | chars median=${pct(rows.map(r => r.chars), 50)} p90=${pct(rows.map(r => r.chars), 90)}`)
  console.log(`sonnet calls/sess: median=${pct(rows.map(r => r.sonnetCalls), 50)} p90=${pct(rows.map(r => r.sonnetCalls), 90)} | sonnet inTok median=${pct(rows.map(r => r.sonnetIn), 50)} p90=${pct(rows.map(r => r.sonnetIn), 90)} outTok median=${pct(rows.map(r => r.sonnetOut), 50)} p90=${pct(rows.map(r => r.sonnetOut), 90)}`)
  console.log(`haiku calls/sess:  median=${pct(rows.map(r => r.haikuCalls), 50)} p90=${pct(rows.map(r => r.haikuCalls), 90)} cost median=${usd(pct(rows.map(r => r.haikuCost), 50))}`)
}

const completedIds = sessions.filter(s => s.status === 'complete').map(s => s.id)
const activeIds = sessions.filter(s => s.status !== 'complete').map(s => s.id)
const gymLinkedIds = sessions.filter(s => gymBySessionId.has(s.id)).map(s => s.id)
const assignmentCompleted = completedIds.filter(id => !gymBySessionId.has(id))
report('COMPLETED assignment sessions', assignmentCompleted)
report('GYM-linked sessions (all statuses)', gymLinkedIds)
report('ALL completed sessions', completedIds)
report('Active/incomplete sessions', activeIds)

// unattributed usage (no session_id) — pre-session calls, audits, etc.
const noSess = usage.filter(u => !u.session_id)
console.log(`\n=== USAGE WITH NO session_id (overhead) === rows=${noSess.length} cost=${usd(sum(noSess.map(u => num(u.cost_usd))))}`)

// --- per-student-month ---
console.log('\n=== PER STUDENT-MONTH (calendar month × user with any usage) ===')
const byUserMonth = new Map()
for (const u of usage) {
  if (!u.user_id) continue
  const k = `${u.user_id}|${u.created_at.slice(0, 7)}`
  const e = byUserMonth.get(k) ?? { anth: 0, el: 0, chars: 0 }
  if (u.service === 'anthropic') e.anth += num(u.cost_usd)
  else { e.el += num(u.cost_usd); e.chars += num(u.characters) }
  byUserMonth.set(k, e)
}
const months = [...byUserMonth.entries()]
const mTotals = months.map(([, e]) => e.anth + e.el)
console.log(`user-months: ${months.length}`)
console.log(`total/user-month: median=${usd(pct(mTotals, 50))} p90=${usd(pct(mTotals, 90))} max=${usd(Math.max(...mTotals, 0))} mean=${usd(sum(mTotals) / (months.length || 1))}`)
console.log(`voice chars/user-month: median=${pct(months.map(([, e]) => e.chars), 50)} p90=${pct(months.map(([, e]) => e.chars), 90)} max=${Math.max(...months.map(([, e]) => e.chars), 0)}`)
// anonymized per-month table
const byMonth = {}
for (const [k, e] of months) {
  const m = k.split('|')[1]
  byMonth[m] ??= { users: 0, cost: 0 }
  byMonth[m].users++; byMonth[m].cost += e.anth + e.el
}
for (const [m, v] of Object.entries(byMonth).sort()) console.log(`  ${m}: activeUsersWithUsage=${v.users} totalCost=${usd(v.cost)}`)

// sessions per student per month (completed only, assignment sessions)
const spm = new Map()
for (const s of sessions.filter(s => s.status === 'complete')) {
  const k = `${s.student_id}|${s.created_at.slice(0, 7)}`
  spm.set(k, (spm.get(k) || 0) + 1)
}
const spmVals = [...spm.values()]
console.log(`completed sessions per student-month: median=${pct(spmVals, 50)} p90=${pct(spmVals, 90)} max=${Math.max(...spmVals, 0)}`)
console.log('\nDone. No secrets printed.')
