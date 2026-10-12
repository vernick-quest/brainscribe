'use client'

import { getPersona } from '@/lib/personas'
import { PersonaAvatar } from '@/components/PersonaAvatar'

// "Owen is thinking…" — shown from the moment a turn goes to the coach until the first
// words of the reply appear (2026-10-12). The coach model takes ~4.7s median to its first
// word; an empty pause reads as "it didn't hear me", so the coach visibly thinks.
//
// It sits in the SAME slot, with the same avatar and bubble shape, as the streaming reply
// that replaces it (TutorSession's LiveCaption), so the swap doesn't move anything.
// Colours are tokens only — the dots take the coach's own `--tutor-*` colour, which has
// light AND dark values in app/globals.css. Motion: an opacity-only pulse (no bounce, per
// the brand guide), switched off under prefers-reduced-motion (globals.css).
//
// The screen-reader announcement is NOT in here: a live region that mounts together with
// its text is often not announced. LiveCaption keeps a persistent `role="status"` region
// and puts the same words in it, so this visible copy is aria-hidden to avoid a double read.
export default function CoachThinking({ persona }) {
  const p = getPersona(persona)
  return (
    <div className="flex justify-start" aria-hidden="true" data-coach-thinking="">
      <PersonaAvatar personaId={persona} size={28} className="mr-2 mt-1 shrink-0" />
      <div className="rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed flex items-center gap-2"
        style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
        <span className="coach-thinking-dots" style={{ color: p.color }}>
          <span /><span /><span />
        </span>
        <span>{thinkingLabel(persona)}</span>
      </div>
    </div>
  )
}

/** The words, shared by the visible bubble and the live region. */
export function thinkingLabel(persona) {
  return `${getPersona(persona).name} is thinking…`
}
