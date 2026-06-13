export const PERSONAS = {
  marcus: {
    name:     'Marcus',
    initial:  'M',
    color:    'var(--tutor-coach)',
    style:    'Direct · real',
    desc:     'Cuts to what matters. No fluff, no detours — just clear thinking.',
  },
  zoe: {
    name:     'Zoe',
    initial:  'Z',
    color:    'var(--tutor-spark)',
    style:    'Curious · warm',
    desc:     'Asks the question that opens everything up.',
  },
  oliver: {
    name:     'Alistair',
    initial:  'A',
    color:    'var(--tutor-sage)',
    style:    'Honest · unhurried',
    desc:     'Takes your idea seriously and helps you think it all the way through.',
  },
  isla: {
    name:     'Verity',
    initial:  'V',
    color:    'var(--tutor-quill)',
    style:    'Attentive · precise',
    desc:     'Catches the detail you almost glossed over and makes it count.',
  },
  sam: {
    name:     'Owen',
    initial:  'O',
    color:    'var(--tutor-muse)',
    style:    'Patient · steady',
    desc:     'Goes at your pace. Keeps you moving without pushing.',
  },
  jordan: {
    name:     'Jade',
    initial:  'J',
    color:    'var(--tutor-nova)',
    style:    'Casual · real',
    desc:     'Talks like a person. Helps you find your own voice.',
  },
}

export function getPersona(id) {
  return PERSONAS[id] ?? PERSONAS.marcus
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
