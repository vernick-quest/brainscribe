// lib/gymCurriculum.js — the Writing Gym curriculum (single source of truth, no
// runtime model calls). 24 skills × 3 tiers, per-skill prerequisite unlocks, typed
// portfolio outputs. Skill keys are the canonical stable IDs from the challenge bank
// (docs/specs/brainscribe-gym-challenge-bank.md) and match lib/gymChallengeBank.js.
//
// Shape/fields follow the build plan §2 (docs/specs/brainscribe-gym-build-plan.md).
// P1 uses: key, tier, week, label, description, prereqs, output_type, timedChallenge,
// placementMarker, lockedInChannel. P2 uses: signals/SKILL_SIGNALS, feeds_into, K.
// (SKILL_SIGNALS values below are P1 best-effort; P2 reconciles them verbatim against
// suggestion-engine.md §1 — the suggestion engine is not built in this pass.)

export const SKILL_SIGNALS_VERSION = 1

export const GYM_SKILLS = [
  // ── Tier 1 — Foundations (amber) — default weeks 1–8 ────────────────────────
  {
    key: 'hook', tier: 1, week: 1, label: 'The Hook',
    description: 'Writing an opening line that makes someone want to keep reading',
    prereqs: [], output_type: 'paragraph', feeds_into: [],
    signals: ['hook', 'opening line', 'opener', 'first sentence', 'grab the reader', 'start stronger', 'boring intro'],
    timedChallenge: null, placementMarker: true, lockedInChannel: 'coach_in_session',
  },
  {
    key: 'specific_detail', tier: 1, week: 2, label: 'Specific Detail',
    description: 'Trading vague words for concrete, picturable specifics',
    prereqs: [], output_type: 'paragraph', feeds_into: ['evidence', 'show_dont_tell'],
    signals: ['specific detail', 'more detail', 'vague', 'concrete', 'be specific', 'add examples', 'too general'],
    timedChallenge: null, placementMarker: true, lockedInChannel: 'coach_in_session',
  },
  {
    key: 'closing_line', tier: 1, week: 3, label: 'The Closing Line',
    description: 'Ending on a line that lands instead of just stopping',
    prereqs: [], output_type: 'paragraph', feeds_into: [],
    signals: ['closing line', 'ending', 'conclusion feels flat', 'last sentence', 'how to end', 'wrap up'],
    timedChallenge: null, placementMarker: true, lockedInChannel: 'coach_in_session',
  },
  {
    key: 'word_choice', tier: 1, week: 4, label: 'Word Choice',
    description: 'Choosing precise, true words instead of flat or fancy ones',
    prereqs: [], output_type: 'pair', feeds_into: ['cutting', 'style_awareness'],
    signals: ['word choice', 'diction', 'stronger verbs', 'precise words', 'flat words', 'vocabulary'],
    timedChallenge: null, placementMarker: false, lockedInChannel: 'coach_in_session',
  },
  {
    key: 'show_dont_tell', tier: 1, week: 5, label: "Show Don't Tell",
    description: 'Making the reader feel something through scene and action, not labels',
    prereqs: ['specific_detail'], output_type: 'paragraph', feeds_into: ['personal_statement_voice'],
    signals: ['show don\'t tell', 'show dont tell', 'showing not telling', 'describe the scene', 'too much telling'],
    timedChallenge: null, placementMarker: true, lockedInChannel: 'coach_in_session',
  },
  {
    key: 'sentence_variety', tier: 1, week: 6, label: 'Sentence Variety',
    description: 'Varying sentence length on purpose so rhythm carries meaning',
    prereqs: [], output_type: 'paragraph', feeds_into: ['style_awareness'],
    signals: ['sentence variety', 'sentence length', 'choppy', 'run-on', 'vary sentences', 'rhythm', 'flow'],
    timedChallenge: null, placementMarker: true, lockedInChannel: 'coach_in_session',
  },
  {
    key: 'cutting', tier: 1, week: 7, label: 'Cutting Ruthlessly',
    description: 'Cutting to fewer words without losing meaning',
    prereqs: ['word_choice'], output_type: 'pair', feeds_into: ['revision'],
    signals: ['cutting', 'too wordy', 'concise', 'trim', 'shorten', 'wordy', 'tighten', 'over the word count'],
    timedChallenge: null, placementMarker: false, lockedInChannel: 'coach_in_session',
  },
  {
    key: 'voice', tier: 1, week: 8, label: 'Finding Your Voice',
    description: 'Writing so it sounds like you, not like a stiff essay',
    prereqs: [], output_type: 'paragraph', feeds_into: ['tone_control', 'personal_statement_voice'],
    signals: ['voice', 'sounds like me', 'personality', 'authentic', 'stiff', 'robotic', 'my own words'],
    timedChallenge: null, placementMarker: false, lockedInChannel: 'async_check',
  },

  // ── Tier 2 — Structure (blue) — default weeks 9–16 ──────────────────────────
  {
    key: 'topic_sentence', tier: 2, week: 9, label: 'The Topic Sentence',
    description: 'Opening a paragraph with one clear, arguable claim',
    prereqs: [], output_type: 'paragraph', feeds_into: ['thesis'],
    signals: ['topic sentence', 'main idea', 'claim', 'paragraph focus', 'point of the paragraph'],
    timedChallenge: null, placementMarker: false, lockedInChannel: 'coach_in_session',
  },
  {
    key: 'counterargument', tier: 2, week: 10, label: 'The Counterargument',
    description: 'Stating the other side fairly, then answering it',
    prereqs: ['topic_sentence'], output_type: 'paragraph', feeds_into: ['entering_conversation', 'complex_argument'],
    signals: ['counterargument', 'other side', 'rebuttal', 'opposing view', 'address objections', 'steelman'],
    timedChallenge: null, placementMarker: false, lockedInChannel: 'coach_in_session',
  },
  {
    key: 'evidence', tier: 2, week: 11, label: 'Evidence',
    description: 'Backing a claim with specific, checkable support',
    prereqs: ['topic_sentence'], output_type: 'paragraph', feeds_into: ['analysis'],
    signals: ['evidence', 'support your claim', 'proof', 'back it up', 'examples', 'cite', 'no support'],
    timedChallenge: null, placementMarker: false, lockedInChannel: 'coach_in_session',
  },
  {
    key: 'analysis', tier: 2, week: 12, label: 'Analysis',
    description: 'Explaining what the evidence means, not just restating it',
    prereqs: ['evidence'], output_type: 'paragraph', feeds_into: ['thesis', 'transitions', 'paragraph_structure'],
    signals: ['analysis', 'explain the evidence', 'so what', 'deeper', 'why it matters', 'just summarizing', 'go deeper'],
    timedChallenge: null, placementMarker: false, lockedInChannel: 'coach_in_session',
  },
  {
    key: 'thesis', tier: 2, week: 13, label: 'The Thesis',
    description: 'Boiling a position into one specific, arguable sentence',
    prereqs: ['analysis'], output_type: 'thesis', feeds_into: ['essay_architecture', 'entering_conversation'],
    signals: ['thesis', 'main argument', 'central claim', 'thesis statement', 'arguable', 'position'],
    timedChallenge: null, placementMarker: false, lockedInChannel: 'coach_in_session',
  },
  {
    key: 'transitions', tier: 2, week: 14, label: 'Transitions',
    description: 'Connecting ideas so one leads into the next',
    prereqs: ['analysis'], output_type: 'multi_paragraph', feeds_into: [],
    signals: ['transitions', 'flow between paragraphs', 'connect ideas', 'choppy between', 'linking', 'segue'],
    timedChallenge: null, placementMarker: false, lockedInChannel: 'coach_in_session',
  },
  {
    key: 'paragraph_structure', tier: 2, week: 15, label: 'Paragraph Structure',
    description: 'Building a unified paragraph: claim → evidence → analysis → close',
    prereqs: ['analysis'], output_type: 'paragraph', feeds_into: ['essay_architecture', 'timed_writing', 'revision'],
    signals: ['paragraph structure', 'organize the paragraph', 'unified paragraph', 'structure', 'disorganized'],
    timedChallenge: null, placementMarker: false, lockedInChannel: 'coach_in_session',
  },
  {
    key: 'essay_architecture', tier: 2, week: 16, label: 'Essay Architecture',
    description: 'Mapping a whole essay: thesis plus labeled sections that each do one job',
    prereqs: ['thesis', 'paragraph_structure'], output_type: 'blueprint', feeds_into: ['complex_argument'],
    signals: ['essay structure', 'outline', 'essay architecture', 'organize the essay', 'whole essay', 'plan the essay'],
    timedChallenge: null, placementMarker: false, lockedInChannel: 'coach_in_session',
  },

  // ── Tier 3 — Craft (purple) — default weeks 17–24 ───────────────────────────
  {
    key: 'tone_control', tier: 3, week: 17, label: 'Tone Control',
    description: 'Shifting register on purpose for different readers',
    prereqs: ['voice'], output_type: 'pair', feeds_into: ['style_awareness'],
    signals: ['tone', 'register', 'formal vs casual', 'audience', 'tone control', 'wrong tone'],
    timedChallenge: { window: 480, optional: true }, placementMarker: false, lockedInChannel: 'coach_in_session',
  },
  {
    key: 'entering_conversation', tier: 3, week: 18, label: 'Entering a Conversation',
    description: 'Positioning your claim against a named existing view',
    prereqs: ['thesis', 'counterargument'], output_type: 'paragraph', feeds_into: [],
    signals: ['entering the conversation', 'they say i say', 'position against', 'scholarly conversation', 'name a view'],
    timedChallenge: null, placementMarker: false, lockedInChannel: 'coach_in_session',
  },
  {
    key: 'timed_writing', tier: 3, week: 19, label: 'Timed Writing',
    description: 'Writing a complete paragraph under a real clock',
    prereqs: ['paragraph_structure'], output_type: 'paragraph', feeds_into: [],
    signals: ['timed writing', 'timed essay', 'test writing', 'on the clock', 'exam', 'speed', 'runs out of time'],
    timedChallenge: { window: 480, optional: false }, placementMarker: false, lockedInChannel: 'coach_in_session',
  },
  {
    key: 'personal_statement_voice', tier: 3, week: 20, label: 'Personal Statement Voice',
    description: 'A first-person paragraph only you could have written',
    prereqs: ['voice', 'specific_detail', 'show_dont_tell'], output_type: 'paragraph', feeds_into: [],
    signals: ['personal statement', 'college essay', 'application essay', 'about myself', 'personal essay', 'common app'],
    timedChallenge: null, placementMarker: false, lockedInChannel: 'async_check',
  },
  {
    key: 'revision', tier: 3, week: 21, label: 'Revision',
    description: 'Taking a real draft and making it measurably better',
    prereqs: ['paragraph_structure', 'cutting'], output_type: 'pair', feeds_into: [],
    signals: ['revision', 'revise', 'edit', 'make it better', 'second draft', 'rewrite', 'improve my draft'],
    timedChallenge: { window: 480, optional: true }, placementMarker: false, lockedInChannel: 'coach_in_session',
  },
  {
    key: 'style_awareness', tier: 3, week: 22, label: 'Style Awareness',
    description: 'Naming your own style moves and deploying them on purpose',
    prereqs: ['tone_control', 'sentence_variety', 'word_choice'], output_type: 'reflection', feeds_into: [],
    signals: ['style', 'my writing style', 'style awareness', 'signature style', 'voice on the page'],
    timedChallenge: null, placementMarker: false, lockedInChannel: 'coach_in_session',
  },
  {
    key: 'complex_argument', tier: 3, week: 23, label: 'Complex Argument',
    description: 'A short multi-paragraph argument: claim, counter+rebuttal, close',
    prereqs: ['essay_architecture', 'counterargument'], output_type: 'multi_paragraph', feeds_into: [],
    signals: ['complex argument', 'nuanced argument', 'multi-paragraph argument', 'argue both sides', 'sophisticated argument'],
    timedChallenge: { window: 480, optional: true }, placementMarker: false, lockedInChannel: 'coach_in_session',
  },
  {
    key: 'portfolio_review', tier: 3, week: 24, label: 'The Portfolio Review',
    description: 'Looking back across your work and naming how you have grown',
    prereqs: [], volumeGate: 12, output_type: 'reflection', feeds_into: [],
    signals: [], // never profile-mapped
    timedChallenge: null, placementMarker: false, lockedInChannel: 'coach_in_session',
  },
]

// Deterministic profile-phrase -> skill mapping. VERBATIM from suggestion-engine.md
// §1 (v1 signal table), mapped to our canonical bank keys (finding_your_voice→voice,
// cutting_ruthlessly→cutting). Case-insensitive substring match; multi-hit allowed
// (scoring in gymSuggest resolves it); generic terms map to the earlier-week skill.
// portfolio_review is sequence-only — never profile-mapped (empty list).
// Versioned by SKILL_SIGNALS_VERSION so a stored suggestion records which table produced it.
export const SKILL_SIGNALS = {
  hook:                      ['hook', 'opening line', 'opener', 'first sentence', 'grab the reader', 'start stronger'],
  specific_detail:           ['vague', 'specific detail', 'concrete', 'vivid', 'generaliz', 'more detail'],
  voice:                     ['voice', 'natural', 'stiff', 'sounds formal', 'essay voice', 'authentic'],
  sentence_variety:          ['sentence variety', 'choppy', 'run-on', 'rhythm', 'same length', 'sentence structure'],
  word_choice:               ['word choice', 'filler', 'weak verb', 'repetitive word', 'precise language', 'very '],
  closing_line:              ['ending', 'closing', 'final sentence', 'trails off', 'last line'],
  show_dont_tell:            ["show don't tell", 'telling', 'summariz', 'scene', 'assert without'],
  cutting:                   ['wordy', 'concise', 'concision', 'tighten', 'redundant', 'repeats', 'trim'],
  topic_sentence:            ['topic sentence', 'main idea of', 'paragraph focus', 'one claim per'],
  evidence:                  ['evidence', 'support a claim', 'support the claim', 'example to back', 'examples to back', 'quote', 'specifics to support'],
  analysis:                  ['analysis', 'explain the evidence', 'explain what the evidence', 'so what', 'interpret', 'connect evidence to'],
  transitions:               ['transition', 'flow between', 'connect ideas', 'jumps between', 'abrupt shift'],
  counterargument:           ['counterargument', 'other side', 'opposing view', 'rebuttal', 'acknowledge'],
  thesis:                    ['thesis', 'central claim', 'arguable', 'main argument'],
  paragraph_structure:       ['paragraph structure', 'unified paragraph', 'organize within paragraph'],
  essay_architecture:        ['organization', 'essay structure', 'introduction and conclusion', 'intro and conclusion', 'outline', 'body paragraph order'],
  tone_control:              ['tone', 'register', 'audience', 'formal for', 'informal for'],
  entering_conversation:     ['other perspectives', 'position the argument', 'sources say', 'join the conversation'],
  timed_writing:             ['under time', 'timed', 'runs out of time', 'on-demand writing'],
  personal_statement_voice:  ['personal statement', 'writing about yourself', 'writing about themself', 'college essay'],
  revision:                  ['revise', 'revision', 'redraft', 'first draft', "doesn't rework", 'settle for draft one'],
  style_awareness:           ['style', 'distinctive', 'writing personality'],
  complex_argument:          ['multi-paragraph argument', 'sustain an argument', 'complex argument'],
  portfolio_review:          [],
}

// Suggestion-engine constants — single source of truth (suggestion-engine.md §2, P2).
export const K = {
  MIN_PROFILE_N: 3, PARTIAL_PROFILE_N: 2, STABLE_STREAK: 2, PLATEAU_STREAK: 3,
  REGRESSION_STREAK: 3, REVISIT_RATE: 3, REVISIT_COOLDOWN_DAYS: 21, OVERRIDE_SOFTEN: 3,
  STALE_SOFT_DAYS: 45, STALE_HARD_DAYS: 90, GYM_SIGNAL_FRESH_DAYS: 30, SESSION_LOOKBACK: 5,
}

// ── Levels ──────────────────────────────────────────────────────────────────
// Milestones, never access locks (design §Levels). Wordsmith/Stylist = all 8 skills
// of the tier at practiced+; Virtuoso = 4 Tier-3 skills + Portfolio Review (Q4).
// NOTE: `key` is the STABLE stored value (gym_progress.current_level has a CHECK
// constraint on these keys, and gymAwards orders on them) — do NOT change keys
// without a migration. `name` is the display ladder, renamed 2026-07-09
// (Finder→Scribe → Builder→Wordsmith → Craftsman→Stylist → Writer→Virtuoso); the
// key↔name mismatch is intentional and migration-free. 'Scholar' is deliberately
// NOT used here — it's reserved for the paid pricing tier (see brainscribe-pricing).
export const LEVELS = [
  { key: 'finder',    name: 'Scribe',    tier: 0 },
  { key: 'builder',   name: 'Wordsmith', tier: 1 },
  { key: 'craftsman', name: 'Stylist',   tier: 2 },
  { key: 'writer',    name: 'Virtuoso',  tier: 3 },
]

// Tiers read amber / blue / purple (design §Skill Curriculum). Orange (--accent) is
// reserved for voice & action, so the amber tier uses a distinct amber, not --accent.
export const TIER_META = {
  1: { name: 'Foundations', color: '#D98A1F' },            // amber
  2: { name: 'Structure',   color: 'var(--tutor-sage)' },  // blue
  3: { name: 'Craft',       color: 'var(--tutor-muse)' },  // purple
}

// ── Lookups & helpers ───────────────────────────────────────────────────────

const SKILL_BY_KEY = Object.fromEntries(GYM_SKILLS.map(s => [s.key, s]))

export function getSkill(key) {
  return SKILL_BY_KEY[key] ?? null
}

export function skillsByTier(tier) {
  return GYM_SKILLS.filter(s => s.tier === tier)
}

/**
 * A skill is UNLOCKED when every prereq is at practiced-or-better (Q1: per-skill
 * prerequisite unlocks). `practicedKeys` is the set/array of skill keys the student
 * has at practiced OR locked_in. Roots (no prereqs) are always unlocked.
 * Portfolio Review has a volume gate instead of prereqs.
 */
export function isUnlocked(skill, practicedKeys, completedSessionCount = 0) {
  const have = practicedKeys instanceof Set ? practicedKeys : new Set(practicedKeys)
  if (skill.volumeGate) return completedSessionCount >= skill.volumeGate
  return skill.prereqs.every(p => have.has(p))
}

export function getUnlockedSkills(practicedKeys, completedSessionCount = 0) {
  return GYM_SKILLS.filter(s => isUnlocked(s, practicedKeys, completedSessionCount))
}

/** The single unmet prereq(s) blocking a locked skill — for "Complete X to unlock". */
export function missingPrereqs(skill, practicedKeys) {
  const have = practicedKeys instanceof Set ? practicedKeys : new Set(practicedKeys)
  if (skill.volumeGate) return []
  return skill.prereqs.filter(p => !have.has(p))
}

/**
 * The default sequential suggestion (P1): the first skill in week order that is
 * unlocked and not yet practiced. The full profile-aware engine is P2 (gymSuggest.js).
 */
export function getNextSequentialSkill(practicedKeys, completedSessionCount = 0) {
  const have = practicedKeys instanceof Set ? practicedKeys : new Set(practicedKeys)
  return GYM_SKILLS.find(s => !have.has(s.key) && isUnlocked(s, have, completedSessionCount)) ?? null
}

/**
 * Level from the set of practiced+ skill keys. Virtuoso (key 'writer') requires 4
 * Tier-3 skills plus Portfolio Review (Q4). `everStarted` grants Scribe (key
 * 'finder') after any first session.
 */
export function getLevel(practicedKeys, everStarted = true) {
  const have = practicedKeys instanceof Set ? practicedKeys : new Set(practicedKeys)
  const tierDone = tier => skillsByTier(tier).every(s => have.has(s.key))
  const t3Count = skillsByTier(3).filter(s => s.key !== 'portfolio_review' && have.has(s.key)).length

  if (t3Count >= 4 && have.has('portfolio_review')) return 'writer'
  if (tierDone(2)) return 'craftsman'
  if (tierDone(1)) return 'builder'
  return everStarted ? 'finder' : null
}

export function feedsInto(key) {
  return GYM_SKILLS.filter(s => s.feeds_into?.includes(key))
}

// ── Grade band ──────────────────────────────────────────────────────────────
// The challenge bank ships three bands: '6-7', '9-10', '11-12'. Map from the
// student's age. P1 has only age_bracket for most accounts (under13 / 13plus), so
// the mapping is coarse and defaults to the middle band when age is unknown; P2's
// placement flow refines this. Never throws.
export function getGradeBand({ age = null, ageBracket = null } = {}) {
  if (typeof age === 'number' && Number.isFinite(age)) {
    if (age <= 12) return '6-7'
    if (age <= 15) return '9-10'
    return '11-12'
  }
  if (ageBracket === 'under13') return '6-7'
  return '9-10'
}
