import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og'

// Default share card, inherited by every route without its own opengraph-image
// (landing, about, legal, …).
export const alt = 'BrainScribe — talk it out. The writing’s still theirs.'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({ title: 'Talk it out. The writing’s still theirs.' })
}
