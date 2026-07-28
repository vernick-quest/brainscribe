// The ISTE EdTech Index listing badge. Usage rules from ISTE (Danny Wagner,
// 2026-07-23): use it AS-IS, don't modify or crop it, keep the text readable, and
// link it to the EdTech Index product page. Scaled PROPORTIONALLY only (266×300 source,
// so any display size must keep the 0.887 ratio) — the asset is served well above its
// display size so it stays crisp on retina. Don't shrink it further: the badge text has
// to stay readable, which is one of ISTE's stated conditions.
//
// ⚠️ It says exactly what it means: BrainScribe is LISTED in the directory. It is NOT
// a quality validation — ISTE issues a separate badge for products that earn one. So
// it sits quietly in the footer with no surrounding "approved / vetted / certified"
// framing. If we ever earn a real validation, that gets its own treatment.
const EDTECH_INDEX_LISTING = 'https://edtechindex.org/product/ultid/P454-E623-146F-48B1-97/'

export default function SiteFooter() {
  return (
    <footer style={{
      borderTop: '1px solid var(--border-default)',
      backgroundColor: 'var(--brand-cream)',
      padding: '18px 40px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <a
          href={EDTECH_INDEX_LISTING}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-flex', flexShrink: 0 }}
        >
          <img
            src="/edtech-index-badge.png"
            alt="Find us on the ISTE EdTech Index"
            width={44}
            height={50}
            style={{ display: 'block', width: 44, height: 50 }}
          />
        </a>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          © 2026 BrainScribe &nbsp;·&nbsp; Built by a parent who stayed up too late.
        </p>
      </div>
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
