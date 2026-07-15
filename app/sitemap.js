import { getAllPosts } from '@/lib/blog'
import { CANONICAL_URL } from '@/lib/site'
import { USE_CASE_SLUGS } from '@/lib/useCases'

// Generates /sitemap.xml. Lists only the publicly indexable marketing surfaces —
// the app surfaces (/write, /dashboard, …) are kept out of the index via
// app/robots.js. Post `lastModified` comes from each post's frontmatter date.
// ISR (revalidate) so a SCHEDULED post enters the sitemap on its publish date —
// matching the ISR blog pages — so Google discovers it promptly without a rebuild.
export const revalidate = 3600

export default function sitemap() {
  const posts = getAllPosts()
  const latestPostDate = posts[0]?.date || undefined

  const staticPages = [
    { url: `${CANONICAL_URL}/`, lastModified: latestPostDate, changeFrequency: 'weekly', priority: 1 },
    { url: `${CANONICAL_URL}/about`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${CANONICAL_URL}/blog`, lastModified: latestPostDate, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${CANONICAL_URL}/writing-help`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${CANONICAL_URL}/compare`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${CANONICAL_URL}/faq`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${CANONICAL_URL}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${CANONICAL_URL}/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ]

  const useCasePages = USE_CASE_SLUGS.map(slug => ({
    url: `${CANONICAL_URL}/writing-help/${slug}`,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const postPages = posts.map(post => ({
    url: `${CANONICAL_URL}/blog/${post.slug}`,
    lastModified: post.date || undefined,
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  return [...staticPages, ...useCasePages, ...postPages]
}
