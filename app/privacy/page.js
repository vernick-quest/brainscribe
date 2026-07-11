import LegalDoc from '@/components/LegalDoc'

export const metadata = {
  title: 'Privacy Policy — BrainScribe',
  description: "BrainScribe's commitment to protecting student and family data.",
}

const sections = [
  {
    id: 'who-we-are', label: 'Who we are', title: 'Who we are',
    body: (
      <>
        <p>BrainScribe is a voice-first writing coach built to help middle and high school students — especially those with ADHD — get their ideas out of their heads and onto the page. We operate at brainscribe.io and are based in the United States.</p>
        <p>Questions about this policy? Email us at <strong>brainscribe.io@gmail.com</strong>. We respond to all privacy inquiries within 5 business days.</p>
      </>
    ),
  },
  {
    id: 'collect', label: 'What we collect', title: 'What we collect — and why',
    body: (
      <>
        <p>We collect only what we need to provide the service:</p>
        <ul>
          <li><strong>Account information</strong> — name and email address, provided when you sign in with Google. This information is used solely to identify your account and send service-related messages. It is not used for advertising, sold to third parties, or combined with data from other services.</li>
          <li><strong>Assignment content</strong> — the text of writing assignments students enter. Used to generate the coaching session and outline.</li>
          <li><strong>Voice and spoken text</strong> — when a student speaks, their audio is transcribed. We store the transcription, not the audio. Audio is processed in real time and not retained.</li>
          <li><strong>Session transcripts</strong> — the full dialogue between the student and the AI coach. Stored so students, parents, and teachers can review the session. We also run automated AI reviews of transcripts for internal quality and safety monitoring.</li>
          <li><strong>Written paragraphs</strong> — the scribed essay sections that result from each coaching session.</li>
          <li><strong>Relationship data</strong> — which parents are linked to which students, and which teachers are connected to which assignments. Used only to provide dashboard access.</li>
        </ul>
        <p>We do <strong>not</strong> collect Social Security numbers, payment card numbers (payments are handled by Stripe), school records beyond what you provide, or any biometric data.</p>
      </>
    ),
  },
  {
    id: 'children', label: "Children's privacy", title: "Children's privacy (COPPA)",
    body: (
      <>
        <p><strong>If a user is under 13:</strong> BrainScribe requires verifiable parental consent before a student under 13 can access the service. We do not knowingly permit children under 13 to use BrainScribe without a parent or guardian's approval.</p>
        <p><strong>How the age gate works:</strong> When a new user signs up, we ask them to self-declare whether they are 13 or older or under 13. If a student indicates they are under 13, their account is immediately blocked. They are asked to provide a parent or guardian's email address. We then send the parent a consent email containing a secure approval link.</p>
        <p>The parent must sign in with their own Google account and check two consent boxes confirming their relationship to the student and agreeing to this Privacy Policy. Only after that approval is the student's account activated.</p>
        <p><strong>7-day deletion window:</strong> If parental consent is not completed within 7 days of the student signing up, the student's account and all associated data are automatically deleted. The student can sign up again at any time and restart the process.</p>
        <p><strong>Note on Google sign-in:</strong> When a user signs in with Google, their name and email address are received from Google before the age declaration step. If an under-13 student does not receive parental consent within 7 days, this data is permanently deleted.</p>
        <p>BrainScribe is designed for middle and high school students, which means many of our users may be between 13 and 17. We treat all student accounts with the same protections regardless of age:</p>
        <ul>
          <li>Student data is never used for advertising or marketing.</li>
          <li>Student data is never sold to third parties.</li>
          <li>Session transcripts and essays are private to the student, their linked parents, and their linked teachers.</li>
          <li>Parents can request a full export or deletion of their child&apos;s data at any time by emailing brainscribe.io@gmail.com.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'ferpa', label: 'Education records', title: 'Student education records (FERPA)',
    body: (
      <>
        <p>BrainScribe acts as a <strong>school official</strong> or <strong>service provider</strong> when used in an educational setting, consistent with FERPA. Student education records are:</p>
        <ul>
          <li>Used only to provide and improve the coaching service.</li>
          <li>Not disclosed to third parties without consent, except as permitted by FERPA.</li>
          <li>Not used for behavioral advertising.</li>
          <li>Accessible to the student and their connected parents and teachers within the platform.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'sharing', label: 'How we share', title: 'How we share data',
    body: (
      <>
        <p>We share data in the following limited circumstances only:</p>
        <ul>
          <li><strong>Anthropic (Claude AI)</strong> — Assignment text and session history are sent to Anthropic&apos;s API to generate coaching responses. Anthropic does not train on API inputs by default. See <a className="inline" href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer">Anthropic&apos;s privacy policy</a>.</li>
          <li><strong>ElevenLabs</strong> — Coach response text is sent to ElevenLabs to generate voice audio. See <a className="inline" href="https://elevenlabs.io/privacy" target="_blank" rel="noopener noreferrer">ElevenLabs&apos; privacy policy</a>.</li>
          <li><strong>Supabase</strong> — Our database and authentication provider. Data is stored in Supabase&apos;s infrastructure. See <a className="inline" href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">Supabase&apos;s privacy policy</a>.</li>
          <li><strong>Resend</strong> — Used to send notification emails to teachers and parents. No student content is included in these emails.</li>
          <li><strong>Legal requirements</strong> — We may disclose information if required by law, court order, or to protect the rights and safety of our users.</li>
        </ul>
        <p><strong>We do not sell your data. We do not share your data for advertising. We do not use student data to build profiles for any purpose outside of BrainScribe.</strong></p>
      </>
    ),
  },
  {
    id: 'google', label: 'Google API disclosure', title: 'Google API Services — Limited Use disclosure',
    body: (
      <>
        <p>BrainScribe&apos;s use of information received from Google APIs adheres to the <a className="inline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
        <p>Specifically, information received from Google Sign-In (your name and email address) is used only to:</p>
        <ul>
          <li>Create and authenticate your BrainScribe account.</li>
          <li>Identify you within the app and associate your sessions, essays, and settings with your account.</li>
          <li>Send you service-related emails (e.g. teacher invite confirmations, parental consent requests).</li>
        </ul>
        <p>We do not use Google user data to serve advertising, do not transfer it to third parties except as necessary to operate BrainScribe (as described in How we share data), do not allow humans to read it unless you have given us explicit permission or it is required for security or legal compliance, and do not use it for any purpose that is not disclosed in this privacy policy.</p>
      </>
    ),
  },
  {
    id: 'retention', label: 'Retention & deletion', title: 'Data retention and deletion',
    body: (
      <>
        <ul>
          <li>Active accounts: data is retained as long as the account is active.</li>
          <li>Deleted accounts: all personal data is permanently deleted within 30 days of account deletion.</li>
          <li><strong>Under-13 accounts pending parental consent:</strong> if consent is not given within 7 days of sign-up, the account and all associated data are permanently deleted automatically.</li>
          <li>Session transcripts: retained unless the student or parent requests deletion.</li>
          <li>Voice transcriptions: stored as text. Audio is not retained.</li>
        </ul>
        <p>To request deletion of your data or your child&apos;s data, email <strong>brainscribe.io@gmail.com</strong> with the subject line &quot;Data deletion request.&quot; We will confirm and complete the deletion within 10 business days.</p>
      </>
    ),
  },
  {
    id: 'security', label: 'Security', title: 'Security',
    body: (
      <>
        <p>We use industry-standard security practices: all data is encrypted in transit (TLS) and at rest. Authentication is handled through Google OAuth. Database access is protected by row-level security policies — meaning each user can only access their own data.</p>
        <p>No system is perfectly secure. If you believe your account has been compromised, contact us immediately at brainscribe.io@gmail.com.</p>
      </>
    ),
  },
  {
    id: 'rights', label: 'Your rights', title: 'Your rights',
    body: (
      <>
        <p>Depending on where you live, you may have the right to:</p>
        <ul>
          <li>Access a copy of the personal data we hold about you.</li>
          <li>Correct inaccurate data.</li>
          <li>Delete your data (right to be forgotten).</li>
          <li>Export your data in a portable format.</li>
          <li>Opt out of any non-essential data processing.</li>
        </ul>
        <p>To exercise any of these rights, email us at <strong>brainscribe.io@gmail.com</strong>. Parents may exercise these rights on behalf of their children.</p>
      </>
    ),
  },
  {
    id: 'cookies', label: 'Cookies', title: 'Cookies',
    body: (
      <p>We use a single authentication session cookie to keep you logged in. We do not use advertising cookies, tracking pixels, or third-party analytics that identify individual users. We do not use cookies to track students across other websites.</p>
    ),
  },
  {
    id: 'changes', label: 'Changes', title: 'Changes to this policy',
    body: (
      <p>If we make material changes to this policy, we will notify users by email and update the &quot;Last updated&quot; date at the top. Continued use of BrainScribe after changes take effect constitutes acceptance of the revised policy.</p>
    ),
  },
  {
    id: 'contact', label: 'Contact', title: 'Contact us',
    body: (
      <div className="contact-card">
        <p><strong>BrainScribe Privacy Team</strong></p>
        <p>Email: <a className="inline" href="mailto:brainscribe.io@gmail.com">brainscribe.io@gmail.com</a></p>
        <p>We take privacy seriously — especially when it comes to kids. We respond to all privacy inquiries within 5 business days.</p>
      </div>
    ),
  },
]

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Privacy Policy"
      updated="June 2026"
      intro="BrainScribe is a voice-first writing coach used by students — often minors — at school and at home. This policy explains what we collect, why, and the choices you and your family have. We collect the minimum we need to run the coaching experience, and we never sell personal information."
      tldr="BrainScribe does not sell student data. We do not advertise to students. We do not share children's personal information with third parties except where strictly required to operate the service. The words students speak and write belong to them."
      sections={sections}
    />
  )
}
