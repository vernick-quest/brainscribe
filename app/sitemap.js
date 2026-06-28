import { getAllPosts } from '@/lib/blog'
import { SITE_URL } from '@/lib/site'

// Generates /sitemap.xml at build time. Lists only the publicly indexable
// marketing surfaces — the app surfaces (/write, /dashboard, …) are kept out of
// the index via app/robots.js. Post `lastModified` comes from each post's
// frontmatter date, so this stays statically cached (no request-time API).
export default function sitemap() {
  const posts = getAllPosts()
  const latestPostDate = posts[0]?.date || undefined

  const staticPages = [
    { url: `${SITE_URL}/`, lastModified: latestPostDate, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/blog`, lastModified: latestPostDate, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ]

  const postPages = posts.map(post => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.date || undefined,
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  return [...staticPages, ...postPages]
}
