import { Lora } from 'next/font/google'

const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
})

export const metadata = {
  title: 'Privacy Policy — BrainScribe',
  description: "BrainScribe's commitment to protecting student and family data.",
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

export default function PrivacyPage() {
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
            Privacy Policy
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Last updated: June 2026 &nbsp;·&nbsp; Effective immediately
          </p>
        </div>

        {/* Commitment banner */}
        <Highlight>
          <strong>Our commitment in plain English:</strong> BrainScribe does not sell student data. We do not advertise to students. We do not share children's personal information with third parties except where strictly required to operate the service. The words students speak and write belong to them.
        </Highlight>

        <Section title="1. Who we are">
          <P>
            BrainScribe is a voice-first writing tutor built to help middle and high school students — especially those with ADHD — get their ideas out of their heads and onto the page. We operate at brainscribe.io and are based in the United States.
          </P>
          <P>
            Questions about this policy? Email us at <strong>brainscribe.io@gmail.com</strong>. We respond to all privacy inquiries within 5 business days.
          </P>
        </Section>

        <Section title="2. What we collect — and why">
          <P>We collect only what we need to provide the service:</P>
          <Ul items={[
            <><strong>Account information</strong> — name and email address, provided when you sign in with Google. This information is used solely to identify your account and send service-related messages. It is not used for advertising, sold to third parties, or combined with data from other services.</>,
            <><strong>Assignment content</strong> — the text of writing assignments students enter. Used to generate the tutoring session and outline.</>,
            <><strong>Voice and spoken text</strong> — when a student speaks, their audio is transcribed. We store the transcription, not the audio. Audio is processed in real time and not retained.</>,
            <><strong>Session transcripts</strong> — the full dialogue between the student and the AI tutor. Stored so students, parents, and teachers can review the session.</>,
            <><strong>Written paragraphs</strong> — the scribed essay sections that result from each tutoring session.</>,
            <><strong>Relationship data</strong> — which parents are linked to which students, and which teachers are connected to which assignments. Used only to provide dashboard access.</>,
          ]} />
          <P>
            We do <strong>not</strong> collect Social Security numbers, payment card numbers (payments are handled by Stripe), school records beyond what you provide, or any biometric data.
          </P>
        </Section>

        <Section title="3. Children's privacy (COPPA)">
          <Highlight>
            <strong>If a user is under 13:</strong> BrainScribe requires verifiable parental consent before a student under 13 can access the service. We do not knowingly permit children under 13 to use BrainScribe without a parent or guardian's approval.
          </Highlight>
          <P>
            <strong>How the age gate works:</strong> When a new user signs up, we ask them to self-declare whether they are 13 or older or under 13. If a student indicates they are under 13, their account is immediately blocked. They are asked to provide a parent or guardian's email address. We then send the parent a consent email containing a secure approval link.
          </P>
          <P>
            The parent must sign in with their own Google account and check two consent boxes confirming their relationship to the student and agreeing to this Privacy Policy. Only after that approval is the student's account activated.
          </P>
          <P>
            <strong>7-day deletion window:</strong> If parental consent is not completed within 7 days of the student signing up, the student's account and all associated data are automatically deleted. The student can sign up again at any time and restart the process.
          </P>
          <P>
            <strong>Note on Google sign-in:</strong> When a user signs in with Google, their name and email address are received from Google before the age declaration step. If an under-13 student does not receive parental consent within 7 days, this data is permanently deleted.
          </P>
          <P>
            BrainScribe is designed for middle and high school students, which means many of our users may be between 13 and 17. We treat all student accounts with the same protections regardless of age:
          </P>
          <Ul items={[
            'Student data is never used for advertising or marketing.',
            'Student data is never sold to third parties.',
            'Session transcripts and essays are private to the student, their linked parents, and their linked teachers.',
            'Parents can request a full export or deletion of their child\'s data at any time by emailing brainscribe.io@gmail.com.',
          ]} />
        </Section>

        <Section title="4. Student education records (FERPA)">
          <P>
            BrainScribe acts as a <strong>school official</strong> or <strong>service provider</strong> when used in an educational setting, consistent with FERPA. Student education records are:
          </P>
          <Ul items={[
            'Used only to provide and improve the tutoring service.',
            'Not disclosed to third parties without consent, except as permitted by FERPA.',
            'Not used for behavioral advertising.',
            'Accessible to the student and their connected parents and teachers within the platform.',
          ]} />
        </Section>

        <Section title="5. How we share data">
          <P>We share data in the following limited circumstances only:</P>
          <Ul items={[
            <><strong>Anthropic (Claude AI)</strong> — Assignment text and session history are sent to Anthropic's API to generate tutoring responses. Anthropic does not train on API inputs by default. See <a href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-orange)' }}>Anthropic's privacy policy</a>.</>,
            <><strong>ElevenLabs</strong> — Tutor response text is sent to ElevenLabs to generate voice audio. See <a href="https://elevenlabs.io/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-orange)' }}>ElevenLabs' privacy policy</a>.</>,
            <><strong>Supabase</strong> — Our database and authentication provider. Data is stored in Supabase's infrastructure. See <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-orange)' }}>Supabase's privacy policy</a>.</>,
            <><strong>Resend</strong> — Used to send notification emails to teachers and parents. No student content is included in these emails.</>,
            <><strong>Legal requirements</strong> — We may disclose information if required by law, court order, or to protect the rights and safety of our users.</>,
          ]} />
          <P>
            <strong>We do not sell your data. We do not share your data for advertising. We do not use student data to build profiles for any purpose outside of BrainScribe.</strong>
          </P>
        </Section>

        <Section title="6. Google API Services — Limited Use disclosure">
          <P>
            BrainScribe's use of information received from Google APIs adheres to the{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-orange)' }}>
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </P>
          <P>Specifically, information received from Google Sign-In (your name and email address) is used only to:</P>
          <Ul items={[
            'Create and authenticate your BrainScribe account.',
            'Identify you within the app and associate your sessions, essays, and settings with your account.',
            'Send you service-related emails (e.g. teacher invite confirmations, parental consent requests).',
          ]} />
          <P>
            We do not use Google user data to serve advertising, do not transfer it to third parties except as necessary to operate BrainScribe (as described in Section 5), do not allow humans to read it unless you have given us explicit permission or it is required for security or legal compliance, and do not use it for any purpose that is not disclosed in this privacy policy.
          </P>
        </Section>

        <Section title="7. Data retention and deletion">
          <Ul items={[
            'Active accounts: data is retained as long as the account is active.',
            'Deleted accounts: all personal data is permanently deleted within 30 days of account deletion.',
            <>
              <strong>Under-13 accounts pending parental consent:</strong> if consent is not given within 7 days of sign-up,
              the account and all associated data are permanently deleted automatically.
            </>,
            'Session transcripts: retained unless the student or parent requests deletion.',
            'Voice transcriptions: stored as text. Audio is not retained.',
          ]} />
          <P>
            To request deletion of your data or your child's data, email <strong>brainscribe.io@gmail.com</strong> with the subject line "Data deletion request." We will confirm and complete the deletion within 10 business days.
          </P>
        </Section>

        <Section title="8. Security">
          <P>
            We use industry-standard security practices: all data is encrypted in transit (TLS) and at rest. Authentication is handled through Google OAuth. Database access is protected by row-level security policies — meaning each user can only access their own data.
          </P>
          <P>
            No system is perfectly secure. If you believe your account has been compromised, contact us immediately at brainscribe.io@gmail.com.
          </P>
        </Section>

        <Section title="9. Your rights">
          <P>Depending on where you live, you may have the right to:</P>
          <Ul items={[
            'Access a copy of the personal data we hold about you.',
            'Correct inaccurate data.',
            'Delete your data (right to be forgotten).',
            'Export your data in a portable format.',
            'Opt out of any non-essential data processing.',
          ]} />
          <P>
            To exercise any of these rights, email us at <strong>brainscribe.io@gmail.com</strong>. Parents may exercise these rights on behalf of their children.
          </P>
        </Section>

        <Section title="10. Cookies">
          <P>
            We use a single authentication session cookie to keep you logged in. We do not use advertising cookies, tracking pixels, or third-party analytics that identify individual users. We do not use cookies to track students across other websites.
          </P>
        </Section>

        <Section title="11. Changes to this policy">
          <P>
            If we make material changes to this policy, we will notify users by email and update the "Last updated" date at the top. Continued use of BrainScribe after changes take effect constitutes acceptance of the revised policy.
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
            Questions or concerns?
          </h2>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.7, color: 'var(--text-body)', marginBottom: 8 }}>
            We take privacy seriously — especially when it comes to kids. If you have any questions, want to request your data, or just want to understand something better, reach out directly:
          </p>
          <p style={{ fontSize: '0.95rem', color: 'var(--brand-orange)', fontWeight: 600 }}>
            brainscribe.io@gmail.com
          </p>
        </div>

      </main>
    </div>
  )
}
