import * as React from 'react'

/**
 * Surface container — the basic "paper" block. Default is a soft white
 * card with a hairline border and low warm shadow.
 */
export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  /** @default "default" */
  variant?: 'default' | 'flat' | 'raised' | 'muted' | 'ink'
  /** Add hover lift + pointer for clickable cards. */
  interactive?: boolean
  /** Render as a different element. @default "div" */
  as?: keyof JSX.IntrinsicElements
  children?: React.ReactNode
}

export function Card(props: CardProps): JSX.Element
