import { Lora } from 'next/font/google'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AttributionCapture from '@/components/AttributionCapture'
import SiteHeader from '@/components/SiteHeader'

const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
})
const serif = lora.style.fontFamily

export const metadata = {
  title: 'BrainScribe — Your kid knows what they want to say',
  description:
    'A voice-first writing coach for students with ADHD. It asks the questions, they find the words, and the essay is always theirs. Free to try.',
}

// The marketing landing page. `/` is public (see lib/supabase/middleware.js) so
// cold campaign traffic lands on the pitch, not a Google sign-in wall. Logged-in
// users are sent straight to their home — mirroring the redirect in
// app/(auth)/login/layout.js so a teacher/parent/admin isn't dumped on /dashboard.
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
      : '/dashboard'

    redirect(dest)
  }

  return <Landing />
}

function Landing() {
  return (
    <div style={{ backgroundColor: 'var(--brand-cream)', color: 'var(--brand-navy)' }}>
      <AttributionCapture />

      <SiteHeader />

      {/* ── Hero ── */}
      <header style={{
        maxWidth: 1080,
        margin: '0 auto',
        padding: '72px 24px 64px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 56,
      }}>
        {/* Left: message */}
        <div style={{ flex: '1 1 380px' }}>
          <p style={eyebrow}>Voice-first writing coach</p>
          <h1 style={{
            fontFamily: serif,
            fontSize: 'clamp(2rem, 5vw, 3rem)',
            fontWeight: 600,
            lineHeight: 1.18,
            letterSpacing: '-0.02em',
            color: 'var(--brand-navy)',
            margin: '0 0 20px',
          }}>
            Your kid knows what they want to say.{' '}
            <span style={{ color: 'var(--accent-text)' }}>They just can&rsquo;t get it out.</span>
          </h1>
          <p style={{
            fontSize: '1.15rem',
            lineHeight: 1.6,
            color: 'var(--text-muted)',
            margin: '0 0 32px',
            maxWidth: 460,
          }}>
            BrainScribe asks the questions. They find the words. The essay is always theirs.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <a href="/login" style={ctaPrimary}>Try it free</a>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-subtle)' }}>
              Free to start &middot; just sign in with Google
            </span>
          </div>
        </div>

        {/* Right: session preview mock */}
        <div style={{ flex: '1 1 360px', minWidth: 0 }}>
          <SessionPreview />
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
              tag: 'What it does',
              tagColor: 'var(--accent-text)',
              title: 'Asks, never answers.',
              body: 'Your student talks through their ideas out loud. BrainScribe reflects them back and tidies what they said into clean paragraphs they approve.',
            },
            {
              tag: "What it doesn't",
              tagColor: 'var(--status-success)',
              title: 'Write a single word.',
              body: 'Nothing is generated for them. Every sentence traces back to something they actually said — you can read the whole transcript.',
            },
            {
              tag: "Who it's for",
              tagColor: 'var(--navy-700)',
              title: 'Kids who freeze.',
              body: 'Students who know what they mean but stall at the blank page — especially kids with ADHD. Parents and teachers can follow along.',
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
            Twenty-five minutes later the essay was done, and he was proud of it. The next day I
            told his teacher exactly what we&rsquo;d done and offered the transcript. She was just glad
            he&rsquo;d found a way through. That was the lightbulb &mdash; and BrainScribe is what it became.
          </p>
          <a href="/about" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-text)', textDecoration: 'none' }}>
            Read the full story &rarr;
          </a>
        </div>
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
          <p style={{ ...eyebrow, color: 'var(--accent)' }}>Isn&rsquo;t this just AI doing the homework?</p>
          <h2 style={{
            fontFamily: serif,
            fontSize: 'clamp(1.5rem, 4vw, 2rem)',
            fontWeight: 500,
            lineHeight: 1.35,
            letterSpacing: '-0.01em',
            margin: '0 auto 20px',
            maxWidth: 560,
          }}>
            No. The writing is always theirs.
          </h2>
          <p style={{
            fontSize: '1.02rem',
            lineHeight: 1.75,
            color: 'rgba(245,240,232,0.9)',
            margin: '0 auto',
            maxWidth: 560,
          }}>
            BrainScribe never writes a word for the student. It asks questions, they answer, and
            their words become the paragraph &mdash; on a transcript parents and teachers can read. We
            tested this with teachers. They weren&rsquo;t just okay with it &mdash; they were relieved.
          </p>
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

// A static, on-brand mock of a coaching session — coach question, student answer,
// and a paragraph building in the document panel. Communicates the product at a
// glance (the marketing plan: "just the conversation and the paragraph building").
function SessionPreview() {
  return (
    <div style={{
      backgroundColor: 'var(--surface-card)',
      border: '1px solid var(--border-default)',
      borderRadius: 20,
      boxShadow: 'var(--shadow-md)',
      padding: 22,
      maxWidth: 440,
      marginInline: 'auto',
    }}>
      {/* Coach header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <span style={{
          width: 30, height: 30, borderRadius: '50%',
          backgroundColor: 'var(--surface-spark)', color: 'var(--accent-text)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: '0.8rem',
        }}>O</span>
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-strong)' }}>
          Owen <span style={{ color: 'var(--text-subtle)', fontWeight: 400 }}>&middot; your coach</span>
        </span>
      </div>

      {/* Coach bubble */}
      <div style={{
        backgroundColor: 'var(--brand-cream)',
        border: '1px solid var(--border-default)',
        borderRadius: '14px 14px 14px 4px',
        padding: '12px 15px',
        fontSize: '0.92rem',
        lineHeight: 1.55,
        color: 'var(--brand-navy)',
        marginBottom: 12,
      }}>
        Nice start. What&rsquo;s one moment your character starts to see things differently?
      </div>

      {/* Student bubble */}
      <div style={{
        backgroundColor: 'var(--brand-navy)',
        color: 'var(--brand-cream)',
        borderRadius: '14px 14px 4px 14px',
        padding: '12px 15px',
        fontSize: '0.92rem',
        lineHeight: 1.55,
        marginLeft: 'auto',
        marginBottom: 18,
        maxWidth: '85%',
      }}>
        When his friend moves away and he&rsquo;s alone at lunch.
      </div>

      {/* Building paragraph */}
      <div style={{
        backgroundColor: 'var(--surface-spark)',
        border: '1px solid var(--border-accent)',
        borderRadius: 14,
        padding: '14px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent-text)' }}>
            Your paragraph
          </span>
          <span style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--status-success)' }}>
            In your words
          </span>
        </div>
        <p style={{ fontSize: '0.9rem', lineHeight: 1.65, color: 'var(--brand-navy)', margin: 0 }}>
          Everything changed the day his friend moved away. Sitting alone at lunch, he started
          to notice things he&rsquo;d never paid attention to before&hellip;
        </p>
      </div>
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
