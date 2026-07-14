export default function SiteFooter() {
  return (
    <footer style={{
      borderTop: '1px solid var(--border-default)',
      backgroundColor: 'var(--brand-cream)',
      padding: '28px 40px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 12,
    }}>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        © 2026 BrainScribe &nbsp;·&nbsp; Built by a parent who stayed up too late.
      </p>
      <nav style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {[
          { href: '/writing-help', label: 'Writing help' },
          { href: '/compare', label: 'Compare' },
          { href: '/faq',     label: 'FAQ' },
          { href: '/blog',    label: 'Blog' },
          { href: '/about',   label: 'About' },
          { href: '/privacy', label: 'Privacy' },
          { href: '/terms',   label: 'Terms' },
        ].map(({ href, label }) => (
          <a key={href} href={href}
            className="hover:underline"
            style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textDecoration: 'none' }}>
            {label}
          </a>
        ))}
      </nav>
    </footer>
  )
}
