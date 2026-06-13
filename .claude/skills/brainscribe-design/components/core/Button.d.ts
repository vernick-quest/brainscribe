import * as React from 'react'

/**
 * The primary action button for BrainScribe. Orange `primary` is the
 * warm, inviting default (start, speak, continue); `navy` is for
 * structural/dark contexts; `secondary`/`soft`/`ghost` step down in weight.
 *
 * @startingPoint section="Core" subtitle="Primary, navy, secondary, soft & ghost buttons" viewport="700x220"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual intent. @default "primary" */
  variant?: 'primary' | 'navy' | 'secondary' | 'soft' | 'ghost'
  /** Scale. @default "md" */
  size?: 'sm' | 'md' | 'lg'
  /** Stretch to full container width. */
  block?: boolean
  /** Icon node rendered before the label. */
  leftIcon?: React.ReactNode
  /** Icon node rendered after the label. */
  rightIcon?: React.ReactNode
  /** Render as a different element (e.g. "a"). @default "button" */
  as?: keyof JSX.IntrinsicElements
  children?: React.ReactNode
}

export function Button(props: ButtonProps): JSX.Element
