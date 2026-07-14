import { Lora } from 'next/font/google'
import { CANONICAL_URL, CANONICAL_DESCRIPTION } from '@/lib/site'
import { faqPageSchema } from '@/lib/schema'
import SiteHeader from '@/components/SiteHeader'
import JsonLd from '@/components/JsonLd'

const lora = Lora({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal'], display: 'swap' })
const serif = lora.style.fontFamily

const TITLE = 'BrainScribe FAQ'
const DESCRIPTION =
  'Answers to common questions about BrainScribe — whether it writes essays for kids, if it’s good for ADHD and dysgraphia, whether parents and teachers can see the work, and what grades it’s for.'

export const metadata = {
  title: 'Frequently asked questions — BrainScribe',
  description: DESCRIPTION,
  alternates: { canonical: `${CANONICAL_URL}/faq` },
  openGraph: { type: 'website', title: TITLE, description: DESCRIPTION, url: `${CANONICAL_URL}/faq`, siteName: 'BrainScribe' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

// Answer-first, neutral. Each `answer` is plain text so it can go verbatim into
// the FAQPage schema (Google requires FAQ schema to match visible content).
const FAQ = [
  {
    question: 'What is BrainScribe?',
    answer:
      'BrainScribe is a voice-first, Socratic AI writing coach for students in grades 6–12, including kids with ADHD and dysgraphia. Instead of writing for the student, it asks coaching questions, the student answers out loud, and a scribe cleans their spoken words into a paragraph they approve.',
  },
  {
    question: 'Does BrainScribe write essays for kids?',
    answer:
      'No. BrainScribe is designed so it cannot write the essay. It only works from the student’s own spoken words: it asks questions, the student answers, and a scribe organizes what they said into sentences they approve. The ideas and wording stay the student’s, and a transcript records exactly how the writing was made.',
  },
  {
    question: 'Is BrainScribe good for kids with ADHD or dysgraphia?',
    answer:
      'Yes. BrainScribe was built for kids who freeze at the blank page, which commonly includes students with ADHD and dysgraphia. Talking removes the handwriting, typing, and cold-start barriers that make writing hard, and the coach breaks the task into small, spoken steps.',
  },
  {
    question: 'Can parents and teachers see the student’s work?',
    answer:
      'Yes. Every session is saved as a full transcript. A student’s linked parents and teachers can read the whole back-and-forth, so they can see the ideas came from the student and confirm the work is genuinely theirs.',
  },
  {
    question: 'What grades is BrainScribe for?',
    answer:
      'BrainScribe is designed for students in grades 6–12 (roughly ages 11–17), including middle and high schoolers with ADHD or dysgraphia.',
  },
  {
    question: 'How does the voice-first writing work?',
    answer:
      'The student speaks their ideas out loud instead of typing. Speech-to-text captures what they say, the coach asks follow-up questions to draw out their thinking, and a scribe tidies the filler from their speech into clean sentences the student reviews and approves.',
  },
  {
    question: 'Isn’t using AI for writing cheating?',
    answer:
      'It depends on what the AI does. A tool that writes the essay for a student skips the learning. BrainScribe doesn’t write anything the student didn’t say — it coaches and organizes their own words, and the transcript makes the process visible. The work stays the student’s, which is what teachers care about.',
  },
  {
    question: 'Is BrainScribe free?',
    answer:
      'BrainScribe is free to start. You sign in with Google and can try a coaching session at no cost.',
  },
]

export default function FaqPage() {
  return (
    <div style={{ backgroundColor: 'var(--brand-cream)', minHeight: '100vh', color: 'var(--brand-navy)' }}>
      <JsonLd data={faqPageSchema(FAQ)} />
      <SiteHeader />

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 96px' }}>
        <h1 style={{ fontFamily: serif, fontSize: 'clamp(1.9rem, 4vw, 2.6rem)', fontWeight: 600, lineHeight: 1.18, letterSpacing: '-0.02em', margin: 0 }}>
          Frequently asked questions
        </h1>

        {FAQ.map(({ question, answer }) => (
          <section key={question} style={{ marginTop: 32 }}>
            <h2 style={questionStyle}>{question}</h2>
            <p style={answerStyle}>{answer}</p>
          </section>
        ))}

        <section style={{ marginTop: 48, padding: 24, backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 20 }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent-text)', margin: '0 0 10px' }}>
            About BrainScribe
          </p>
          <p style={{ fontSize: '1rem', lineHeight: 1.65, color: 'var(--brand-navy)', margin: '0 0 18px' }}>
            {CANONICAL_DESCRIPTION}
          </p>
          <a href="/login" style={ctaPrimary}>Try it free</a>
        </section>

        <nav style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--border-default)', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <a href="/writing-help" style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-text)', textDecoration: 'none' }}>Writing-help guides →</a>
          <a href="/compare" style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-text)', textDecoration: 'none' }}>Compare tools →</a>
        </nav>
      </main>
    </div>
  )
}

const questionStyle = { fontFamily: serif, fontSize: 'clamp(1.2rem, 2.6vw, 1.45rem)', fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.01em', color: 'var(--brand-navy)', margin: '0 0 10px' }
const answerStyle = { fontSize: '1rem', lineHeight: 1.7, color: 'var(--text-muted)', margin: 0 }
const ctaPrimary = {
  display: 'inline-block', backgroundColor: 'var(--accent)', color: 'var(--text-on-accent)',
  padding: '12px 26px', borderRadius: 'var(--radius-pill)', fontWeight: 700, fontSize: '0.95rem',
  textDecoration: 'none', boxShadow: 'var(--shadow-spark)',
}
