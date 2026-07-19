import { Lora } from 'next/font/google'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AttributionCapture from '@/components/AttributionCapture'
import SiteHeader from '@/components/SiteHeader'
import CoachDemo from '@/components/CoachDemo'
import NewsletterSignup from '@/components/NewsletterSignup'

const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
})
const serif = lora.style.fontFamily

export const metadata = {
  title: 'BrainScribe — voice-first writing coach for kids with ADHD',
  description:
    'Your kid talks; their own words become the writing — tidied up, never made up, on a transcript you can read. A voice-first writing coach for students with ADHD, grades 6–12 (ages 11–17). Free to try.',
}

// The marketing landing page. `/` is public (see lib/supabase/middleware.js) so
// cold campaign traffic lands on the pitch, not a Google sign-in wall. Logged-in
// users are sent straight to their home — mirroring the redirect in
// app/(auth)/login/layout.js so a teacher/parent/admin isn't dumped on /folder.
export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const dest = profile?.role === 'admin' ? '/admin'
      : profile?.role === 'teacher' ? '/teacher'
      : profile?.role === 'parent' ? '/parent'
      : '/folder'

    redirect(dest)
  }

  return <Landing />
}

// Color language (consistent across the page):
//   --accent / --accent-text (orange) = voice & action ONLY (mic, "say it", CTAs)
//   --status-success (green)           = "it's theirs" / proven / approved
//   navy                               = everything else
function Landing() {
  return (
    <div style={{ backgroundColor: 'var(--brand-cream)', color: 'var(--brand-navy)' }}>
      <AttributionCapture />

      <SiteHeader />

      {/* ── Hero ── */}
      <header style={{
        maxWidth: 1080,
        margin: '0 auto',
        padding: '72px 24px 60px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 56,
      }}>
        {/* Left: message */}
        <div style={{ flex: '1 1 380px' }}>
          <p style={eyebrow}>Voice-first writing coach · built for ADHD</p>
          <h1 style={{
            fontFamily: serif,
            fontSize: 'clamp(2rem, 5vw, 3rem)',
            fontWeight: 600,
            lineHeight: 1.16,
            letterSpacing: '-0.02em',
            color: 'var(--brand-navy)',
            margin: '0 0 20px',
          }}>
            Your kid knows what they want to say. Getting it out is the hard part.
          </h1>
          <p style={{
            fontSize: '1.15rem',
            lineHeight: 1.6,
            color: 'var(--text-muted)',
            margin: '0 0 32px',
            maxWidth: 460,
          }}>
            So let them <span style={{ color: 'var(--accent-text)', fontWeight: 700 }}>say it</span>. BrainScribe
            helps them get their own words onto the page &mdash; tidied up, never made up &mdash; on a transcript
            you can read start to finish.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <a href="/login" style={ctaPrimary}>Try it free</a>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-subtle)' }}>
              Free to start &middot; just sign in with Google
            </span>
          </div>
        </div>

        {/* Right: animated coach demo */}
        <div style={{ flex: '1 1 360px', minWidth: 0 }}>
          <CoachDemo serif={serif} />
        </div>
      </header>

      {/* ── What it does / doesn't / who ── */}
      <section style={sectionWrap}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
        }}>
          {[
            {
              tag: 'The unlock · voice',
              tagColor: 'var(--accent-text)',
              title: 'No typing. No blank page.',
              body: 'Your student talks their ideas out loud. For a kid who freezes at the keyboard, that’s the whole way in. The coach asks a question, they answer, and their words become clean paragraphs they approve.',
            },
            {
              tag: 'The proof · it’s theirs',
              tagColor: 'var(--status-success)',
              title: 'Every word traces back.',
              body: 'BrainScribe never writes the paragraph for them — it works only from what your student actually says, and the full transcript shows how each line came together. You see the work, not just the result.',
            },
            {
              tag: 'Who it’s for',
              tagColor: 'var(--navy-700)',
              title: 'Built for the freeze.',
              body: 'Made for kids who know what they mean but stall at the blank page — grades 6–12 (ages 11–17), especially ADHD. Parents and teachers can follow along.',
            },
          ].map(({ tag, tagColor, title, body }) => (
            <div key={tag} style={featureCard}>
              <p style={{ ...cardTag, color: tagColor }}>{tag}</p>
              <p style={{ fontFamily: serif, fontSize: '1.2rem', fontWeight: 600, color: 'var(--brand-navy)', margin: '0 0 10px', lineHeight: 1.3 }}>
                {title}
              </p>
              <p style={{ fontSize: '0.92rem', lineHeight: 1.65, color: 'var(--text-muted)', margin: 0 }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pull quote: the real problem (ADHD identity) ── */}
      <section style={{ ...sectionWrap, maxWidth: 780, textAlign: 'center', padding: '40px 24px 32px' }}>
        <p style={{
          fontFamily: serif,
          fontSize: 'clamp(1.35rem, 3.4vw, 1.95rem)',
          fontWeight: 500,
          lineHeight: 1.35,
          letterSpacing: '-0.01em',
          color: 'var(--brand-navy)',
          margin: 0,
          textWrap: 'balance',
        }}>
          Your kid isn&rsquo;t a bad writer. They&rsquo;re a great talker with a broken pipeline to the page.
        </p>
      </section>

      {/* ── The writing is always theirs (anti-cheating) ── */}
      <section style={sectionWrap}>
        <div style={{
          backgroundColor: 'var(--brand-navy)',
          color: 'var(--brand-cream)',
          borderRadius: 24,
          padding: 'clamp(36px, 6vw, 56px)',
          textAlign: 'center',
        }}>
          <p style={{ ...eyebrow, color: 'rgba(245,240,232,0.72)' }}>Isn&rsquo;t this just AI doing the homework?</p>
          <h2 style={{
            fontFamily: serif,
            fontSize: 'clamp(1.5rem, 4vw, 2rem)',
            fontWeight: 500,
            lineHeight: 1.35,
            letterSpacing: '-0.01em',
            margin: '0 auto 20px',
            maxWidth: 600,
          }}>
            No &mdash; and you can prove it.
          </h2>
          <p style={{
            fontSize: '1.02rem',
            lineHeight: 1.75,
            color: 'rgba(245,240,232,0.9)',
            margin: '0 auto',
            maxWidth: 600,
          }}>
            Other AI tutors ask you to <strong style={{ color: 'var(--brand-cream)' }}>trust</strong> a promise
            not to write for your kid. BrainScribe <strong style={{ color: 'var(--brand-cream)' }}>shows its
            work</strong>: it draws the writing out of your student&rsquo;s own spoken words, and every session is
            a transcript you and their teacher can read line by line. You don&rsquo;t have to trust it &mdash; you
            can check it.
          </p>
        </div>
      </section>

      {/* ── Value anchor: vs a human coach (price intentionally omitted until pricing ships) ── */}
      <section style={{ ...sectionWrap, maxWidth: 720, textAlign: 'center' }}>
        <p style={eyebrow}>What a writing coach costs</p>
        <h2 style={{
          fontFamily: serif,
          fontSize: 'clamp(1.4rem, 3.4vw, 1.9rem)',
          fontWeight: 600,
          lineHeight: 1.28,
          letterSpacing: '-0.015em',
          color: 'var(--brand-navy)',
          margin: '0 0 14px',
        }}>
          A private writing coach can cost $500+ a month.
        </h2>
        <p style={{ fontSize: '1.02rem', lineHeight: 1.7, color: 'var(--text-muted)', margin: '0 auto', maxWidth: 520 }}>
          A one-on-one executive-function or writing coach often runs well over $100 a session. BrainScribe gives
          your kid an ADHD-aware coach on demand &mdash; for a fraction of that. Free to start.
        </p>
      </section>

      {/* ── Origin story (condensed) ── */}
      <section style={{ ...sectionWrap, maxWidth: 720 }}>
        <div style={{
          backgroundColor: 'var(--surface-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 20,
          padding: 'clamp(28px, 5vw, 44px)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <p style={eyebrow}>Why it exists</p>
          <p style={{
            fontFamily: serif,
            fontSize: 'clamp(1.2rem, 3vw, 1.45rem)',
            fontWeight: 500,
            lineHeight: 1.5,
            letterSpacing: '-0.01em',
            color: 'var(--brand-navy)',
            margin: '0 0 20px',
          }}>
            It started at 11pm, with a Chromebook and a kid who couldn&rsquo;t get unstuck.
          </p>
          <p style={{ fontSize: '1rem', lineHeight: 1.8, color: 'var(--brand-navy)', margin: '0 0 18px' }}>
            My son had three good paragraphs and was completely paralyzed on the last two. AI
            was banned on the assignment. So I opened an AI app on my phone and told it: don&rsquo;t
            write anything he doesn&rsquo;t say &mdash; just interview him about what happens next. I sat
            next to him, holding the phone, making sure every word stayed his.
          </p>
          <p style={{ fontSize: '1rem', lineHeight: 1.8, color: 'var(--brand-navy)', margin: '0 0 24px' }}>
            Twenty-five minutes later the writing was done, and he was proud of it. The next day I
            told his teacher exactly what we&rsquo;d done and offered the transcript. She was just glad
            he&rsquo;d found a way through. That was the lightbulb &mdash; and BrainScribe is what it became.
          </p>
          <a href="/about" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-text)', textDecoration: 'none' }}>
            Read the full story &rarr;
          </a>
        </div>
      </section>

      {/* ── Newsletter ── */}
      <section style={{ ...sectionWrap, paddingTop: 8, paddingBottom: 8 }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <NewsletterSignup
            source="waitlist"
            title="Get early access"
            subtitle="BrainScribe is invite-only while we're in early access. Join the list and we'll send you an invite as we open up more spots."
            cta="Request an invite"
            successTitle="You're on the list!"
            successBody="We'll email you an invite as we open up more spots — keep an eye on your inbox."
          />
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section style={{ ...sectionWrap, paddingBottom: 96 }}>
        <div style={{
          backgroundColor: 'var(--accent)',
          color: 'var(--text-on-accent)',
          padding: 'clamp(40px, 6vw, 56px) 40px',
          borderRadius: 24,
          textAlign: 'center',
        }}>
          <h2 style={{
            fontFamily: serif,
            fontSize: 'clamp(1.4rem, 3.5vw, 1.9rem)',
            fontWeight: 500,
            lineHeight: 1.3,
            letterSpacing: '-0.01em',
            margin: '0 0 14px',
          }}>
            Your kid has more to say than they think.
          </h2>
          <p style={{ fontSize: '1rem', opacity: 0.92, lineHeight: 1.65, margin: '0 auto 32px', maxWidth: 420 }}>
            Try a session before the next assignment lands &mdash; so when it does, they already
            know how it works.
          </p>
          <a href="/login" style={{
            display: 'inline-block',
            backgroundColor: 'var(--surface-card)',
            color: 'var(--accent-text)',
            padding: '15px 34px',
            borderRadius: 'var(--radius-pill)',
            fontWeight: 700,
            fontSize: '1rem',
            textDecoration: 'none',
          }}>
            Try BrainScribe free
          </a>
        </div>
      </section>
    </div>
  )
}

// ── Shared inline style objects ──
const ctaPrimary = {
  display: 'inline-block',
  backgroundColor: 'var(--accent)',
  color: 'var(--text-on-accent)',
  padding: '15px 32px',
  borderRadius: 'var(--radius-pill)',
  fontWeight: 700,
  fontSize: '1rem',
  textDecoration: 'none',
  boxShadow: 'var(--shadow-spark)',
}

const eyebrow = {
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--accent-text)',
  margin: '0 0 16px',
}

const sectionWrap = {
  maxWidth: 1080,
  margin: '0 auto',
  padding: '24px 24px',
}

const featureCard = {
  backgroundColor: 'var(--surface-card)',
  border: '1px solid var(--border-default)',
  borderRadius: 16,
  padding: 24,
  boxShadow: 'var(--shadow-xs)',
}

const cardTag = {
  fontSize: '0.68rem',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  margin: '0 0 12px',
}
