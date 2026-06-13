import * as React from 'react'

/**
 * Small pill for status, category, or count. Tones map to the semantic
 * palette — use `thin` for the signature "build on this" flag.
 */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** @default "neutral" */
  tone?: 'neutral' | 'navy' | 'accent' | 'success' | 'thin' | 'error' | 'solid'
  /** Show a leading status dot. */
  dot?: boolean
  children?: React.ReactNode
}

export function Badge(props: BadgeProps): JSX.Element
