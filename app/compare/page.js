import { Lora } from 'next/font/google'
import { CANONICAL_URL, CANONICAL_DESCRIPTION } from '@/lib/site'
import { faqPageSchema } from '@/lib/schema'
import SiteHeader from '@/components/SiteHeader'
import JsonLd from '@/components/JsonLd'

const lora = Lora({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal'], display: 'swap' })
const serif = lora.style.fontFamily

const TITLE = 'BrainScribe vs. Grammarly, Co:Writer, and ChatGPT for student writing'
const DESCRIPTION =
  'An honest comparison of BrainScribe, Grammarly, Co:Writer, and ChatGPT for student writing — what each one does, which write for the student, and which is voice-first and built to keep the work the student’s own.'

export const metadata = {
  title: `${TITLE} — BrainScribe`,
  description: DESCRIPTION,
  alternates: { canonical: `${CANONICAL_URL}/compare` },
  openGraph: { type: 'article', title: TITLE, description: DESCRIPTION, url: `${CANONICAL_URL}/compare`, siteName: 'BrainScribe' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

const TOOLS = ['Grammarly', 'Co:Writer', 'ChatGPT', 'BrainScribe']

// Rows are deliberately factual and fair — each tool is good at its own job.
const ROWS = [
  { label: 'Primary job', values: ['Check and rewrite existing text', 'Assistive word prediction + speech-to-text', 'General AI assistant', 'Voice-first Socratic writing coach'] },
  { label: 'Writes the content for the student?', values: ['Yes — rewrites and can generate', 'No — predicts/transcribes words', 'Yes — will draft the whole essay', 'No — never writes for the student'] },
  { label: 'Voice-first (talk instead of type)?', values: ['No', 'Yes — dictation', 'Voice input, but it composes text', 'Yes — the student talks it out'] },
  { label: 'Coaches vs. produces text', values: ['Edits your text', 'Provides access, no coaching', 'Produces text by default', 'Asks questions; scribes the student’s words'] },
  { label: 'Readable transcript for parents/teachers?', values: ['No', 'No', 'No verifiable authorship record', 'Yes — full transcript of the session'] },
  { label: 'Built for kids who freeze (ADHD / dysgraphia)?', values: ['Not specifically', 'Built for access', 'General-purpose', 'Yes — grades 6–12, incl. ADHD/dysgraphia'] },
  { label: 'Best for', values: ['Polishing finished writing', 'Removing the physical writing barrier', 'General help (with an integrity risk)', 'A struggling writer’s own ideas, verifiably theirs'] },
]

const LEAD = {
  question: 'What’s the best AI writing tool for a student — Grammarly, Co:Writer, ChatGPT, or BrainScribe?',
  answer:
    'It depends on the job. Grammarly checks and rewrites text a student has already written. Co:Writer is assistive tech — word prediction and dictation — for access. ChatGPT is a general assistant that will write the essay for them. BrainScribe is a voice-first coach that never writes for the student; it draws out their own words. For getting a struggling writer’s own ideas onto the page without doing the work for them, the coaching approach is the distinct one.',
}

const FAQ = [
  {
    question: 'How is BrainScribe different from ChatGPT for schoolwork?',
    answer:
      'ChatGPT will write a finished essay from a prompt, so the words aren’t the student’s and teachers can’t see what the student actually did. BrainScribe is built so it can’t produce the content — it only asks questions and organizes what the student says out loud, and every session is a transcript that shows the work is theirs.',
  },
  {
    question: 'How is BrainScribe different from Grammarly?',
    answer:
      'Grammarly checks grammar and rewrites text a student has already produced — it helps polish, not start. BrainScribe helps a student who is stuck at the blank page get their own ideas down by talking, then tidies their words into a paragraph they approve. They solve opposite ends of the writing process.',
  },
  {
    question: 'How is BrainScribe different from Co:Writer?',
    answer:
      'Co:Writer is assistive technology — word prediction and speech-to-text that removes the physical barrier to writing. BrainScribe uses voice too, but it also coaches: it asks guiding questions and shapes the student’s spoken answers into organized writing, rather than only transcribing what they dictate.',
  },
]

export default function ComparePage() {
  const faqItems = [LEAD, ...FAQ]

  return (
    <div style={{ backgroundColor: 'var(--brand-cream)', minHeight: '100vh', color: 'var(--brand-navy)' }}>
      <JsonLd data={faqPageSchema(faqItems)} />
      <SiteHeader />

      <main style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px 96px' }}>
        <h1 style={{ fontFamily: serif, fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em', margin: 0, maxWidth: 720 }}>
          {TITLE}
        </h1>

        {/* Answer-first lead */}
        <section style={{ marginTop: 28, maxWidth: 720 }}>
          <h2 style={questionStyle}>{LEAD.question}</h2>
          <p style={{ ...answerStyle, fontSize: '1.12rem', color: 'var(--brand-navy)' }}>{LEAD.answer}</p>
        </section>

        {/* Comparison table — scrolls horizontally on small screens */}
        <div style={{ marginTop: 36, overflowX: 'auto', border: '1px solid var(--border-default)', borderRadius: 16 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720, fontSize: '0.9rem' }}>
            <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
              Comparison of Grammarly, Co:Writer, ChatGPT, and BrainScribe for student writing
            </caption>
            <thead>
              <tr>
                <th scope="col" style={{ ...thStyle, textAlign: 'left', minWidth: 190 }}>&nbsp;</th>
                {TOOLS.map(t => (
                  <th key={t} scope="col" style={{ ...thStyle, color: t === 'BrainScribe' ? 'var(--accent-text)' : 'var(--brand-navy)' }}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, ri) => (
                <tr key={row.label} style={{ backgroundColor: ri % 2 ? 'transparent' : 'var(--surface-card)' }}>
                  <th scope="row" style={{ ...cellStyle, textAlign: 'left', fontWeight: 600, color: 'var(--brand-navy)' }}>
                    {row.label}
                  </th>
                  {row.values.map((v, ci) => (
                    <td key={ci} style={{ ...cellStyle, fontWeight: TOOLS[ci] === 'BrainScribe' ? 600 : 400, color: TOOLS[ci] === 'BrainScribe' ? 'var(--brand-navy)' : 'var(--text-muted)' }}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Honest "which should you choose" + FAQ, all answer-first */}
        <section style={{ marginTop: 44, maxWidth: 720 }}>
          <h2 style={questionStyle}>Which should you choose?</h2>
          <p style={answerStyle}>
            If a student needs to polish writing they’ve already produced, use a checker like Grammarly. If they need to
            get past the physical act of writing, an assistive tool like Co:Writer helps. If you want general help and
            aren’t worried about the AI doing the work, a general assistant like ChatGPT is flexible. If the goal is to
            get a struggling writer’s <strong>own</strong> ideas onto the page — by voice, and in a way a teacher can
            verify — a coaching tool like BrainScribe is the distinct fit.
          </p>
        </section>

        {FAQ.map(({ question, answer }) => (
          <section key={question} style={{ marginTop: 32, maxWidth: 720 }}>
            <h2 style={questionStyle}>{question}</h2>
            <p style={answerStyle}>{answer}</p>
          </section>
        ))}

        <section style={{ marginTop: 48, maxWidth: 720, padding: 24, backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 20 }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent-text)', margin: '0 0 10px' }}>
            About BrainScribe
          </p>
          <p style={{ fontSize: '1rem', lineHeight: 1.65, color: 'var(--brand-navy)', margin: '0 0 18px' }}>
            {CANONICAL_DESCRIPTION}
          </p>
          <a href="/login" style={ctaPrimary}>Try it free</a>
        </section>
      </main>
    </div>
  )
}

const questionStyle = { fontFamily: serif, fontSize: 'clamp(1.2rem, 2.6vw, 1.45rem)', fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.01em', color: 'var(--brand-navy)', margin: '0 0 10px' }
const answerStyle = { fontSize: '1rem', lineHeight: 1.7, color: 'var(--text-muted)', margin: 0 }
const thStyle = { padding: '12px 14px', textAlign: 'left', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.02em', borderBottom: '2px solid var(--border-default)', verticalAlign: 'bottom' }
const cellStyle = { padding: '12px 14px', textAlign: 'left', lineHeight: 1.5, borderBottom: '1px solid var(--border-default)', verticalAlign: 'top' }
const ctaPrimary = {
  display: 'inline-block', backgroundColor: 'var(--accent)', color: 'var(--text-on-accent)',
  padding: '12px 26px', borderRadius: 'var(--radius-pill)', fontWeight: 700, fontSize: '0.95rem',
  textDecoration: 'none', boxShadow: 'var(--shadow-spark)',
}
