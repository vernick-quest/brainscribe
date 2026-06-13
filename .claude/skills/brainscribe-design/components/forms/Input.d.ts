import * as React from 'react'

/**
 * Labeled text field with optional hint and error message. Set
 * `multiline` to render a textarea (used for the assignment paste box).
 *
 * @startingPoint section="Forms" subtitle="Text input & textarea with label, hint, error" viewport="700x200"
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement & HTMLTextAreaElement> {
  /** Field label rendered above the control. */
  label?: string
  /** Helper text shown below when there's no error. */
  hint?: string
  /** Error message — turns the border red and replaces the hint. */
  error?: string
  /** Render a multi-line textarea instead of an input. */
  multiline?: boolean
}

export function Input(props: InputProps): JSX.Element
