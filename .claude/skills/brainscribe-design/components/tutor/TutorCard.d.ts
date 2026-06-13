import * as React from 'react'

/**
 * Selectable coaching-persona card. Each tutor has a distinct color and
 * coaching style; the selected card gets a colored ring + check.
 */
export interface TutorCardProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Persona key — drives the accent color + avatar. @default "sage" */
  persona?: 'sage' | 'zip' | 'coach' | 'muse' | 'quill' | 'nova'
  /** Tutor display name, e.g. "Sage". */
  name: string
  /** Short coaching-style label, e.g. "Methodical · calm". */
  style?: string
  /** One- or two-line description of how this tutor coaches. */
  description?: string
  /** Selected state. */
  selected?: boolean
  /** Click handler. */
  onSelect?: () => void
}

export function TutorCard(props: TutorCardProps): JSX.Element
