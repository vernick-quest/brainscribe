import { Lora } from 'next/font/google'
import { notFound } from 'next/navigation'
import { getUseCase, USE_CASE_SLUGS, USE_CASES } from '@/lib/useCases'
import { CANONICAL_URL, CANONICAL_DESCRIPTION } from '@/lib/site'
import { faqPageSchema } from '@/lib/schema'
import SiteHeader from '@/components/SiteHeader'
import JsonLd from '@/components/JsonLd'

const lora = Lora({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'], display: 'swap' })
const serif = lora.style.fontFamily

export function generateStaticParams() {
  return USE_CASE_SLUGS.map(topic => ({ topic }))
}

export async function generateMetadata({ params }) {
  const { topic } = await params
  const uc = getUseCase(topic)
  if (!uc) return { title: 'Not found — BrainScribe' }
  const url = `${CANONICAL_URL}/writing-help/${topic}`
  return {
    title: `${uc.metaTitle} — BrainScribe`,
    description: uc.metaDescription,
    alternates: { canonical: url },
    openGraph: { type: 'article', title: uc.metaTitle, description: uc.metaDescription, url, siteName: 'BrainScribe' },
    twitter: { card: 'summary_large_image', title: uc.metaTitle, description: uc.metaDescription },
  }
}

export default async function UseCasePage({ params }) {
  const { topic } = await params
  const uc = getUseCase(topic)
  if (!uc) notFound()

  // FAQPage schema mirrors exactly what renders (lead + each section).
  const faqItems = [uc.lead, ...uc.sections].map(({ question, answer }) => ({ question, answer }))

  return (
    <div style={{ backgroundColor: 'var(--brand-cream)', minHeight: '100vh', color: 'var(--brand-navy)' }}>
      <JsonLd data={faqPageSchema(faqItems)} />
      <SiteHeader />

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 96px' }}>
        <a href="/writing-help" style={backLink}>← Writing help</a>

        <h1 style={{ fontFamily: serif, fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em', margin: '18px 0 0' }}>
          {uc.h1}
        </h1>

        {/* Lead: question H2 + a complete, self-contained answer directly beneath it */}
        <section style={{ marginTop: 28 }}>
          <h2 style={questionStyle}>{uc.lead.question}</h2>
          <p style={{ ...answerStyle, fontSize: '1.12rem', color: 'var(--brand-navy)' }}>{uc.lead.answer}</p>
        </section>

        {uc.citation && (
          <p style={citationStyle}>
            {uc.citation.text}{' '}
            <a href={uc.citation.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-text)', textDecoration: 'underline', fontWeight: 600 }}>
              — {uc.citation.sourceName}
            </a>
          </p>
        )}

        {uc.sections.map(({ question, answer }) => (
          <section key={question} style={{ marginTop: 32 }}>
            <h2 style={questionStyle}>{question}</h2>
            <p style={answerStyle}>{answer}</p>
          </section>
        ))}

        {/* Canonical entity line — repeated verbatim across pages for AI-assistant entity resolution */}
        <section style={{ marginTop: 48, padding: '24px', backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 20 }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent-text)', margin: '0 0 10px' }}>
            About BrainScribe
          </p>
          <p style={{ fontSize: '1rem', lineHeight: 1.65, color: 'var(--brand-navy)', margin: '0 0 18px' }}>
            {CANONICAL_DESCRIPTION}
          </p>
          <a href="/login" style={ctaPrimary}>Try it free</a>
        </section>

        {/* Related use-case pages — internal links aid crawlability */}
        {uc.related?.length > 0 && (
          <nav style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--border-default)' }}>
            <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 12px' }}>
              Related
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {uc.related.map(slug => USE_CASES[slug] && (
                <li key={slug}>
                  <a href={`/writing-help/${slug}`} style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-text)', textDecoration: 'none' }}>
                    {USE_CASES[slug].h1} →
                  </a>
                </li>
              ))}
              <li>
                <a href="/faq" style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-text)', textDecoration: 'none' }}>
                  Frequently asked questions →
                </a>
              </li>
            </ul>
          </nav>
        )}
      </main>
    </div>
  )
}

const backLink = { fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none' }
const questionStyle = { fontFamily: serif, fontSize: 'clamp(1.2rem, 2.6vw, 1.45rem)', fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.01em', color: 'var(--brand-navy)', margin: '0 0 10px' }
const answerStyle = { fontSize: '1rem', lineHeight: 1.7, color: 'var(--text-muted)', margin: 0 }
const citationStyle = { fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-muted)', margin: '18px 0 0', padding: '12px 16px', backgroundColor: 'var(--surface-spark)', borderRadius: 12, borderLeft: '3px solid var(--accent)' }
const ctaPrimary = {
  display: 'inline-block', backgroundColor: 'var(--accent)', color: 'var(--text-on-accent)',
  padding: '12px 26px', borderRadius: 'var(--radius-pill)', fontWeight: 700, fontSize: '0.95rem',
  textDecoration: 'none', boxShadow: 'var(--shadow-spark)',
}
