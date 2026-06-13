import * as React from 'react'

/**
 * The voice-capture button — BrainScribe's signature affordance.
 * Orange at rest with a "spark" glow; turns red with pulsing rings
 * while listening. Reduced-motion safe.
 */
export interface MicButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Recording state — shows stop icon + pulsing rings. */
  listening?: boolean
  /** @default "md" */
  size?: 'sm' | 'md'
  disabled?: boolean
}

export function MicButton(props: MicButtonProps): JSX.Element
