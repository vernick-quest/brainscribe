import * as React from 'react'

/**
 * Round avatar for a tutor persona, a student initial, or a photo.
 * Pass `tutor` to auto-color by coaching persona.
 */
export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Name — first letter used as the fallback initial. */
  name?: string
  /** Photo URL. Overrides the initial. */
  src?: string | null
  /** Persona key — sets the background color. */
  tutor?: 'sage' | 'zip' | 'coach' | 'muse' | 'quill' | 'nova' | null
  /** Explicit background (CSS color) — overrides `tutor`. */
  color?: string | null
  /** @default "md" */
  size?: 'sm' | 'md' | 'lg'
}

export function Avatar(props: AvatarProps): JSX.Element
