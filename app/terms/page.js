import { Lora } from 'next/font/google'

const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
})

export const metadata = {
  title: 'Terms of Service — BrainScribe',
  description: 'The terms for using BrainScribe, the voice-first writing coach.',
}

const serif = lora.style.fontFamily

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 48 }}>
      <h2 style={{
        fontFamily: serif,
        fontSize: '1.2rem',
        fontWeight: 600,
        color: 'var(--brand-navy)',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: '1px solid var(--border-default)',
      }}>
        {title}
      </h2>
      <div style={{ fontSize: '0.97rem', lineHeight: 1.8, color: 'var(--text-body)' }}>
        {children}
      </div>
    </section>
  )
}

function P({ children }) {
  return <p style={{ marginBottom: 16 }}>{children}</p>
}

function Ul({ items }) {
  return (
    <ul style={{ paddingLeft: 20, marginBottom: 16 }}>
      {items.map((item, i) => (
        <li key={i} style={{ marginBottom: 8 }}>{item}</li>
      ))}
    </ul>
  )
}

function Highlight({ children }) {
  return (
    <div style={{
      backgroundColor: 'var(--status-success-bg)',
      border: '1px solid var(--status-success)',
      borderRadius: 12,
      padding: '16px 20px',
      marginBottom: 24,
      fontSize: '0.95rem',
      lineHeight: 1.7,
      color: 'var(--brand-navy)',
    }}>
      {children}
    </div>
  )
}

export default function TermsPage() {
  return (
    <div style={{ backgroundColor: 'var(--brand-cream)', minHeight: '100vh', color: 'var(--brand-navy)' }}>

      {/* Nav */}
      <nav style={{
        padding: '20px 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-default)',
        backgroundColor: 'var(--brand-cream)',
      }}>
        <a href="/">
          <img src="/brainscribe-logo.png" alt="BrainScribe" style={{ height: 28, width: 'auto' }} />
        </a>
        <a href="/login"
          style={{
            backgroundColor: 'var(--brand-orange)',
            color: '#fff',
            padding: '9px 20px',
            borderRadius: 10,
            fontSize: '0.85rem',
            fontWeight: 600,
            textDecoration: 'none',
          }}>
          Sign in
        </a>
      </nav>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px 100px' }}>

        {/* Header */}
        <div style={{ marginBottom: 56 }}>
          <p style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--brand-orange)',
            marginBottom: 16,
          }}>
            Legal
          </p>
          <h1 style={{
            fontFamily: serif,
            fontSize: 'clamp(1.8rem, 4vw, 2.4rem)',
            fontWeight: 600,
            lineHeight: 1.25,
            letterSpacing: '-0.02em',
            color: 'var(--brand-navy)',
            marginBottom: 16,
          }}>
            Terms of Service
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Last updated: June 2026 &nbsp;·&nbsp; Effective immediately
          </p>
        </div>

        {/* Plain-English banner */}
        <Highlight>
          <strong>In plain English:</strong> BrainScribe is a writing <em>coach</em>, not a ghostwriter. It asks questions and helps students get their own ideas onto the page — it never writes the work for them. The words a student speaks and writes are theirs. Use it honestly, and it's yours to use.
        </Highlight>

        <Section title="1. Agreement to these terms">
          <P>
            These Terms of Service ("Terms") are a binding agreement between you and BrainScribe ("we," "us," "our") governing your use of the BrainScribe website and application at brainscribe.io (the "Service"). By creating an account or using the Service, you agree to these Terms and to our{' '}
            <a href="/privacy" style={{ color: 'var(--brand-orange)' }}>Privacy Policy</a>. If you do not agree, please do not use the Service.
          </P>
        </Section>

        <Section title="2. What BrainScribe is">
          <P>
            BrainScribe is a voice-first writing tutor built to help middle and high school students — especially those with ADHD — get their ideas out of their heads and onto the page. The Service asks Socratic coaching questions; the student speaks or types their answers; and those answers become the student's own writing. BrainScribe does not write essays for students and is not a substitute for a student's own work.
          </P>
        </Section>

        <Section title="3. Who can use BrainScribe">
          <P>You may use the Service only if you can form a binding contract with us and are not barred from doing so under applicable law. In addition:</P>
          <Ul items={[
            <><strong>Students 13 and older</strong> may create their own account.</>,
            <><strong>Students under 13</strong> may use the Service only with verifiable parental consent, as described in our Privacy Policy. Until a parent or guardian approves the account, it remains blocked, and it is deleted automatically if consent is not given within 7 days.</>,
            <><strong>Parents and teachers</strong> must be 13 or older to hold an account.</>,
          ]} />
          <P>
            You agree that the information you provide when declaring your age and setting up your account is accurate.
          </P>
        </Section>

        <Section title="4. Your account">
          <P>
            You sign in with Google, and you are responsible for the activity that happens under your account. Keep your Google credentials secure. Tell us promptly at brainscribe.io@gmail.com if you believe your account has been accessed without your permission. Accounts are for the individual who created them and may not be shared.
          </P>
        </Section>

        <Section title="5. Academic integrity — how to use the coach">
          <Highlight>
            <strong>The work has to be yours.</strong> BrainScribe is designed never to write a student's assignment for them. By using the Service, students agree to use it as a learning aid, in line with their school's academic-integrity and AI-use policies.
          </Highlight>
          <P>You agree not to attempt to misuse the coach — including trying to get it to write, complete, or substantially produce assignment content on your behalf, or to circumvent the guardrails that keep the writing in the student's own words. Schools and educators determine what is and isn't permitted for their assignments; it's your responsibility to follow those rules.</P>
        </Section>

        <Section title="6. Your content">
          <P>
            Students keep ownership of the writing they create with BrainScribe — their spoken words, typed answers, and the paragraphs that result are theirs. You grant us a limited license to store, process, and display that content solely to operate and provide the Service (for example, generating coaching responses, assembling paragraphs, and showing transcripts to the student and their linked parents or teachers). We do not sell your content, use it for advertising, or use it to train third-party models. See our{' '}
            <a href="/privacy" style={{ color: 'var(--brand-orange)' }}>Privacy Policy</a> for the details.
          </P>
        </Section>

        <Section title="7. Acceptable use">
          <P>When using BrainScribe, you agree not to:</P>
          <Ul items={[
            'Use the Service for anything unlawful, harmful, harassing, or abusive.',
            'Attempt to break, overload, scrape, reverse-engineer, or gain unauthorized access to the Service or its systems.',
            'Upload content that infringes others\' rights or that you do not have permission to use.',
            'Impersonate another person, or misrepresent your relationship to a student (e.g. claiming to be a parent when you are not).',
            'Resell or commercially exploit the Service without our written permission.',
          ]} />
        </Section>

        <Section title="8. AI-generated content">
          <P>
            BrainScribe uses AI (including third-party models) to generate coaching questions, voice, and feedback. AI can be wrong, incomplete, or inconsistent. BrainScribe does not guarantee any particular grade, outcome, or result, and coaching feedback is not professional, academic, or educational advice. Always review your work and use your own judgment.
          </P>
        </Section>

        <Section title="9. Payments">
          <P>
            BrainScribe may offer paid features. If it does, the price and billing terms will be shown to you before you pay, and any payments are processed by our payment provider, Stripe — we do not store your card details. Unless stated otherwise, fees are non-refundable except where required by law.
          </P>
        </Section>

        <Section title="10. Termination">
          <P>
            You may stop using BrainScribe and request deletion of your account at any time by emailing brainscribe.io@gmail.com. We may suspend or terminate your access if you violate these Terms, if required by law, or to protect the Service or other users. On termination, your data is handled as described in our Privacy Policy.
          </P>
        </Section>

        <Section title="11. Disclaimers">
          <P>
            The Service is provided "as is" and "as available," without warranties of any kind, whether express or implied, including any implied warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not warrant that the Service will be uninterrupted, error-free, or secure.
          </P>
        </Section>

        <Section title="12. Limitation of liability">
          <P>
            To the fullest extent permitted by law, BrainScribe and its operators will not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of data, arising out of or related to your use of the Service. Our total liability for any claim relating to the Service will not exceed the greater of the amount you paid us in the twelve months before the claim or USD $50.
          </P>
        </Section>

        <Section title="13. Changes to these terms">
          <P>
            We may update these Terms from time to time. If we make material changes, we will update the "Last updated" date above and, where appropriate, notify users by email. Continuing to use BrainScribe after changes take effect means you accept the revised Terms.
          </P>
        </Section>

        <Section title="14. Governing law">
          <P>
            These Terms are governed by the laws of the United States and the state in which BrainScribe operates, without regard to conflict-of-laws principles. Any disputes will be resolved in the courts located there, unless applicable law requires otherwise.
          </P>
        </Section>

        {/* Contact block */}
        <div style={{
          backgroundColor: 'var(--surface-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 16,
          padding: '32px 36px',
          marginTop: 24,
          boxShadow: 'var(--shadow-sm)',
        }}>
          <h2 style={{
            fontFamily: serif,
            fontSize: '1.1rem',
            fontWeight: 600,
            color: 'var(--brand-navy)',
            marginBottom: 12,
          }}>
            Questions about these terms?
          </h2>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.7, color: 'var(--text-body)', marginBottom: 8 }}>
            If anything here is unclear, or you want to understand how it applies to you or your student, reach out directly:
          </p>
          <p style={{ fontSize: '0.95rem', color: 'var(--brand-orange)', fontWeight: 600 }}>
            brainscribe.io@gmail.com
          </p>
        </div>

      </main>
    </div>
  )
}
