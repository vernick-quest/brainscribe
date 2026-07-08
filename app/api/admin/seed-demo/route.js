import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/seed-demo   — create/refresh a demo parent + teacher + student
// DELETE /api/admin/seed-demo — remove the whole demo trio (cascade)
//
// Purpose: give an admin stable, realistic accounts to "Remote in" as, so the
// parent and teacher dashboards can be previewed through the REAL rendering code
// with real-shaped data — no separate fake-preview path to drift from prod.
//
// Why a seeded trio instead of a generic "preview as parent" mode: the parent /
// teacher views are entirely data-driven (relationships + assignment_teachers).
// A roleless preview just shows the empty state; the interesting screens only
// render when a relationship + finished sessions exist behind them.
//
// COPPA: the demo student is deliberately 13+ — an under-13 demo account would
// (a) get its avatar suppressed and (b) be eaten by the 7-day auto-deletion cron,
// which would make a "repeatable" persona anything but. Keep it 13plus.
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_EMAILS = [
  'demo-student@brainscribe.io',
  'demo-parent@brainscribe.io',
  'demo-teacher@brainscribe.io',
]

const STUDENT = { email: 'demo-student@brainscribe.io', full_name: 'Demo Student — Mia R.', role: 'student' }
const PARENT  = { email: 'demo-parent@brainscribe.io',  full_name: 'Demo Parent — Rosa R.',  role: 'parent'  }
const TEACHER = { email: 'demo-teacher@brainscribe.io', full_name: 'Demo Teacher — Mr. Ellis', role: 'teacher' }

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 }
  return { user }
}

// Find an existing demo user by email, or create one (email_confirm so it's a
// usable account even though it never signs in directly — we only remote into it).
// The handle_new_user trigger auto-creates the profiles row; we then set the role
// and demo flags. Idempotent: re-running reuses the existing id.
async function ensureUser(service, spec) {
  const { data: existing } = await service
    .from('profiles').select('id').eq('email', spec.email).maybeSingle()

  let id = existing?.id
  if (!id) {
    const { data, error } = await service.auth.admin.createUser({
      email: spec.email,
      email_confirm: true,
      password: randomUUID(), // never used — these accounts are reached only via remote-in
      user_metadata: { full_name: spec.full_name },
    })
    if (error) throw new Error(`createUser(${spec.email}): ${error.message}`)
    id = data.user.id
  }

  // Authoritative demo state — role, name, 13+ bracket, onboarding done, no photo.
  const { error: upErr } = await service.from('profiles').update({
    full_name: spec.full_name,
    role: spec.role,
    age_bracket: '13plus',
    onboarding_complete: true,
    avatar_url: null,
  }).eq('id', id)
  if (upErr) throw new Error(`updateProfile(${spec.email}): ${upErr.message}`)

  return id
}

// Cross-assignment aggregate (migration 021) → drives <WritingProfileCard>.
function writingProfileAggregate(now) {
  return {
    summary:
      "Mia writes with a clear, persuasive voice and is at her best when she anchors an argument in a personal observation, then backs it with a reason. She's building consistency in structuring multi-paragraph pieces.",
    strengths: ['Clear thesis statements', 'Confident, persuasive tone', 'Connects evidence back to a main claim'],
    growth_areas: ['Developing body paragraphs with more than one example', 'Varying sentence openings'],
    voice: 'Direct and earnest, with the occasional flash of humor',
    vocabulary: 'Grade-appropriate, growing into academic transitions',
    patterns: ['Often opens with a rhetorical question', 'Strong topic sentences, thinner support beneath them'],
    trajectory: 'Improving — her second piece showed tighter structure than her first',
    milestones: ['First completed five-paragraph essay', 'First time working in a counter-argument'],
    based_on_count: 2,
    updated_at: now.toISOString(),
  }
}

// Two finished assignments, each with a Socratic exchange + a final draft. The
// coach never writes for the student — it asks questions; the student's own words
// become the paragraphs. created_at is staggered so the transcript orders cleanly.
function demoSessions(now) {
  const daysAgo = (n) => new Date(now.getTime() - n * 86_400_000)
  const s1 = daysAgo(9)
  const s2 = daysAgo(3)

  return [
    {
      created_at: s1.toISOString(),
      updated_at: daysAgo(8).toISOString(),
      status: 'complete',
      persona: 'owen',
      subject: 'english',
      title: 'Persuasive Essay: Later School Start Times',
      assignment_text:
        'Write a five-paragraph persuasive essay arguing whether middle schools should start the school day later in the morning. Use at least two reasons, each backed by evidence.',
      requirements: {
        targets: [
          { type: 'words', min: 250, max: 400, label: '250–400 words' },
          { type: 'paragraphs', target: 5, label: '5 paragraphs' },
        ],
        actual: { words: 0, paragraphs: 0 },
      },
      writing_profile: { summary: 'Confident persuasive piece; strong thesis, one clear reason developed.' },
      thesis_statement:
        'Middle schools should start the day later because adolescents’ bodies need more sleep than the early schedule allows.',
      messages: [
        ['assistant', "Hi Mia! Before we write a single word — what's your gut reaction? Should school start later, or are you fine with how it is?"],
        ['user', "Later, 100%. I'm basically a zombie in first period."],
        ['assistant', "Ha — a zombie. Let's use that. Why do you think first period hits so hard? Is it just the time, or something about being a teenager?"],
        ['user', "I think teens just need more sleep but we have to get up at like 6am."],
        ['assistant', "You're circling something sleep researchers care a lot about. Can you turn 'teens need more sleep' into one sentence that states your position clearly?"],
        ['user', "Middle schools should start later because teenagers' bodies need more sleep than the early schedule gives them."],
        ['assistant', "That's a real thesis — clear and arguable. Now, what's your strongest reason to lead with: the sleep science, or how tiredness affects your grades?"],
        ['user', "The sleep science I think, then grades after."],
        ['assistant', "Good call — lead with the cause, then the effect. Say the first reason out loud in your own words and I'll help you shape it into a paragraph."],
      ],
      paragraphs: [
        {
          position: 0,
          is_thin: false,
          scribed_text:
            'Have you ever sat in first period and felt like your brain was still asleep? Most middle schoolers have. Schools should start the day later because teenagers’ bodies need more sleep than the early schedule allows, and forcing students to start at 7:30 sets them up to fail before the day even begins.',
          raw_spoken_text:
            'have you ever like sat in first period and felt like your brain is still asleep um most middle schoolers have i think and schools should start later because teenagers bodies need more sleep than the early schedule allows and making us start at 7 30 kind of sets us up to fail before the day even starts',
        },
        {
          position: 1,
          is_thin: false,
          scribed_text:
            'The biggest reason is sleep science. Doctors say teenagers’ internal clocks shift later, so even when we go to bed early our bodies are not ready to sleep. That means a 6 a.m. alarm cuts into the deep sleep we actually need. When I don’t get enough, I can’t focus and I forget what I just read.',
          raw_spoken_text:
            'the biggest reason is sleep science doctors say teenagers internal clocks shift later so even when we go to bed early our bodies arent ready to sleep so a 6am alarm cuts into the deep sleep we actually need and when i dont get enough i cant focus and i forget what i just read',
        },
      ],
    },
    {
      created_at: s2.toISOString(),
      updated_at: daysAgo(2).toISOString(),
      status: 'complete',
      persona: 'deon',
      subject: 'history_us',
      title: 'Causes of the American Revolution',
      assignment_text:
        'In a short essay, explain two of the main causes of the American Revolution. Support each cause with a specific example.',
      requirements: {
        targets: [{ type: 'words', min: 200, max: 350, label: '200–350 words' }],
        actual: { words: 0, paragraphs: 0 },
      },
      writing_profile: { summary: 'Solid two-cause structure; good specific example on taxation.' },
      thesis_statement:
        'Two main causes of the American Revolution were unfair taxation without representation and growing anger over British control.',
      messages: [
        ['assistant', "Hey Mia. This one asks for two causes of the Revolution. Before the textbook answer — if you were a colonist, what would actually make you furious?"],
        ['user', "Probably being taxed on stuff and not getting a say in it."],
        ['assistant', "That instinct is basically the whole slogan of the era. Do you know the phrase colonists used for exactly that frustration?"],
        ['user', "No taxation without representation?"],
        ['assistant', "Exactly. So that's cause one. Can you name a specific tax or law that made colonists feel that way?"],
        ['user', "The Stamp Act? They taxed paper and documents."],
        ['assistant', "Perfect — concrete and specific. Now what's a second, different cause — not another tax, but something about how Britain controlled the colonies?"],
        ['user', "Maybe how Britain kept making rules from far away and the colonists couldn't really push back."],
        ['assistant', "That's a strong second cause. Say both out loud as full sentences and we'll turn them into your paragraph."],
      ],
      paragraphs: [
        {
          position: 0,
          is_thin: false,
          scribed_text:
            'Two main causes of the American Revolution were unfair taxation and growing anger over British control. Colonists believed it was wrong to be taxed by a government they had no vote in. Their rallying cry, “no taxation without representation,” showed how strongly they felt that paying taxes without a voice was unjust.',
          raw_spoken_text:
            'two main causes of the american revolution were unfair taxation and growing anger over british control colonists believed it was wrong to be taxed by a government they had no vote in and their cry no taxation without representation showed how strongly they felt that paying taxes without a voice was unjust',
        },
        {
          position: 1,
          is_thin: false,
          scribed_text:
            'A clear example was the Stamp Act, which taxed printed materials like newspapers and legal documents. Beyond taxes, colonists were frustrated that Britain made rules from thousands of miles away and gave them little power to push back. Together, taxation and distant control pushed the colonies toward revolution.',
          raw_spoken_text:
            'a clear example was the stamp act which taxed printed materials like newspapers and legal documents and beyond taxes colonists were frustrated that britain made rules from thousands of miles away and gave them little power to push back so together taxation and distant control pushed the colonies toward revolution',
        },
      ],
    },
  ]
}

export async function POST() {
  const gate = await requireAdmin()
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const service = createServiceClient()
  const now = new Date()

  try {
    // 1. Accounts (idempotent).
    const studentId = await ensureUser(service, STUDENT)
    const parentId  = await ensureUser(service, PARENT)
    const teacherId = await ensureUser(service, TEACHER)

    // 2. Cross-assignment aggregate on the student.
    await service.from('profiles')
      .update({ writing_profile_aggregate: writingProfileAggregate(now) })
      .eq('id', studentId)

    // 3. Sessions — wipe + reinsert so a refresh is clean (cascade clears the
    //    student's messages/paragraphs/assignment_teachers along with the rows).
    await service.from('sessions').delete().eq('student_id', studentId)

    const specs = demoSessions(now)
    const insertedIds = []
    for (const spec of specs) {
      const { messages, paragraphs, ...sessionRow } = spec
      const { data: inserted, error: sErr } = await service
        .from('sessions')
        .insert({ ...sessionRow, student_id: studentId })
        .select('id')
        .single()
      if (sErr) throw new Error(`insert session: ${sErr.message}`)
      const sessionId = inserted.id
      insertedIds.push(sessionId)

      // Conversation — stagger created_at so the transcript orders deterministically.
      const base = new Date(sessionRow.created_at).getTime()
      const msgRows = messages.map(([role, content], i) => ({
        session_id: sessionId,
        role,
        content,
        created_at: new Date(base + i * 60_000).toISOString(),
      }))
      const { error: mErr } = await service.from('messages').insert(msgRows)
      if (mErr) throw new Error(`insert messages: ${mErr.message}`)

      const paraRows = paragraphs.map(p => ({ ...p, session_id: sessionId }))
      const { error: pErr } = await service.from('paragraphs').insert(paraRows)
      if (pErr) throw new Error(`insert paragraphs: ${pErr.message}`)
    }

    // 3b. Mark the demo sessions as already-audited/skipped so they NEVER enter a
    //     transcript-audit batch. These are staged marketing fixtures, not real
    //     coaching — auditing them would flag a coach-composed demo paragraph and
    //     flatter completion/quality metrics. The audit sampler picks sessions
    //     where NOT EXISTS a transcript_audit_findings row, so a severity='none'
    //     skip-finding removes them from sampling. (Best-effort: if the audit
    //     tables aren't present yet — migration 024 — this is a no-op; the
    //     demo-account filter in audit-batch still excludes them.)
    try {
      const { data: skipRun } = await service
        .from('transcript_audit_runs')
        .insert({ triggered_by: 'admin', triggered_by_user: null, requested_count: 0, status: 'complete', completed_at: now.toISOString() })
        .select('id')
        .single()
      if (skipRun?.id) {
        const skipRows = insertedIds.map(sessionId => ({
          run_id: skipRun.id,
          session_id: sessionId,
          student_id: studentId,
          severity: 'none',
          breach_types: [],
          resolved: true,
          resolved_at: now.toISOString(),
          admin_notes: 'demo/synthetic fixture — auto-skipped from transcript audit (seed-demo).',
        }))
        await service.from('transcript_audit_findings')
          .upsert(skipRows, { onConflict: 'session_id' })
      }
    } catch (skipErr) {
      console.error('[seed-demo] audit skip-marking failed (non-fatal):', skipErr?.message ?? skipErr)
    }

    // 4. Relationship: parent watches student (idempotent via unique constraint).
    const { error: relErr } = await service
      .from('relationships')
      .upsert({ watcher_id: parentId, student_id: studentId }, { onConflict: 'watcher_id,student_id' })
    if (relErr) throw new Error(`relationship: ${relErr.message}`)

    // 5. Teacher linked to both assignments (added_by = the student).
    const atRows = insertedIds.map(sessionId => ({
      session_id: sessionId,
      teacher_id: teacherId,
      added_by: studentId,
    }))
    const { error: atErr } = await service
      .from('assignment_teachers')
      .upsert(atRows, { onConflict: 'session_id,teacher_id' })
    if (atErr) throw new Error(`assignment_teachers: ${atErr.message}`)

    return NextResponse.json({
      ok: true,
      seeded: { studentId, parentId, teacherId, sessions: insertedIds.length },
    })
  } catch (e) {
    return NextResponse.json({ error: e.message ?? 'Seed failed' }, { status: 500 })
  }
}

export async function DELETE() {
  const gate = await requireAdmin()
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const service = createServiceClient()

  try {
    const { data: rows } = await service
      .from('profiles').select('id').in('email', DEMO_EMAILS)

    // Deleting the auth user cascades to profiles → sessions → messages/paragraphs
    // → relationships / assignment_teachers (all FK on delete cascade).
    for (const row of rows ?? []) {
      const { error } = await service.auth.admin.deleteUser(row.id)
      if (error) throw new Error(`deleteUser(${row.id}): ${error.message}`)
    }

    return NextResponse.json({ ok: true, removed: rows?.length ?? 0 })
  } catch (e) {
    return NextResponse.json({ error: e.message ?? 'Teardown failed' }, { status: 500 })
  }
}
