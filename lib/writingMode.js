// lib/writingMode.js — is this school work, or writing nobody assigned?
//
// See migration 073 and BACKLOG "✨ FEATURE · P1 — writing_mode". Inferred ONCE at session
// creation and stored; never recomputed on read.
//
// 🔴 THE WHOLE POINT OF THIS MODULE IS THAT ABSENCE PROVES NOTHING.
//
// `sessions.requirements.targets: []` means EITHER "this student genuinely has no
// requirements" OR "the meta pass never got that far". Reading the empty array as
// "personal" is the same error as an empty findings table reading as "nothing at risk"
// when the pass had never run — it resolves an ambiguity in the flattering direction.
//
// So: 'school' and 'personal' each require POSITIVE evidence. Everything else is
// 'unknown', which is honest and must stay distinguishable forever. In particular, when
// the meta pass did not run (`metaRan: false`) the answer is ALWAYS 'unknown', no matter
// how empty the targets look.

export const WRITING_MODES = ['school', 'personal', 'unknown']

// Marks of a brief someone else set. Deliberately conservative: each of these is language
// a teacher writes, not language a student uses about their own story.
const SCHOOL_MARKERS = [
  /\brubric\b/i, /\bpoints?\b\s*(?:possible|each|total)|\b\d+\s*(?:pts?|points)\b/i,
  /\bdue\b/i, /\bgrade[sd]?\b/i, /\bworksheet\b/i, /\bhomework\b/i,
  /\b(?:mr|mrs|ms|miss|mx|prof|professor)\.?\s+[a-z]/i,
  /\bthesis\b/i, /\bcite\b|\bcitation|\bMLA\b|\bAPA\b|\bworks cited\b/i,
  /\bparagraphs?\b/i, /\bessay\b/i, /\bassignment\b/i, /\bprompt\b/i,
  /\bperiod\s*\d|\bclass\b|\bperiod:\s/i, /\blab report\b/i,
]

// Marks of writing the student chose. These are things a student says about their OWN
// work; none of them is a teacher's phrasing.
const PERSONAL_MARKERS = [
  /\bjust (?:want|wanna) to write\b|\bjust want to write\b/i,
  /\bfor fun\b/i, /\bno requirements?\b/i, /\bnobody assigned\b|\bnot for school\b/i,
  /\bmy own (?:story|poem|song|idea|thing)\b/i,
  /\bon my own time\b/i,
]

const has = (patterns, text) => patterns.some(re => re.test(text))

// inferWritingMode({ metaRan, requirements, assignmentText, fromSampleLibrary })
//
//   metaRan            — did the metadata pass actually complete? REQUIRED. When false the
//                        answer is 'unknown': absent targets carry no information because
//                        nothing looked for them.
//   requirements       — the sanitized numeric targets array (words / paragraphs / chars).
//                        Any target at all is a brief someone set.
//   assignmentText     — what the student pasted, typed, or photographed.
//   fromSampleLibrary  — true when the text came from OUR writing-form chooser. That is
//                        positive evidence: the prompt came from us, so no teacher set it.
export function inferWritingMode({
  metaRan,
  requirements = [],
  assignmentText = '',
  fromSampleLibrary = false,
} = {}) {
  // The ambiguity guard. Nothing below may run without it.
  if (metaRan !== true) return 'unknown'

  const text = String(assignmentText ?? '')
  const hasTargets = Array.isArray(requirements) && requirements.length > 0
  const schoolish = hasTargets || has(SCHOOL_MARKERS, text)

  // School evidence wins outright: a curated sample prompt can still be handed out by a
  // teacher, and a mislabelled school assignment is the costlier mistake — it is the one
  // that would drop the requirement language a graded student needs.
  if (schoolish) return 'school'

  if (fromSampleLibrary || has(PERSONAL_MARKERS, text)) return 'personal'

  // No targets and no markers. This is exactly the ambiguous case: it may be free writing,
  // or a one-line brief a teacher gave verbally. Say so instead of guessing.
  return 'unknown'
}
