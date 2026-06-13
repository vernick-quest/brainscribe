import * as React from 'react'

/**
 * A single chat message. Tutor messages sit left in a cream bubble with an
 * optional "read aloud" (TTS) button; student messages sit right in a navy
 * bubble. When `speaking` is true and children is a string, words highlight
 * one-by-one as a read-along, synced to speech. `raw` renders verbatim
 * spoken text in mono.
 */
export interface ChatBubbleProps extends React.HTMLAttributes<HTMLDivElement> {
  /** @default "tutor" */
  role?: 'tutor' | 'student'
  /** Show the typing caret while a tutor message streams in. */
  streaming?: boolean
  /** TTS currently playing this message — drives the read-along highlight + button pulse. */
  speaking?: boolean
  /** Character index currently being spoken (from a SpeechSynthesis word-boundary
   *  event). Omit and the bubble estimates the reading pace itself. */
  spokenChar?: number | null
  /** Handler for the read-aloud button (tutor only). Omit to hide it. */
  onSpeak?: () => void
  /** Render in mono as raw/verbatim spoken text. */
  raw?: boolean
  children?: React.ReactNode
}

export function ChatBubble(props: ChatBubbleProps): JSX.Element
