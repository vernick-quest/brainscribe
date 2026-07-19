// `pickerIntro` is DISPLAY-ONLY copy — a 2-sentence blurb shown when a student
// selects a coach on the new-assignment screen. It does NOT drive any coaching
// behavior (that lives entirely in lib/prompts.js). Keep it true to the persona's
// real method there; editing it never changes how the coach acts.
export const PERSONAS = {
  owen: {
    name:      'Owen',
    initial:   'O',
    isDefault: true,
    color:     'var(--tutor-muse)',
    style:     'Patient · steady',
    desc:      'Goes at your pace. Keeps you moving without pushing.',
    pickerIntro: "I'm patient and completely unhurried — we break everything into the smallest possible steps, and there's no wrong answer. Best if writing has felt hard before and you want a calm coach who never rushes you.",
  },
  deon: {
    name:     'Deon',
    initial:  'D',
    color:    'var(--tutor-coach)',
    style:    'Direct · real',
    desc:     'Cuts to what matters. No fluff, no detours — just clear thinking.',
    pickerIntro: "I'm direct and no-nonsense — we get your ideas down first and polish later, the way a good athletics coach gets your reps in. Best if you tend to overthink and just need help to stop stalling and start moving.",
  },
  zoe: {
    name:     'Zoe',
    initial:  'Z',
    color:    'var(--tutor-spark)',
    style:    'Curious · warm',
    desc:     'Asks the question that opens everything up.',
    pickerIntro: "I'm curious and genuinely excited about ideas — I chase the spark in what you're saying and ask the question that cracks the whole thing open. Best if you've got thoughts bubbling and want a coach who helps you explore them.",
  },
  alistair: {
    name:     'Alistair',
    initial:  'A',
    color:    'var(--tutor-sage)',
    style:    'Honest · unhurried',
    desc:     'Takes your idea seriously and helps you think it all the way through.',
    pickerIntro: "I'm calm and honest — I take your ideas seriously and I'll tell you plainly when an argument doesn't quite hold up yet. Best if you want straight, unhurried feedback without a lot of fuss or performed enthusiasm.",
  },
  matilda: {
    name:     'Tilly',
    initial:  'T',
    color:    'var(--tutor-quill)',
    style:    'Attentive · precise',
    desc:     'Catches the detail you almost glossed over and makes it count.',
    pickerIntro: "I'm warm and I listen closely — I catch the specific thing you almost skipped past and help you make it count. Best if you want a coach who really notices what you say and draws out the details with you.",
  },
  jade: {
    name:     'Jade',
    initial:  'J',
    color:    'var(--tutor-nova)',
    style:    'Casual · real',
    desc:     'Talks like a person. Helps you find your own voice.',
    pickerIntro: "I'm casual — more like a slightly older friend who's good at writing than a coach. We figure it out side by side, and I'll show you the messy part is just what writing actually is. Best if formal coaching feels stiff and you'd rather just talk it through.",
  },
}

export function getPersona(id) {
  return PERSONAS[id] ?? PERSONAS.owen
}

export function PersonaAvatar({ personaId, size = 32, className = '' }) {
  const p = getPersona(personaId)
  return (
    <span
      className={`rounded-full font-bold text-white shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: p.color,
        fontSize: size * 0.4,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-display)',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      {p.initial}
    </span>
  )
}
