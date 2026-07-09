// lib/gymPlacement.js — Writing Gym placement (P2). Server-only.
//
// A new gym-first student's FIRST session is a warm-up (session_type='warmup'): one
// fun personal paragraph, NEVER called a test. It's scored async by Haiku against the
// five one-shot Tier-1 markers using the CORRECTED scorer (placement-validation.md §4,
// carried VERBATIM below — do not edit the prompt). Met markers pre-award Practiced
// (source='placement') with the quoted span as evidence; the warm-up paragraph becomes
// a portfolio 'placement_warmup' entry. Existing assignment-mode students skip the
// warm-up and are profile-seeded instead (source='profile').
//
// Non-negotiables enforced in code (belt-and-suspenders over the prompt):
//   • Sentence Variety is NEVER scored from a voice transcript → insufficient_sample.
//   • Evidence-or-nothing: a "met" with no quotable span is downgraded (rule 5).
//   • insufficient_sample is a non-signal, never a deficit (skipped in entry scan).

import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/service'
import { recordAnthropicUsage } from '@/lib/usage'
import { GYM_SKILLS, SKILL_SIGNALS } from '@/lib/gymCurriculum'
import { awardPracticed, recomputeLevel, ensureGymProgress } from '@/lib/gymAwards'
import { recomputeSuggestion } from '@/lib/gymSuggest'

const anthropic = new Anthropic()

// The five one-shot placement markers, in the scorer's output order. Marker names ARE
// skill keys.
export const SCORER_MARKERS = ['hook', 'specific_detail', 'sentence_variety', 'show_dont_tell', 'closing_line']
// Entry-point scan runs in CURRICULUM (week) order, which differs from the output order.
export const ENTRY_SCAN_ORDER = GYM_SKILLS
  .filter(s => s.placementMarker).sort((a, b) => a.week - b.week).map(s => s.key)

// The warm-up prompt — personal, low-stakes, never framed as a test (design §Placement).
export const WARMUP_PROMPT = 'Describe the best thing you ate this week — like you\'re trying to convince me to go try it.'

export function buildWarmupAssignmentText() {
  return [
    'Skill Studio — warm-up',
    "Before we pick a skill, I'd love to see how you already write. This isn't graded and it isn't a test — just a quick, fun paragraph so I can find a good place for us to start.",
    `\nWrite a short paragraph: ${WARMUP_PROMPT}`,
  ].join('\n')
}

// ── The corrected scorer prompt (placement-validation.md §4 — VERBATIM) ──────────
function buildScorerPrompt({ age, inputMode, paragraph }) {
  return `You are scoring one warm-up paragraph written (or dictated) by a student, age ${age},
in a writing-practice app. This is a low-stakes internal placement signal. The student
never sees a score, a grade, or the word "test." Your output pre-awards practice
badges and picks a starting suggestion — it can never block anything.

Score FIVE markers INDEPENDENTLY. For each, output exactly one of:
"met" | "not_met" | "insufficient_sample", plus "evidence": the exact quoted span
that earned a "met" (null otherwise).

GROUND RULES — apply before scoring any marker:

1. REGISTER. input_mode = ${inputMode}. If "voice_transcript": the text is a speech
   transcript. It will contain filler words (um, like, okay so), false starts,
   trailing sign-offs ("so yeah", "anyway", "that's it"), and punctuation chosen by
   the transcriber, not the student. Before scoring: ignore leading filler/false
   starts and trailing sign-offs. Never treat transcript punctuation or sentence
   breaks as the student's stylistic choice.

2. MINIMUM SAMPLE. If the text is below a marker's floor, output
   "insufficient_sample" for that marker — never "not_met". Floors:
   - Hook: at least 1 real content sentence.
   - Specific Detail: at least 15 words (bullets/fragments count).
   - Show Don't Tell: at least 25 words.
   - Closing Line: at least 3 sentences and 40 words.
   - Sentence Variety: at least 4 sentences AND input_mode = "typed".
     For voice transcripts, Sentence Variety is ALWAYS "insufficient_sample"
     (transcript punctuation is not evidence), unless the student unmistakably
     dictated a short punch line doing deliberate emphasis — then quote it.

3. SCORE THE MOVE, NOT THE ENGLISH. Grammar, spelling, tense, and non-native
   phrasing are irrelevant to every marker. A student writing in imperfect English
   who names picturable specifics has met Specific Detail.

4. OFF-PROMPT IS FINE. If the student wrote about something other than the prompt,
   score what they actually wrote. These markers are prompt-independent. A complaint
   about the prompt can itself be a hook. Never mark anything down for topic,
   attitude, or format (bullets are scoreable text).

5. EVIDENCE OR NOTHING. "met" requires a quotable span. Never award from overall
   impression, enthusiasm, vocabulary level, or absence of errors. If you cannot
   quote it, it is not "met".

6. TIE-BREAK. If you have a quotable candidate span and are genuinely torn on
   whether it clears the bar, award "met". A generous award here is cheap by
   design (a later practice rep verifies it); a missed award tells a capable
   student to drill what they already do. But rule 5 outranks this: no span,
   no award.

THE FIVE MARKERS:

HOOK — "met" if the FIRST content sentence (after rule-1 stripping) creates
curiosity, tension, or a concrete image, rather than announcing the topic.
"The best thing I ate this week was pizza" = announcement = not_met.
"Nobody believes me that the best thing I ate this week came out of a gas
station" = met. An announcement that itself carries a twist or image can be met.

SPECIFIC DETAIL — "met" if there are at least 2 picturable details the student
CHOSE, beyond naming the item the prompt asked about: sensory qualities ("the
broth fogged up my glasses"), proper nouns ("the truck on 24th"), numbers,
physical particulars ("the egg cut in half so the middle is still jammy").
Bare item-naming ("chicken nuggets and a slushie") is not detail — the prompt
elicited it. Praise adjectives ("amazing", "transcendent", "delicious") are
never details, in any quantity.

SENTENCE VARIETY (typed input only) — "met" if the paragraph deliberately mixes
sentence lengths: at least one sentence under ~8 words and one over ~20, AND the
short sentence is doing emphasis work — a punch, a turn ("Warm changes
everything."). A filler fragment or trailing "Yeah." does not count as the short
sentence.

SHOW DON'T TELL — "met" only if the paragraph makes the reader feel or conclude
something it NEVER states: an emotion or judgment carried entirely by scene,
action, or sensory rendering ("I stood in the parking lot eating them off the
hood because I could not wait" — eagerness, never named). Vivid narration of
events alone is not the move; spoken storytelling is naturally scenic, so on
voice transcripts require the scene to clearly carry an unstated feeling or
judgment. Stating the feeling and then illustrating it counts only if some other
instance is fully unstated. Figurative praise ("a symphony of flavors") is
telling, not showing.

CLOSING LINE — "met" if the FINAL content sentence (after rule-1 stripping)
turns the idea, echoes the opening, zooms out, or leaves an image — instead of
restating what was said or just stopping. "In conclusion, that is why..." =
not_met. "It's a gas station." (after opening on a gas station) = met.

OUTPUT (JSON only):
{
  "hook":            {"verdict": "...", "evidence": "..."},
  "specific_detail": {"verdict": "...", "evidence": "..."},
  "sentence_variety":{"verdict": "...", "evidence": "..."},
  "show_dont_tell":  {"verdict": "...", "evidence": "..."},
  "closing_line":    {"verdict": "...", "evidence": "..."}
}

THE PARAGRAPH TO SCORE:
${paragraph}`
}

function extractJSON(text) {
  try { return JSON.parse(text) } catch {}
  const m = text.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch {} }
  return null
}

const VALID_VERDICTS = new Set(['met', 'not_met', 'insufficient_sample'])

/**
 * Normalize + enforce the code-side non-negotiables over the model's raw JSON.
 * Returns { [marker]: { verdict, evidence } } for all five markers.
 */
export function normalizeVerdicts(raw, inputMode) {
  const out = {}
  for (const marker of SCORER_MARKERS) {
    const r = raw?.[marker] ?? {}
    let verdict = VALID_VERDICTS.has(r.verdict) ? r.verdict : 'insufficient_sample'
    let evidence = typeof r.evidence === 'string' && r.evidence.trim() ? r.evidence.trim() : null
    // Rule 5 — evidence or nothing: a "met" without a quotable span cannot pre-award.
    if (verdict === 'met' && !evidence) verdict = 'not_met'
    out[marker] = { verdict, evidence }
  }
  // Non-negotiable: never score Sentence Variety from a voice transcript.
  if (inputMode === 'voice_transcript') {
    out.sentence_variety = { verdict: 'insufficient_sample', evidence: null }
  }
  return out
}

/**
 * Downstream selection from normalized verdicts (pure, testable):
 *   metMarkers    — [{ skill, evidence }] to pre-award Practiced.
 *   insufficient  — count of insufficient_sample markers.
 *   secondLook    — ≥3 insufficient → thin sample, re-score the first real paragraph.
 *   entryPoint    — first not_met in curriculum order, unless secondLook (→ null/default path).
 */
export function placementDownstream(verdicts) {
  const metMarkers = SCORER_MARKERS
    .filter(m => verdicts[m]?.verdict === 'met')
    .map(m => ({ skill: m, evidence: verdicts[m].evidence }))
  const insufficient = SCORER_MARKERS.filter(m => verdicts[m]?.verdict === 'insufficient_sample').length
  const secondLook = insufficient >= 3
  const entryPoint = secondLook
    ? null
    : (ENTRY_SCAN_ORDER.find(m => verdicts[m]?.verdict === 'not_met') ?? null)
  return { metMarkers, insufficient, secondLook, entryPoint }
}

/** Score one warm-up paragraph with Haiku. Returns normalized verdicts + downstream. */
export async function scorePlacement({ age, inputMode, paragraph, userId, sessionId }) {
  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    system: 'You are a precise JSON generator. Output ONLY valid JSON — no explanation, no markdown, no code fences.',
    messages: [{ role: 'user', content: buildScorerPrompt({ age: age ?? 'unknown', inputMode, paragraph }) }],
  })
  await recordAnthropicUsage({
    model: 'claude-haiku-4-5-20251001',
    inputTokens: resp.usage?.input_tokens ?? 0,
    outputTokens: resp.usage?.output_tokens ?? 0,
    sessionId, userId,
  })
  const raw = extractJSON(resp.content?.[0]?.text ?? '') ?? {}
  const verdicts = normalizeVerdicts(raw, inputMode)
  return { verdicts, ...placementDownstream(verdicts) }
}

/**
 * Apply placement: pre-award Practiced for each met marker (evidence span stored) and
 * recompute level. Returns the list of newly-awarded skills.
 */
export async function applyPlacementAwards(studentId, metMarkers, { portfolioEntryId = null } = {}) {
  const awarded = []
  for (const { skill, evidence } of metMarkers) {
    const res = await awardPracticed(studentId, skill, {
      source: 'placement', evidenceRef: portfolioEntryId, evidenceSpan: evidence,
    })
    if (res.awarded) awarded.push(skill)
  }
  await recomputeLevel(studentId)
  return awarded
}

/** Persist the placement record on gym_progress (service-role). */
export async function savePlacement(studentId, placement) {
  const supabase = createServiceClient()
  await supabase.from('gym_progress')
    .update({ placement, updated_at: new Date().toISOString() })
    .eq('student_id', studentId)
}

// ── Existing-student profile seeding ────────────────────────────────────────────
// Their profile IS their placement: map aggregate.strengths → skill keys via
// SKILL_SIGNALS, cap to the five one-shot T1 markers, pre-award Practiced
// (source='profile', no single quotable span). Growth areas seed the suggestion queue
// (handled by the engine, not here).
export function mapStrengthsToMarkers(aggregate) {
  const strengths = (aggregate?.strengths ?? []).map(s => String(s).toLowerCase())
  const hits = new Set()
  for (const marker of SCORER_MARKERS) {
    const signals = SKILL_SIGNALS[marker] ?? []
    if (strengths.some(str => signals.some(sig => str.includes(sig)))) hits.add(marker)
  }
  return [...hits]
}

/** The warm-up paragraph → a 'placement_warmup' portfolio entry (service-role). */
export async function createPlacementPortfolioEntry({ studentId, gymSessionId, text, inputMode }) {
  const supabase = createServiceClient()
  if (!text) return null
  const { data, error } = await supabase.from('portfolio_entries').insert({
    student_id: studentId,
    gym_session_id: gymSessionId,
    skill_key: 'placement_warmup',
    skill_label: 'Warm-up',
    tier: 1,
    entry_type: 'placement_warmup',
    content: { text, input_mode: inputMode },
  }).select().single()
  if (error) { console.error('[gymPlacement] portfolio entry failed:', error.message); return null }
  return data
}

/**
 * Idempotent first-touch init for the gym home. On the student's FIRST gym visit:
 * creates gym_progress, and if they're an EXISTING assignment-mode student
 * (writing_profile_aggregate with based_on_count ≥ 1) seeds Practiced from their
 * profile strengths (their profile IS their placement — no warm-up) and computes a
 * first suggestion. Returns { created, seeded, seededSkills }. Cheap no-op after the
 * first visit. Service-role.
 */
export async function initGymForStudent(studentId) {
  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('gym_progress').select('id').eq('student_id', studentId).maybeSingle()
  if (existing) return { created: false, seeded: false, seededSkills: [] }

  await ensureGymProgress(studentId)
  const { data: prof } = await supabase
    .from('profiles').select('writing_profile_aggregate').eq('id', studentId).single()
  const agg = prof?.writing_profile_aggregate ?? null
  if (agg && (agg.based_on_count ?? 0) >= 1) {
    const seededSkills = await seedFromProfile(studentId, agg)
    await recomputeSuggestion(studentId).catch(e => console.error('[gymPlacement] init recompute:', e))
    return { created: true, seeded: true, seededSkills }
  }
  return { created: true, seeded: false, seededSkills: [] }
}

/** Pre-award profile-seeded markers for an existing student. Returns awarded keys. */
export async function seedFromProfile(studentId, aggregate) {
  const markers = mapStrengthsToMarkers(aggregate)
  const awarded = []
  for (const skill of markers) {
    const res = await awardPracticed(studentId, skill, { source: 'profile' })
    if (res.awarded) awarded.push(skill)
  }
  if (awarded.length) await recomputeLevel(studentId)
  return awarded
}
