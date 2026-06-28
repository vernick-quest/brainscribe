import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og'
import { getAllPosts, getPostBySlug } from '@/lib/blog'

// Per-post share card: the post's tag as eyebrow + its title. Prebuilt for every
// post via generateStaticParams, so each one (and every future post) gets its
// own image with no manual asset work.
export const alt = 'BrainScribe blog'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export function generateStaticParams() {
  return getAllPosts().map(p => ({ slug: p.slug }))
}

export default async function Image({ params }) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  return renderOgCard({ eyebrow: post?.tag || '', title: post?.title || 'BrainScribe' })
}
