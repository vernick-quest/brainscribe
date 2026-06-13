import { Lora } from 'next/font/google'

const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
})

export const metadata = {
  title: 'About — BrainScribe',
  description: 'How a late-night Chromebook moment became a voice-first writing tutor for kids with ADHD.',
}

const serif = lora.style.fontFamily

export default function AboutPage() {
  return (
    <div style={{ backgroundColor: 'var(--brand-cream)', minHeight: '100vh', color: 'var(--brand-navy)' }}>

      {/* ── Nav ── */}
      <nav style={{
        padding: '20px 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-default)',
        backgroundColor: 'var(--surface-card)',
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
            letterSpacing: '0.01em',
          }}>
          Try BrainScribe
        </a>
      </nav>

      {/* ── Main ── */}
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '80px 24px 120px' }}>

        {/* Eyebrow */}
        <p style={{
          fontFamily: 'var(--font-body, sans-serif)',
          fontSize: '0.72rem',
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--brand-orange)',
          marginBottom: 32,
        }}>
          Our Story
        </p>

        {/* Opener */}
        <h1 style={{
          fontFamily: serif,
          fontSize: 'clamp(1.6rem, 4vw, 2.1rem)',
          fontWeight: 500,
          lineHeight: 1.35,
          letterSpacing: '-0.02em',
          color: 'var(--brand-navy)',
          marginBottom: 48,
        }}>
          It started at{' '}
          <em style={{ fontStyle: 'italic', color: 'var(--brand-orange)' }}>11pm</em>,<br />
          with a Chromebook and a kid<br />
          who couldn't get unstuck.
        </h1>

        {/* Profile row */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 24,
          marginBottom: 48,
          padding: 28,
          backgroundColor: 'var(--surface-card)',
          borderRadius: 16,
          border: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <img
            src="/founder-photo.png"
            alt="Robert Vernick"
            width={68}
            height={68}
            style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
          />
          <div style={{ paddingTop: 4 }}>
            <p style={{
              fontFamily: serif,
              fontSize: '1.05rem',
              fontWeight: 600,
              color: 'var(--brand-navy)',
              marginBottom: 4,
            }}>
              Robert Vernick
            </p>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Father of two kids with ADHD. Product builder. The person who stayed up too late and accidentally started a company.
            </p>
          </div>
        </div>

        {/* Prose */}
        <div style={{ fontSize: '1rem', lineHeight: 1.8, color: 'var(--brand-navy)' }}>

          <p style={{ marginBottom: 28 }}>
            I have two kids with ADHD. Keeping track of their open-ended writing assignments and research projects became something close to a part-time job. Executive function doesn't come easily to them — and for a lot of kids like mine, the hardest part of writing isn't the writing. It's getting started. It's staying started.
          </p>

          {/* Pull quote */}
          <div style={{
            margin: '48px -32px',
            padding: '36px 40px',
            borderLeft: '4px solid var(--brand-orange)',
            backgroundColor: 'var(--surface-card)',
            borderRadius: '0 14px 14px 0',
          }}>
            <p style={{
              fontFamily: serif,
              fontStyle: 'italic',
              fontSize: 'clamp(1.15rem, 3vw, 1.4rem)',
              fontWeight: 400,
              lineHeight: 1.5,
              color: 'var(--brand-navy)',
              letterSpacing: '-0.01em',
              margin: 0,
            }}>
              "He would write a sentence and delete a sentence for what seemed like hours."
            </p>
          </div>

          <p style={{ marginBottom: 28 }}>
            One night, my son was down to the last evening of a one-week extension on a five-paragraph story. His humanities teacher and learning specialist both knew writing was hard for him — but at 11pm, there's no scaffolding available. Just a kid, a Chromebook, and a cursor blinking at the end of an unfinished sentence.
          </p>

          <p style={{ marginBottom: 28 }}>
            He had three solid paragraphs already written. They weren't bad. But he was completely paralyzed on the last two. He didn't want my help — which I respected — and the assignment had a note in it, in all caps, that AI was not allowed.
          </p>
        </div>

        {/* Scene block */}
        <div style={{
          backgroundColor: 'var(--brand-navy)',
          color: 'var(--brand-cream)',
          padding: '36px',
          borderRadius: 16,
          margin: '48px 0',
        }}>
          <p style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--brand-orange)',
            marginBottom: 16,
          }}>
            The moment
          </p>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.8, color: 'rgba(245,240,232,0.88)', marginBottom: 16 }}>
            I couldn't watch him struggle any longer. So I opened an AI app on my phone, copy-pasted his three paragraphs and the assignment instructions, and typed something like:
          </p>
          <p style={{
            fontStyle: 'italic',
            fontSize: '0.92rem',
            lineHeight: 1.8,
            color: 'var(--brand-orange)',
            marginBottom: 16,
          }}>
            "My son is stuck. Please interview him. Do NOT write anything he doesn't say — just ask him prompts about what happens next. He needs to talk it out, not analyze sentences."
          </p>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.8, color: 'rgba(245,240,232,0.88)', margin: 0 }}>
            I sat next to him, holding my phone, so I could make sure nothing was added that he didn't say. Twenty-five minutes later, the essay was done. He was proud of it. So was I.
          </p>
        </div>

        {/* Prose continued */}
        <div style={{ fontSize: '1rem', lineHeight: 1.8, color: 'var(--brand-navy)' }}>
          <p style={{ marginBottom: 28 }}>
            The AI did something simple but exactly right. It kept asking: <em>is this what you said? Anything you want to change?</em> He made changes. He caught things he wanted to say differently. The words were his — all of them.
          </p>
          <p style={{ marginBottom: 28 }}>
            The next day I emailed his teacher and learning specialist and told them exactly what I'd done. I offered the full transcript if they wanted to verify. They weren't upset. They were just glad he found a way through that worked for him.
          </p>
        </div>

        {/* Divider */}
        <hr style={{ border: 'none', borderTop: '1px solid var(--border-default)', margin: '56px 0' }} />

        {/* Prose continued */}
        <div style={{ fontSize: '1rem', lineHeight: 1.8, color: 'var(--brand-navy)' }}>
          <p style={{ marginBottom: 28 }}>
            That was the lightbulb moment. What my son needed wasn't an AI that would write for him — he needed one that would ask him the right questions until he figured out what he already knew. A Socratic tutor that holds the door open instead of walking through it for you.
          </p>
          <p style={{ marginBottom: 28 }}>
            That's what BrainScribe is. A voice-first writing coach that asks questions, listens to your answers, and turns what you say into clean paragraphs — in your words, with your ideas. It doesn't write your essay. It helps you write it.
          </p>
          <p style={{ marginBottom: 28 }}>
            What started as a late-night experiment became something I couldn't stop thinking about. I started building it — for my son, and for every other kid sitting in front of a blinking cursor at 11pm with three good paragraphs and no idea how to finish.
          </p>
        </div>

        {/* Outcome grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 16,
          margin: '40px 0',
        }}>
          {[
            { num: '25 min', label: 'From completely stuck to two finished paragraphs he was proud of' },
            { num: '100%',   label: 'His words, his ideas — the AI only asked questions' },
            { num: '1 email', label: 'To his teacher — full transparency, transcript offered, no pushback' },
            { num: '2 kids', label: 'With ADHD, who taught me that the right question beats the right answer' },
          ].map(({ num, label }) => (
            <div key={num} style={{
              backgroundColor: 'var(--surface-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 14,
              padding: 24,
              boxShadow: 'var(--shadow-xs)',
            }}>
              <p style={{
                fontFamily: serif,
                fontSize: '2rem',
                fontWeight: 600,
                color: 'var(--brand-orange)',
                lineHeight: 1,
                marginBottom: 8,
              }}>
                {num}
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {label}
              </p>
            </div>
          ))}
        </div>

        {/* Final prose */}
        <p style={{ fontSize: '1rem', lineHeight: 1.8, color: 'var(--brand-navy)', marginBottom: 0 }}>
          BrainScribe is built for students who know what they want to say but can't get it out. For parents who've sat next to a kid at 11pm, willing to try anything. And for teachers and counselors who want to see their students do the work — and believe them when they say they did.
        </p>

        {/* CTA block */}
        <div style={{
          backgroundColor: 'var(--brand-orange)',
          color: '#fff',
          padding: '48px 40px',
          borderRadius: 20,
          marginTop: 72,
          textAlign: 'center',
        }}>
          <h2 style={{
            fontFamily: serif,
            fontSize: 'clamp(1.3rem, 3vw, 1.7rem)',
            fontWeight: 500,
            lineHeight: 1.35,
            marginBottom: 16,
            letterSpacing: '-0.01em',
          }}>
            Your kid has more to say than they think.
          </h2>
          <p style={{
            fontSize: '0.95rem',
            opacity: 0.9,
            marginBottom: 32,
            maxWidth: 420,
            marginLeft: 'auto',
            marginRight: 'auto',
            lineHeight: 1.7,
          }}>
            BrainScribe asks the questions. They find the words. The essay is theirs.
          </p>
          <a href="/login"
            style={{
              display: 'inline-block',
              backgroundColor: '#fff',
              color: 'var(--brand-orange)',
              padding: '14px 32px',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: '0.95rem',
              textDecoration: 'none',
              letterSpacing: '0.01em',
            }}>
            Try BrainScribe free
          </a>
        </div>

      </main>

    </div>
  )
}
