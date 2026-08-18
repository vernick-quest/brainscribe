#!/usr/bin/env node
// Live gate for the starting draft (migration 071). ONE command:
//
//     node scripts/starting-draft-gate.mjs
//
// Proves, against the real database through the real client (supabase-js → PostgREST,
// the same request shape the app builds — a raw fetch once omitted the `columns=` param
// and made a live data-destroying bug vanish from its test):
//
//   1. POSITIVE CONTROL — the student CAN insert and read their own draft. Without this a
//      later "denied" could just be a broken connection reported as a security property.
//   2. UPDATE by the owning student is refused — asserted by reading the SENTINEL VALUE
//      back with the service role, not by trusting a status code. PostgREST answers a
//      zero-row PATCH with 204, which is indistinguishable from success.
//   3. DELETE by the owning student is refused — same value-level assertion.
//   4. A second insert for the same session fails LOUDLY on the primary key (23505),
//      never silently no-ops.
//   5. A stranger can neither read nor insert.
//   6. A linked watcher (parent/teacher) CAN read.
//   7. Deleting the session deletes the draft — the COPPA cascade, proven not assumed.
//   8. service_role still has full access (a `revoke ... from public` would strip it too).
//
// Creates two throwaway auth users and one session, and deletes them in a finally block.
// Anything it cannot clean up is printed LOUDLY at the end.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = {}
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !ANON || !SERVICE) { console.error('Missing Supabase env in .env.local'); process.exit(2) }

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })
const stamp = Date.now()
const SENTINEL = `SENTINEL-${stamp} the dog barked and it was loud`
const TAMPERED = `TAMPERED-${stamp} this must never be stored`

let pass = 0, fail = 0
const ok  = (name, extra = '') => { pass++; console.log(`  ✅ ${name}${extra ? ` — ${extra}` : ''}`) }
const bad = (name, detail)     => { fail++; console.log(`  ❌ ${name}\n       ${detail}`) }
const check = (name, cond, detail) => cond ? ok(name) : bad(name, detail)

async function signedInClient(email, password) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`)
  return c
}

const created = { users: [], sessions: [] }

async function makeUser(tag) {
  const email = `gate-${tag}-${stamp}@example.com`
  const password = `Gate!${stamp}${tag}`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(`createUser(${tag}): ${error.message}`)
  created.users.push(data.user.id)
  return { id: data.user.id, email, password, client: await signedInClient(email, password) }
}

try {
  console.log('\n── Starting draft gate ──────────────────────────────────────────\n')

  // Preflight: is the migration actually applied? A missing table must read as
  // "not applied yet", never as a passing gate.
  const { error: preErr } = await admin.from('session_starting_drafts').select('session_id').limit(1)
  if (preErr) {
    console.error(`Table session_starting_drafts is not queryable: ${preErr.message}`)
    console.error('→ Migration 071 has not been applied. Paste it in the Supabase SQL editor, then re-run.')
    process.exit(2)
  }
  const { data: ledger } = await admin.from('schema_migrations').select('version').order('version', { ascending: false }).limit(1)
  console.log(`Ledger head: ${ledger?.[0]?.version ?? 'unknown'}\n`)

  const student  = await makeUser('student')
  const stranger = await makeUser('stranger')
  const watcher  = await makeUser('watcher')

  // A session owned by the student, created the way the app creates it.
  const { data: session, error: sErr } = await admin.from('sessions').insert({
    student_id: student.id, assignment_text: 'Gate session — starting draft', persona: 'owen',
  }).select('id').single()
  if (sErr) throw new Error(`session insert: ${sErr.message}`)
  created.sessions.push(session.id)
  console.log(`Session ${session.id}\n`)

  // ── 1. POSITIVE CONTROL ────────────────────────────────────────────────────
  const { data: inserted, error: insErr } = await student.client
    .from('session_starting_drafts')
    .insert({ session_id: session.id, content: SENTINEL, word_count: 9, source: 'pasted' })
    .select('session_id, content, word_count')
    .single()
  check('1. student inserts own draft (positive control)',
    !insErr && inserted?.content === SENTINEL,
    `error=${insErr?.message} content=${JSON.stringify(inserted?.content)}`)

  const { data: readBack } = await student.client
    .from('session_starting_drafts').select('content').eq('session_id', session.id).maybeSingle()
  check('1b. student reads own draft back', readBack?.content === SENTINEL,
    `got ${JSON.stringify(readBack?.content)}`)

  // ── 2. UPDATE refused — assert on the VALUE ────────────────────────────────
  const upd = await student.client
    .from('session_starting_drafts').update({ content: TAMPERED }).eq('session_id', session.id).select()
  const { data: afterUpd } = await admin
    .from('session_starting_drafts').select('content').eq('session_id', session.id).single()
  check('2. UPDATE by the owner leaves the stored value untouched',
    afterUpd?.content === SENTINEL,
    `stored content is now ${JSON.stringify(afterUpd?.content)} — IMMUTABILITY BROKEN`)
  console.log(`       (update returned rows=${upd.data?.length ?? 0} error=${upd.error?.code ?? 'none'} — note a bare status would look like success)`)

  // ── 3. DELETE refused — assert the row still exists ────────────────────────
  const del = await student.client
    .from('session_starting_drafts').delete().eq('session_id', session.id).select()
  const { count: afterDel } = await admin
    .from('session_starting_drafts').select('session_id', { count: 'exact', head: true }).eq('session_id', session.id)
  check('3. DELETE by the owner leaves the row in place', afterDel === 1,
    `row count after delete attempt = ${afterDel} — IMMUTABILITY BROKEN`)
  console.log(`       (delete returned rows=${del.data?.length ?? 0} error=${del.error?.code ?? 'none'})`)

  // ── 4. Second insert must fail loudly ──────────────────────────────────────
  const second = await student.client.from('session_starting_drafts')
    .insert({ session_id: session.id, content: TAMPERED, word_count: 7, source: 'typed' }).select()
  const { data: afterSecond } = await admin
    .from('session_starting_drafts').select('content').eq('session_id', session.id).single()
  check('4. a second insert fails loudly (23505) and changes nothing',
    second.error?.code === '23505' && afterSecond?.content === SENTINEL,
    `error=${second.error?.code ?? 'NONE — silent no-op!'} content=${JSON.stringify(afterSecond?.content)}`)

  // ── 5. Stranger is blocked both ways ───────────────────────────────────────
  const { data: strangerRead } = await stranger.client
    .from('session_starting_drafts').select('content').eq('session_id', session.id)
  check('5. a stranger reads nothing', (strangerRead?.length ?? 0) === 0,
    `stranger saw ${strangerRead?.length} row(s)`)

  const { data: otherSession } = await admin.from('sessions').insert({
    student_id: stranger.id, assignment_text: 'Gate session — stranger', persona: 'owen',
  }).select('id').single()
  created.sessions.push(otherSession.id)
  const strangerWrite = await stranger.client.from('session_starting_drafts')
    .insert({ session_id: session.id, content: TAMPERED, word_count: 7, source: 'typed' }).select()
  check("5b. a stranger cannot write into another student's session",
    !!strangerWrite.error, `insert succeeded — RLS INSERT policy is not scoped`)

  // ── 6. Linked watcher can read ─────────────────────────────────────────────
  await admin.from('relationships').insert({ watcher_id: watcher.id, student_id: student.id })
  const { data: watcherRead } = await watcher.client
    .from('session_starting_drafts').select('content').eq('session_id', session.id).maybeSingle()
  check('6. a linked watcher (parent/teacher) can read it', watcherRead?.content === SENTINEL,
    `watcher got ${JSON.stringify(watcherRead?.content)} — the transparency defence does not work`)

  // ── 7. COPPA cascade — proven, not assumed ─────────────────────────────────
  const { error: sessDelErr } = await admin.from('sessions').delete().eq('id', session.id)
  const { count: afterCascade } = await admin
    .from('session_starting_drafts').select('session_id', { count: 'exact', head: true }).eq('session_id', session.id)
  check('7. deleting the session deletes the draft (COPPA cascade)',
    !sessDelErr && afterCascade === 0,
    `error=${sessDelErr?.message} rows left=${afterCascade} — A CHILD'S WRITING WOULD SURVIVE DELETION`)
  if (afterCascade === 0) created.sessions = created.sessions.filter(id => id !== session.id)

  // ── 8. service_role keeps full access (the cron and admin tooling run as it) ─
  const svcIns = await admin.from('session_starting_drafts')
    .insert({ session_id: otherSession.id, content: SENTINEL, word_count: 9, source: 'typed' }).select('content').single()
  const svcDel = await admin.from('session_starting_drafts').delete().eq('session_id', otherSession.id).select()
  check('8. service_role can still insert and delete',
    svcIns.data?.content === SENTINEL && !svcDel.error && (svcDel.data?.length ?? 0) === 1,
    `insert=${svcIns.error?.message ?? 'ok'} delete=${svcDel.error?.message ?? `${svcDel.data?.length} rows`}`)

} catch (err) {
  fail++
  console.log(`\n  ❌ GATE ABORTED: ${err.message}`)
} finally {
  const leftovers = []
  for (const id of created.sessions) {
    const { error } = await admin.from('sessions').delete().eq('id', id)
    if (error) leftovers.push(`session ${id}: ${error.message}`)
  }
  for (const id of created.users) {
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) leftovers.push(`user ${id}: ${error.message}`)
  }
  console.log(`\n── ${pass} passed, ${fail} failed ─────────────────────────────────────`)
  if (leftovers.length) {
    console.log('\n🔴 COULD NOT CLEAN UP — delete these by hand:')
    for (const l of leftovers) console.log(`   ${l}`)
  } else {
    console.log('Cleanup: all gate users and sessions removed.')
  }
  process.exit(fail === 0 ? 0 : 1)
}
