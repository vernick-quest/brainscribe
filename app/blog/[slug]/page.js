import { Lora } from 'next/font/google'
import { notFound } from 'next/navigation'
import { getAllPosts, getPostBySlug } from '@/lib/blog'
import { CANONICAL_URL } from '@/lib/site'
import SiteHeader from '@/components/SiteHeader'

const lora = Lora({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'], display: 'swap' })
const serif = lora.style.fontFamily

export function generateStaticParams() {
  return getAllPosts().map(p => ({ slug: p.slug }))
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return { title: 'Not found — BrainScribe' }
  const url = `${CANONICAL_URL}/blog/${post.slug}`
  const description = post.summary || undefined
  // The per-post opengraph-image.js auto-injects the og:image / twitter:image
  // tags for this route — no need to set `images` here.
  return {
    title: `${post.title} — BrainScribe`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      title: post.title,
      description,
      url,
      siteName: 'BrainScribe',
      publishedTime: post.date || undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description,
    },
  }
}

function formatDate(d) {
  if (!d) return ''
  const date = new Date(d + 'T00:00:00')
  if (isNaN(date)) return d
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default async function BlogPostPage({ params }) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()

  const url = `${CANONICAL_URL}/blog/${post.slug}`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.summary || undefined,
    datePublished: post.date || undefined,
    dateModified: post.date || undefined,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    image: `${url}/opengraph-image`,
    author: { '@type': 'Organization', name: 'BrainScribe', url: CANONICAL_URL },
    publisher: {
      '@type': 'Organization',
      name: 'BrainScribe',
      logo: { '@type': 'ImageObject', url: `${CANONICAL_URL}/brainscribe-logo.png` },
    },
  }

  return (
    <div style={{ backgroundColor: 'var(--brand-cream)', minHeight: '100vh', color: 'var(--brand-navy)' }}>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <SiteHeader active="blog" />

      <main style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px 100px' }}>

        <a href="/blog" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 28 }}>
          ← All posts
        </a>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            {post.tag && (
              <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent-text)', backgroundColor: 'var(--surface-spark)', padding: '2px 8px', borderRadius: 999 }}>
                {post.tag}
              </span>
            )}
            <span style={{ fontSize: '0.82rem', color: 'var(--text-subtle)' }}>{formatDate(post.date)}</span>
          </div>
          <h1 style={{ fontFamily: serif, fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em', color: 'var(--brand-navy)' }}>
            {post.title}
          </h1>
        </div>

        {/* Body */}
        <article className="blog-prose" dangerouslySetInnerHTML={{ __html: post.html }} />

        {/* Footer */}
        <div style={{ marginTop: 56, paddingTop: 28, borderTop: '1px solid var(--border-default)' }}>
          <a href="/blog" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-text)', textDecoration: 'none' }}>
            ← Back to all posts
          </a>
        </div>
      </main>
    </div>
  )
}
