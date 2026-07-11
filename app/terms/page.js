import LegalDoc from '@/components/LegalDoc'

export const metadata = {
  title: 'Terms of Service — BrainScribe',
  description: 'The terms for using BrainScribe, the voice-first writing coach.',
}

const sections = [
  {
    id: 'agreement', label: 'Agreement', title: 'Agreement to these terms',
    body: (
      <p>These Terms of Service (&quot;Terms&quot;) are a binding agreement between you and BrainScribe (&quot;we,&quot; &quot;us,&quot; &quot;our&quot;) governing your use of the BrainScribe website and application at brainscribe.io (the &quot;Service&quot;). By creating an account or using the Service, you agree to these Terms and to our <a className="inline" href="/privacy">Privacy Policy</a>. If you do not agree, please do not use the Service.</p>
    ),
  },
  {
    id: 'what', label: 'What BrainScribe is', title: 'What BrainScribe is',
    body: (
      <p>BrainScribe is a voice-first writing coach built to help middle and high school students — especially those with ADHD — get their ideas out of their heads and onto the page. The Service asks Socratic coaching questions; the student speaks or types their answers; and those answers become the student&apos;s own writing. BrainScribe does not write essays for students and is not a substitute for a student&apos;s own work.</p>
    ),
  },
  {
    id: 'who', label: 'Who can use it', title: 'Who can use BrainScribe',
    body: (
      <>
        <p>You may use the Service only if you can form a binding contract with us and are not barred from doing so under applicable law. In addition:</p>
        <ul>
          <li><strong>Students 13 and older</strong> may create their own account.</li>
          <li><strong>Students under 13</strong> may use the Service only with verifiable parental consent, as described in our Privacy Policy. Until a parent or guardian approves the account, it remains blocked, and it is deleted automatically if consent is not given within 7 days.</li>
          <li><strong>Parents and teachers</strong> must be 13 or older to hold an account.</li>
        </ul>
        <p>You agree that the information you provide when declaring your age and setting up your account is accurate.</p>
      </>
    ),
  },
  {
    id: 'account', label: 'Your account', title: 'Your account',
    body: (
      <p>You sign in with Google, and you are responsible for the activity that happens under your account. Keep your Google credentials secure. Tell us promptly at brainscribe.io@gmail.com if you believe your account has been accessed without your permission. Accounts are for the individual who created them and may not be shared.</p>
    ),
  },
  {
    id: 'integrity', label: 'Academic integrity', title: 'Academic integrity — how to use the coach',
    body: (
      <>
        <p><strong>The work has to be yours.</strong> BrainScribe is designed never to write a student&apos;s assignment for them. By using the Service, students agree to use it as a learning aid, in line with their school&apos;s academic-integrity and AI-use policies.</p>
        <p>You agree not to attempt to misuse the coach — including trying to get it to write, complete, or substantially produce assignment content on your behalf, or to circumvent the guardrails that keep the writing in the student&apos;s own words. Schools and educators determine what is and isn&apos;t permitted for their assignments; it&apos;s your responsibility to follow those rules.</p>
      </>
    ),
  },
  {
    id: 'content', label: 'Your content', title: 'Your content',
    body: (
      <p>Students keep ownership of the writing they create with BrainScribe — their spoken words, typed answers, and the paragraphs that result are theirs. You grant us a limited license to store, process, and display that content solely to operate and provide the Service (for example, generating coaching responses, assembling paragraphs, and showing transcripts to the student and their linked parents or teachers). We do not sell your content, use it for advertising, or use it to train third-party models. See our <a className="inline" href="/privacy">Privacy Policy</a> for the details.</p>
    ),
  },
  {
    id: 'acceptable', label: 'Acceptable use', title: 'Acceptable use',
    body: (
      <>
        <p>When using BrainScribe, you agree not to:</p>
        <ul>
          <li>Use the Service for anything unlawful, harmful, harassing, or abusive.</li>
          <li>Attempt to break, overload, scrape, reverse-engineer, or gain unauthorized access to the Service or its systems.</li>
          <li>Upload content that infringes others&apos; rights or that you do not have permission to use.</li>
          <li>Impersonate another person, or misrepresent your relationship to a student (e.g. claiming to be a parent when you are not).</li>
          <li>Resell or commercially exploit the Service without our written permission.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'ai', label: 'AI-generated content', title: 'AI-generated content',
    body: (
      <p>BrainScribe uses AI (including third-party models) to generate coaching questions, voice, and feedback. AI can be wrong, incomplete, or inconsistent. BrainScribe does not guarantee any particular grade, outcome, or result, and coaching feedback is not professional, academic, or educational advice. Always review your work and use your own judgment.</p>
    ),
  },
  {
    id: 'payments', label: 'Payments', title: 'Payments',
    body: (
      <p>BrainScribe may offer paid features. If it does, the price and billing terms will be shown to you before you pay, and any payments are processed by our payment provider, Stripe — we do not store your card details. Unless stated otherwise, fees are non-refundable except where required by law.</p>
    ),
  },
  {
    id: 'termination', label: 'Termination', title: 'Termination',
    body: (
      <p>You may stop using BrainScribe and request deletion of your account at any time by emailing brainscribe.io@gmail.com. We may suspend or terminate your access if you violate these Terms, if required by law, or to protect the Service or other users. On termination, your data is handled as described in our Privacy Policy.</p>
    ),
  },
  {
    id: 'disclaimers', label: 'Disclaimers', title: 'Disclaimers',
    body: (
      <p>The Service is provided &quot;as is&quot; and &quot;as available,&quot; without warranties of any kind, whether express or implied, including any implied warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not warrant that the Service will be uninterrupted, error-free, or secure.</p>
    ),
  },
  {
    id: 'liability', label: 'Limitation of liability', title: 'Limitation of liability',
    body: (
      <p>To the fullest extent permitted by law, BrainScribe and its operators will not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of data, arising out of or related to your use of the Service. Our total liability for any claim relating to the Service will not exceed the greater of the amount you paid us in the twelve months before the claim or USD $50.</p>
    ),
  },
  {
    id: 'changes', label: 'Changes', title: 'Changes to these terms',
    body: (
      <p>We may update these Terms from time to time. If we make material changes, we will update the &quot;Last updated&quot; date above and, where appropriate, notify users by email. Continuing to use BrainScribe after changes take effect means you accept the revised Terms.</p>
    ),
  },
  {
    id: 'governing', label: 'Governing law', title: 'Governing law',
    body: (
      <p>These Terms are governed by the laws of the United States and the state in which BrainScribe operates, without regard to conflict-of-laws principles. Any disputes will be resolved in the courts located there, unless applicable law requires otherwise.</p>
    ),
  },
  {
    id: 'contact', label: 'Contact', title: 'Questions about these terms?',
    body: (
      <div className="contact-card">
        <p><strong>BrainScribe</strong></p>
        <p>Email: <a className="inline" href="mailto:brainscribe.io@gmail.com">brainscribe.io@gmail.com</a></p>
        <p>If anything here is unclear, or you want to understand how it applies to you or your student, reach out directly.</p>
      </div>
    ),
  },
]

export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms of Service"
      updated="June 2026"
      intro="These terms govern your use of BrainScribe, the voice-first writing coach. BrainScribe is a coach, not a ghostwriter — it helps students get their own ideas onto the page and never writes the work for them. By creating an account or using the Service, you agree to these terms."
      tldr="BrainScribe is a writing coach, not a ghostwriter. It asks questions and helps students get their own ideas onto the page — it never writes the work for them. The words a student speaks and writes are theirs. Use it honestly, and it's yours to use."
      sections={sections}
    />
  )
}
