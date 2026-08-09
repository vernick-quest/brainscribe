// scripts/continuation-gate.mjs — "Keep working on this" (v2) data-loss gate.
//
// Run:  npm run test:continuation
//
// WHAT THIS IS FOR
// A v2 continuation carries v1's finished paragraphs AND v1's cursor, which v1 parks at
// components.length as its "all done" sentinel. On 2026-08-08 that combination lost student
// writing three ways, all silently:
//   1. Two dictated additions both computed position 3; /api/paragraphs upserts on
//      (session_id, position), so the second REPLACED the first — same row id, success
//      status both times, no throw and no log.
//   2. An in-range target is no safer: it holds carried text, and a dictated save writes
//      only the newly spoken words, so "strengthen paragraph 1" would delete paragraph 1.
//   3. Component writes ([ACTIVE:]/[NUGGET:]/[DONE:]) went through resolveWriteIndex, whose
//      redirect-to-last-section rescue landed on a paragraph already full of carried words —
//      work meant for paragraph 0 overwrote paragraph 2.
//
// The unit suite (lib/scaffoldWrite.test.js) covers the rules. This gate covers the thing a
// unit test cannot: that the REAL upsert against the REAL table, driven by the REAL resolver,
// leaves the student's carried writing byte-intact. Per CLAUDE.md it plants sentinels and
// asserts on the VALUES read back — never on a status code, because every one of the losses
// above returned success.
//
// SAFETY: synthetic content only (this repo is public), rows are created under the test
// student account, and everything it creates is deleted in a finally block. It touches the
// live DB, so it is NOT part of `npm run test:run`. Exits non-zero on any failed assertion.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolveParagraphWriteIndex, resolveWriteIndex } from '../lib/scaffoldWrite.js'
import {
  buildContinuationSession, buildContinuationScaffold, buildContinuationParagraphs,
} from '../lib/sessionContinuation.js'

const TEST_STUDENT_EMAIL = 'vernick@gmail.com'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const created = []
const fail = []
const ok = (c, m) => { console.log(`${c ? '  PASS' : '  FAIL'}  ${m}`); if (!c) fail.push(m) }

try {
  const { data: student } = await db.from('profiles').select('id').eq('email', TEST_STUDENT_EMAIL).single()
  if (!student) throw new Error(`test student ${TEST_STUDENT_EMAIL} not found`)

  // ── v1: a FINISHED 3-paragraph draft, cursor clamped to 3 (the real v1 end state) ──
  const comps = [0, 1, 2].map(i => ({
    type: ['intro', 'body', 'conclusion'][i], status: 'complete',
    items: [{ id: 'topic_sentence', status: 'confirmed', text: `V1-P${i}-CARRIED-WORDS` }],
  }))
  const { data: v1 } = await db.from('sessions').insert({
    student_id: student.id, status: 'complete', persona: 'owen',
    title: 'GATE-KEEPWORKING-DELETEME', assignment_text: 'synthetic gate fixture',
    completed_at: new Date().toISOString(),
  }).select().single()
  created.push(v1.id)
  await db.from('paragraph_scaffolds').insert({
    session_id: v1.id, assignment_type: 'essay', total_paragraphs: 3,
    current_paragraph_index: 3, components: comps, thesis: 'T',
  })
  await db.from('paragraphs').insert([0, 1, 2].map(i => ({
    session_id: v1.id, position: i, paragraph_index: i,
    scribed_text: `SENTINEL-V1-PARAGRAPH-${i}`, raw_spoken_text: `raw ${i}`,
  })))

  // ── Mint v2 exactly as app/api/sessions/[id]/continue/route.js does ───────────────
  const { data: v1Scaffold } = await db.from('paragraph_scaffolds').select('*').eq('session_id', v1.id).single()
  const { data: v1Paras } = await db.from('paragraphs').select('*').eq('session_id', v1.id).order('position')
  const { data: v2 } = await db.from('sessions')
    .insert({ ...buildContinuationSession(v1, v1Paras, v1Scaffold.components), last_active_at: new Date().toISOString() })
    .select().single()
  created.push(v2.id)
  const scaffoldRow = buildContinuationScaffold(v1Scaffold, v2.id)
  await db.from('paragraph_scaffolds').insert(scaffoldRow)
  await db.from('paragraphs').insert(buildContinuationParagraphs(v1Paras, v2.id))
  console.log(`v2 minted: cursor ${scaffoldRow.current_paragraph_index}, ${scaffoldRow.components.length} carried sections\n`)

  const isContinuation = !!v2.continued_from
  ok(isContinuation, 'v2.continued_from is set, so the guard engages')

  // ── The flow that lost writing: two dictations in the same v2 ─────────────────────
  console.log('\nTwo dictated additions, through the REAL resolver:')
  const paragraphsState = v1Paras.map(p => ({ ...p, session_id: v2.id }))
  const attempts = []
  for (const sentinel of ['SENTINEL-ADDITION-ONE', 'SENTINEL-ADDITION-TWO']) {
    const target = resolveParagraphWriteIndex({ scaffold: scaffoldRow, paragraphs: paragraphsState, isContinuation })
    if (target === null) { console.log(`  ${sentinel}: REFUSED (no write attempted)`); attempts.push(null); continue }
    const { data } = await db.from('paragraphs')
      .upsert({ session_id: v2.id, scribed_text: sentinel, raw_spoken_text: 'raw', position: target, is_thin: false },
        { onConflict: 'session_id,position' }).select().single()
    console.log(`  ${sentinel}: wrote position ${target} (row ${data?.id})`)
    attempts.push(target)
    paragraphsState.push({ position: target, paragraph_index: target, scribed_text: sentinel })
  }
  ok(!attempts.some((t, i) => t !== null && attempts.indexOf(t) !== i),
    'no two saves resolved to the SAME position (the exact loss condition)')

  // ── Assert on the VALUES in the DB, not on status codes ──────────────────────────
  const { data: rows } = await db.from('paragraphs')
    .select('position, scribed_text').eq('session_id', v2.id).order('position')
  console.log('\nv2 paragraphs, read back:')
  for (const r of rows) console.log(`  position ${r.position}: ${r.scribed_text}`)
  const texts = rows.map(r => r.scribed_text)

  console.log('\nCARRIED WORK INTACT:')
  for (const i of [0, 1, 2]) ok(texts.includes(`SENTINEL-V1-PARAGRAPH-${i}`), `v1 paragraph ${i} still present`)
  ok(rows.length === 3, `exactly the 3 carried rows remain, got ${rows.length} (nothing overwritten, nothing orphaned)`)

  // ── The component path (loss #3: carried v1 text overwritten) ────────────────────
  console.log('\nCOMPONENT PATH:')
  ok(resolveWriteIndex(scaffoldRow, { blockWhenOutOfRange: isContinuation }) === null,
    'component writes refuse rather than redirecting onto a finished paragraph')
  ok(resolveWriteIndex(scaffoldRow) === 2,
    'NORMAL sessions keep the old redirect behaviour (regression check)')

  // ── Server backstop: the route guard's own queries, against the real DB ─────────
  console.log('\nSERVER BACKSTOP (a regressed client sending an occupied position anyway):')
  const { data: sess } = await db.from('sessions').select('continued_from').eq('id', v2.id).single()
  const { data: occupied } = await db.from('paragraphs').select('id')
    .eq('session_id', v2.id).eq('position', 2).maybeSingle()
  ok(!!sess?.continued_from && !!occupied, 'route would see continued_from + an occupied position → 409, no write')

  // ══ EDIT PATH (PATCH) — the "continue editing from an existing transcript" route ══
  //
  // The 409 continuation guard above lives in POST only. The Edit button on an assembled
  // paragraph (TutorSession saveDirectEdit) uses PATCH, which targets an EXPLICIT
  // (session_id, position) and never consults the cursor — so it should be structurally
  // immune to the sentinel-cursor collision that forced the kill switch. That was
  // "promising not proven": a live PATCH returned 200, but nothing read the rows back.
  // A 200 proves nothing here — PostgREST reports success for an UPDATE that matched
  // zero rows, which is exactly how the earlier losses hid. So: plant, edit, read back.
  //
  // SCOPE OF PROOF (honest): this reproduces the route's exact PostgREST call shape
  // (.update().eq(session_id).eq(position).select().single()) with the SERVICE-ROLE
  // client, so it proves the ROW SEMANTICS — which rows change and which don't. It does
  // NOT exercise RLS (service role bypasses it). RLS is covered by reading the policy:
  // migration 001 "paragraphs: session owner" is `for all using (session owner)`, and
  // `for all` includes UPDATE, with v2.student_id identical to v1's. Stated, not assumed.
  console.log('\nEDIT PATH (PATCH) — carried paragraph 1 edited, 0 and 2 must not move:')
  const EDITED = 'SENTINEL-EDITED-PARAGRAPH-1'
  const { data: patched, error: patchErr } = await db.from('paragraphs')
    .update({ scribed_text: EDITED })
    .eq('session_id', v2.id).eq('position', 1)
    .select().single()
  ok(!patchErr, `PATCH of a carried paragraph returned no error${patchErr ? ` (got ${patchErr.code} ${patchErr.message})` : ''}`)
  ok(patched?.scribed_text === EDITED, 'PATCH response carries the edited text')

  // The assertion the earlier probe never ran: read the VALUES back.
  const { data: afterEdit } = await db.from('paragraphs')
    .select('position, scribed_text').eq('session_id', v2.id).order('position')
  console.log('v2 paragraphs after the edit:')
  for (const r of afterEdit) console.log(`  position ${r.position}: ${r.scribed_text}`)
  const at = p => afterEdit.find(r => r.position === p)?.scribed_text
  ok(at(1) === EDITED, 'the EDITED paragraph changed (position 1)')
  ok(at(0) === 'SENTINEL-V1-PARAGRAPH-0', 'paragraph 0 was NOT touched by the edit')
  ok(at(2) === 'SENTINEL-V1-PARAGRAPH-2', 'paragraph 2 was NOT touched by the edit')
  ok(afterEdit.length === 3, `still exactly 3 rows, got ${afterEdit.length} (edit updated in place, created nothing)`)

  // A PATCH at a position that holds nothing must FAIL LOUD, not report success. This is
  // the contract saveDirectEdit's (missing) response check depends on: if a zero-row
  // UPDATE came back 200, a client that ignores the response could never tell.
  console.log('\nZERO-ROW PATCH (must not read as success):')
  const { data: ghost, error: ghostErr } = await db.from('paragraphs')
    .update({ scribed_text: 'SENTINEL-SHOULD-NEVER-LAND' })
    .eq('session_id', v2.id).eq('position', 99)
    .select().single()
  console.log(`  → error: ${ghostErr ? `${ghostErr.code} ${ghostErr.message}` : 'NONE'} · data: ${JSON.stringify(ghost)}`)
  ok(!!ghostErr || ghost === null, 'a PATCH matching zero rows surfaces an error / null rather than a silent success')
  const { count: ghostCount } = await db.from('paragraphs')
    .select('id', { count: 'exact', head: true }).eq('session_id', v2.id)
  ok(ghostCount === 3, `zero-row PATCH created nothing, still ${ghostCount} rows`)

  // ── Edit affordance reachability (the UI half of "continue editing") ─────────────
  // TutorSession renders the Edit button only where it finds an assembled paragraph for
  // a scaffold section: paragraphs.find(p => (p.paragraph_index ?? p.position) === idx).
  // If the carry dropped paragraph_index, sections would render with no Edit button and
  // the student would have no way to revise carried work.
  console.log('\nEDIT AFFORDANCE REACHABILITY:')
  const { data: v2Rows } = await db.from('paragraphs')
    .select('position, paragraph_index').eq('session_id', v2.id)
  const reachable = scaffoldRow.components.map((_, idx) =>
    v2Rows.some(p => (p.paragraph_index ?? p.position) === idx))
  ok(reachable.every(Boolean),
    `every carried section resolves an assembled paragraph → Edit renders on all ${reachable.length} (${reachable.map(b => b ? '✓' : '✗').join('')})`)
} finally {
  // Teardown must survive a mid-run throw: anything created above is deleted here, and a
  // failed delete is reported LOUDLY rather than silently leaving synthetic rows in prod.
  let leaked = 0
  for (const id of created) {
    const { error } = await db.from('sessions').delete().eq('id', id)
    if (error) { leaked++; console.error(`  ⚠️  FAILED to delete synthetic session ${id}: ${error.message}`) }
  }
  console.log(`\ncleaned up ${created.length - leaked}/${created.length} synthetic sessions`)

  // Safety net for an EARLIER crashed run (a probe that died before its own cleanup):
  // sweep any leftovers carrying this script's unmistakable synthetic title.
  const { data: orphans } = await db.from('sessions')
    .select('id, created_at').eq('title', 'GATE-KEEPWORKING-DELETEME')
  if (orphans?.length) {
    console.log(`sweeping ${orphans.length} orphaned fixture session(s) from an earlier run`)
    for (const o of orphans) {
      const { error } = await db.from('sessions').delete().eq('id', o.id)
      if (error) console.error(`  ⚠️  FAILED to sweep ${o.id}: ${error.message}`)
    }
  }
  if (leaked) console.error(`\n⚠️  ${leaked} synthetic session(s) may remain — check the test account.`)
  console.log(fail.length ? `\n❌ ${fail.length} GATE ASSERTION(S) FAILED` : '\n✅ GATE GREEN')
  process.exit(fail.length ? 1 : 0)
}
