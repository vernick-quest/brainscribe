// Shared marketing nav for the public pages (landing, about, blog, legal). One
// header so the logo, links, and CTA stay consistent across surfaces. Inline
// styles + semantic tokens; no client hooks so it renders in server components.
//
// Props:
//   active — 'about' | 'blog' to bold the current section's link (omit on legal/landing)
//   sticky — translucent blurred bar pinned to the top (used on the long legal pages)
const NAV_LINKS = [
  { href: '/about', label: 'About', key: 'about' },
  { href: '/blog', label: 'Blog', key: 'blog' },
]

export default function SiteHeader({ active, sticky = false }) {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
      padding: '16px clamp(20px, 5vw, 40px)',
      borderBottom: '1px solid var(--border-default)',
      ...(sticky
        ? {
            position: 'sticky',
            top: 0,
            zIndex: 50,
            backgroundColor: 'color-mix(in srgb, var(--cream-100) 86%, transparent)',
            backdropFilter: 'blur(10px)',
          }
        : { backgroundColor: 'var(--surface-card)' }),
    }}>
      <a href="/" aria-label="BrainScribe home">
        <img src="/brainscribe-logo.png" alt="BrainScribe" style={{ height: 28, width: 'auto', display: 'block' }} />
      </a>

      <nav style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        {NAV_LINKS.map(l => (
          <a key={l.key} href={l.href}
            aria-current={active === l.key ? 'page' : undefined}
            style={{
              fontSize: '0.9rem',
              fontWeight: active === l.key ? 700 : 500,
              color: active === l.key ? 'var(--text-strong)' : 'var(--text-muted)',
              textDecoration: 'none',
            }}>
            {l.label}
          </a>
        ))}
        <a href="/login" style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-muted)', textDecoration: 'none' }}>
          Sign in
        </a>
        <a href="/login" style={{
          backgroundColor: 'var(--accent)',
          color: 'var(--text-on-accent)',
          padding: '9px 18px',
          borderRadius: 'var(--radius-pill)',
          fontSize: '0.85rem',
          fontWeight: 600,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}>
          Try it free
        </a>
      </nav>
    </header>
  )
}
