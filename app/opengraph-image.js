import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og'

// Default share card, inherited by every route without its own opengraph-image
// (landing, about, legal, …).
export const alt = 'BrainScribe — the Socratic writing coach for middle & high schoolers'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({ title: 'The Socratic writing coach for middle & high schoolers' })
}
