import { Lora } from 'next/font/google'
import { USE_CASES, USE_CASE_SLUGS } from '@/lib/useCases'
import { CANONICAL_URL, CANONICAL_DESCRIPTION } from '@/lib/site'
import SiteHeader from '@/components/SiteHeader'

const lora = Lora({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal'], display: 'swap' })
const serif = lora.style.fontFamily

const TITLE = 'Writing help for kids who struggle with writing'
const DESCRIPTION =
  'Voice-first writing help for kids who freeze at the blank page — including ADHD and dysgraphia. Guides on getting unstuck, plus how a coaching approach keeps the work the student’s.'

export const metadata = {
  title: `${TITLE} — BrainScribe`,
  description: DESCRIPTION,
  alternates: { canonical: `${CANONICAL_URL}/writing-help` },
  openGraph: { type: 'website', title: TITLE, description: DESCRIPTION, url: `${CANONICAL_URL}/writing-help`, siteName: 'BrainScribe' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

export default function WritingHelpHub() {
  return (
    <div style={{ backgroundColor: 'var(--brand-cream)', minHeight: '100vh', color: 'var(--brand-navy)' }}>
      <SiteHeader />

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 96px' }}>
        <h1 style={{ fontFamily: serif, fontSize: 'clamp(1.9rem, 4vw, 2.6rem)', fontWeight: 600, lineHeight: 1.18, letterSpacing: '-0.02em', margin: 0 }}>
          {TITLE}
        </h1>
        <p style={{ fontSize: '1.12rem', lineHeight: 1.65, color: 'var(--text-muted)', margin: '18px 0 0', maxWidth: 600 }}>
          Some kids know exactly what they want to say and still freeze at the page. These guides cover the most common
          reasons — and practical, voice-first ways to help.
        </p>

        <ul style={{ listStyle: 'none', padding: 0, margin: '36px 0 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {USE_CASE_SLUGS.map(slug => (
            <li key={slug}>
              <a href={`/writing-help/${slug}`} style={{
                display: 'block', padding: '18px 20px', backgroundColor: 'var(--surface-card)',
                border: '1px solid var(--border-default)', borderRadius: 16, textDecoration: 'none',
                boxShadow: 'var(--shadow-xs)',
              }}>
                <span style={{ fontFamily: serif, fontSize: '1.15rem', fontWeight: 600, color: 'var(--brand-navy)', display: 'block' }}>
                  {USE_CASES[slug].h1}
                </span>
                <span style={{ fontSize: '0.92rem', lineHeight: 1.55, color: 'var(--text-muted)', display: 'block', marginTop: 6 }}>
                  {USE_CASES[slug].lead.question}
                </span>
              </a>
            </li>
          ))}
        </ul>

        <div style={{ marginTop: 40, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <a href="/compare" style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-text)', textDecoration: 'none' }}>
            Compare BrainScribe with other tools →
          </a>
          <a href="/faq" style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-text)', textDecoration: 'none' }}>
            Frequently asked questions →
          </a>
        </div>

        <p style={{ marginTop: 44, fontSize: '0.95rem', lineHeight: 1.65, color: 'var(--text-muted)' }}>
          {CANONICAL_DESCRIPTION}
        </p>
      </main>
    </div>
  )
}
