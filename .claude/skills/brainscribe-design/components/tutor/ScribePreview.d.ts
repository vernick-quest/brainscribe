import * as React from 'react'

/**
 * Review card for a freshly scribed paragraph. The student approves it
 * into their essay, edits it inline, or discards it. Surfaces the
 * signature "thin — let's build on this" coaching note.
 */
export interface ScribePreviewProps {
  /** The cleaned-up paragraph text. */
  paragraph: string
  /** Whether the scribe flagged the answer as thin. */
  isThin?: boolean
  /** Warm one-line note shown when `isThin`. */
  thinNote?: string
  /** Called when the student approves the paragraph as-is. */
  onApprove?: () => void
  /** Called with the edited text when the student saves edits. */
  onEdit?: (text: string) => void
  /** Called when the student discards the paragraph. */
  onDiscard?: () => void
}

export function ScribePreview(props: ScribePreviewProps): JSX.Element
