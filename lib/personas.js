// `pickerIntro` is DISPLAY-ONLY copy — a 2-sentence blurb shown when a student
// selects a coach on the new-assignment screen. It does NOT drive any coaching
// behavior (that lives entirely in lib/prompts.js). Keep it true to the persona's
// real method there; editing it never changes how the coach acts.
// `asset` is the color/image key in lib/coachColors.js + public/coaches/{asset}.png.
// It equals the persona key for every coach EXCEPT Tilly, whose persona key is
// `matilda` but whose asset/color key is `tilly` (file: /coaches/tilly.png). Keep
// these in sync with COACH_COLORS keys.
export const PERSONAS = {
  owen: {
    name:      'Owen',
    initial:   'O',
    asset:     'owen',
    isDefault: true,
    color:     'var(--tutor-muse)',
    style:     'Patient · steady',
    desc:      'Goes at your pace. Keeps you moving without pushing.',
    pickerIntro: "I'm patient and completely unhurried — we break everything into the smallest possible steps, and there's no wrong answer. Best if writing has felt hard before and you want a calm coach who never rushes you.",
  },
  deon: {
    name:     'Deon',
    initial:  'D',
    asset:    'deon',
    color:    'var(--tutor-coach)',
    style:    'Direct · real',
    desc:     'Cuts to what matters. No fluff, no detours — just clear thinking.',
    pickerIntro: "I'm direct and no-nonsense — we get your ideas down first and polish later, the way a good athletics coach gets your reps in. Best if you tend to overthink and just need help to stop stalling and start moving.",
  },
  zoe: {
    name:     'Zoe',
    initial:  'Z',
    asset:    'zoe',
    color:    'var(--tutor-spark)',
    style:    'Curious · warm',
    desc:     'Asks the question that opens everything up.',
    pickerIntro: "I'm curious and genuinely excited about ideas — I chase the spark in what you're saying and ask the question that cracks the whole thing open. Best if you've got thoughts bubbling and want a coach who helps you explore them.",
  },
  alistair: {
    name:     'Alistair',
    initial:  'A',
    asset:    'alistair',
    color:    'var(--tutor-sage)',
    style:    'Honest · unhurried',
    desc:     'Takes your idea seriously and helps you think it all the way through.',
    pickerIntro: "I'm calm and honest — I take your ideas seriously and I'll tell you plainly when an argument doesn't quite hold up yet. Best if you want straight, unhurried feedback without a lot of fuss or performed enthusiasm.",
  },
  matilda: {
    name:     'Tilly',
    initial:  'T',
    asset:    'tilly',   // persona key `matilda` → asset/color key `tilly`
    color:    'var(--tutor-quill)',
    style:    'Attentive · precise',
    desc:     'Catches the detail you almost glossed over and makes it count.',
    pickerIntro: "I'm warm and I listen closely — I catch the specific thing you almost skipped past and help you make it count. Best if you want a coach who really notices what you say and draws out the details with you.",
  },
  jade: {
    name:     'Jade',
    initial:  'J',
    asset:    'jade',
    color:    'var(--tutor-nova)',
    style:    'Casual · real',
    desc:     'Talks like a person. Helps you find your own voice.',
    pickerIntro: "I'm casual — more like a slightly older friend who's good at writing than a coach. We figure it out side by side, and I'll show you the messy part is just what writing actually is. Best if formal coaching feels stiff and you'd rather just talk it through.",
  },
}

export function getPersona(id) {
  return PERSONAS[id] ?? PERSONAS.owen
}

// PersonaAvatar is a client component (needs useState for the onError fallback), so
// it lives in components/PersonaAvatar.js and is re-exported here. All existing
// `import { PersonaAvatar } from '@/lib/personas'` call sites keep working, and this
// module (getPersona / PERSONAS) stays server-importable.
export { PersonaAvatar } from '@/components/PersonaAvatar'
