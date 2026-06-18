import { Lora } from 'next/font/google'
import { getAllPosts } from '@/lib/blog'

const lora = Lora({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'], display: 'swap' })
const serif = lora.style.fontFamily

export const metadata = {
  title: 'Blog — BrainScribe',
  description: "What's new in BrainScribe — features, fixes, and the thinking behind them.",
}

function formatDate(d) {
  if (!d) return ''
  const date = new Date(d + 'T00:00:00')
  if (isNaN(date)) return d
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function BlogIndex() {
  const posts = getAllPosts()

  return (
    <div style={{ backgroundColor: 'var(--brand-cream)', minHeight: '100vh', color: 'var(--brand-navy)' }}>

      {/* Nav */}
      <nav style={{
        padding: '20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-default)', backgroundColor: 'var(--brand-cream)',
      }}>
        <a href="/"><img src="/brainscribe-logo.png" alt="BrainScribe" style={{ height: 28, width: 'auto' }} /></a>
        <a href="/login" style={{
          backgroundColor: 'var(--brand-orange)', color: '#fff', padding: '9px 20px', borderRadius: 10,
          fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none',
        }}>Sign in</a>
      </nav>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px 100px' }}>

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--brand-orange)', marginBottom: 16 }}>
            Blog
          </p>
          <h1 style={{ fontFamily: serif, fontSize: 'clamp(1.8rem, 4vw, 2.4rem)', fontWeight: 600, lineHeight: 1.25, letterSpacing: '-0.02em', color: 'var(--brand-navy)', marginBottom: 12 }}>
            What's new
          </h1>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
            The features and fixes we ship to make writing feel a little less hard — and the thinking behind them.
          </p>
        </div>

        {posts.length === 0 ? (
          <p style={{ fontSize: '0.95rem', color: 'var(--text-subtle)', fontStyle: 'italic' }}>No posts yet — check back soon.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {posts.map(post => (
              <a key={post.slug} href={`/blog/${post.slug}`} style={{
                display: 'block', textDecoration: 'none',
                backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)',
                borderRadius: 16, padding: '24px 28px', boxShadow: 'var(--shadow-xs)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  {post.tag && (
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--brand-orange)', backgroundColor: 'var(--surface-spark)', padding: '2px 8px', borderRadius: 999 }}>
                      {post.tag}
                    </span>
                  )}
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>{formatDate(post.date)}</span>
                </div>
                <h2 style={{ fontFamily: serif, fontSize: '1.3rem', fontWeight: 600, color: 'var(--brand-navy)', marginBottom: 6, lineHeight: 1.3 }}>
                  {post.title}
                </h2>
                {post.summary && (
                  <p style={{ fontSize: '0.92rem', color: 'var(--text-muted)', lineHeight: 1.65 }}>{post.summary}</p>
                )}
                <span style={{ display: 'inline-block', marginTop: 12, fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-orange)' }}>
                  Read →
                </span>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
