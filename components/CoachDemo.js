'use client'

import { useState, useEffect, useRef } from 'react'
import { Lora } from 'next/font/google'

// Animated "watch the coach work" demo for the landing hero. The coach draws the
// student out over a few turns; the student answers out loud in messy, natural
// speech; then the filler is stripped and their OWN words are tidied into a
// paragraph — nothing generated. This is the marketing centerpiece, so the
// "after" text must stay visibly the kid's own words (see the honest-cleanup
// note); never let it read like the AI composed it.
//
// Progressive enhancement: initial state is the FULL, revealed demo (so SSR and
// no-JS show everything, and prefers-reduced-motion stays there). On mount, if
// motion is allowed, it resets to step 0 and autoplays; manual controls pause it.

const lora = Lora({ subsets: ['latin'], weight: ['500', '600'], style: ['normal'], display: 'swap' })
const serif = lora.style.fontFamily

// Student speech as segments so filler words can be struck through on cleanup.
const STUDENT_1 = [
  { t: 'Umm,', f: true }, { t: ' ' }, { t: 'like', f: true },
  { t: '… when his friend moves away? And he’s ' },
  { t: 'uh,', f: true }, { t: ' ' }, { t: 'just', f: true },
  { t: ' sitting alone at lunch, and he ' }, { t: 'kinda', f: true },
  { t: ' starts noticing ' }, { t: 'stuff', f: true }, { t: ' he never ' },
  { t: 'really', f: true }, { t: ' noticed before.' },
]
const STUDENT_2 = [
  { t: 'Uh,', f: true }, { t: ' the empty seat, ' }, { t: 'I guess?', f: true },
  { t: ' And ' }, { t: 'how…', f: true }, { t: ' how loud everyone else is now.' },
]

// Conversation turns (indices 0..3). Step 4 = the tidied paragraph.
const TURNS = [
  { role: 'coach', text: 'Nice start. What’s one moment your character starts to see things differently?' },
  { role: 'student', segs: STUDENT_1 },
  { role: 'coach', text: 'Say more about that — what’s the first thing he notices?' },
  { role: 'student', segs: STUDENT_2 },
]
const LAST = TURNS.length // 4 — the tidy step

const MicIcon = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
    <path d="M19 10a7 7 0 0 1-14 0" />
  </svg>
)

export default function CoachDemo() {
  const [step, setStep] = useState(LAST) // SSR / no-JS / reduced-motion = fully revealed
  const [animate, setAnimate] = useState(false)
  const [paused, setPaused] = useState(false)
  const timer = useRef(null)

  // On mount: enable animation unless the user prefers reduced motion.
  useEffect(() => {
    const m = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)')
    if (m && m.matches) return
    setAnimate(true)
    setStep(0)
  }, [])

  // Autoplay loop: advance one step, pause at the end, then restart.
  useEffect(() => {
    if (!animate || paused) return
    const atEnd = step >= LAST
    timer.current = setTimeout(() => {
      setStep((s) => (s >= LAST ? 0 : s + 1))
    }, atEnd ? 2600 : 1700)
    return () => clearTimeout(timer.current)
  }, [animate, paused, step])

  const tidied = step >= LAST
  const jump = (n) => { setPaused(true); setStep(Math.max(0, Math.min(LAST, n))) }
  const replay = () => { setPaused(false); setStep(0) }

  return (
    <div
      role="group"
      aria-label="An animated example of a coaching session: the coach asks and follows up, the student answers out loud in natural speech, and their own words are tidied into a paragraph — nothing added."
      style={{
        backgroundColor: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 20,
        boxShadow: 'var(--shadow-md)',
        padding: '18px 18px 16px',
        maxWidth: 452,
        marginInline: 'auto',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{
            width: 28, height: 28, borderRadius: '50%', backgroundColor: 'var(--surface-spark)',
            color: 'var(--accent-text)', display: 'inline-flex', alignItems: 'center',
            justifyContent: 'center', fontWeight: 700, fontSize: '0.76rem',
          }}>O</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand-navy)' }}>
            Owen <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>&middot; your coach</span>
          </span>
        </div>
        <span style={{
          fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
          color: 'var(--accent-text)', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: 'var(--accent)' }} />
          Watch a session
        </span>
      </div>

      {/* Thread — all turns present for stable height; opacity reveals them */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, minHeight: 150 }}>
        {TURNS.map((turn, i) => {
          const on = step >= i
          const common = {
            transition: 'opacity .5s ease, transform .5s ease',
            opacity: on ? 1 : 0,
            transform: on ? 'none' : 'translateY(6px)',
          }
          if (turn.role === 'coach') {
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'flex-start', ...common }}>
                <div style={{
                  backgroundColor: 'var(--brand-cream)', border: '1px solid var(--border-default)',
                  color: 'var(--brand-navy)', borderRadius: '13px 13px 13px 4px', padding: '9px 13px',
                  fontSize: '0.88rem', lineHeight: 1.5, maxWidth: '82%',
                }}>{turn.text}</div>
              </div>
            )
          }
          return (
            <div key={i} style={{ display: 'flex', justifyContent: 'flex-end', ...common }}>
              <div style={{
                backgroundColor: 'var(--brand-navy)', color: 'var(--brand-cream)',
                borderRadius: '13px 13px 4px 13px', padding: '9px 13px', fontSize: '0.88rem',
                lineHeight: 1.5, maxWidth: '84%',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.58rem', fontWeight: 700,
                  letterSpacing: '0.06em', textTransform: 'uppercase', color: '#F6C48B', marginBottom: 5,
                }}>
                  <MicIcon />Said aloud
                </div>
                {turn.segs.map((seg, j) => seg.f ? (
                  <span key={j} style={{
                    color: tidied ? 'rgba(245,240,232,0.4)' : 'rgba(245,240,232,0.6)',
                    textDecoration: tidied ? 'line-through' : 'none',
                    transition: 'color .5s ease',
                  }}>{seg.t}</span>
                ) : (
                  <span key={j}>{seg.t}</span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Tidied paragraph */}
      <div style={{
        marginTop: 14, borderTop: '1px dashed var(--border-default)', paddingTop: 14,
        transition: 'opacity .5s ease', opacity: tidied ? 1 : 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Their paragraph
          </span>
          <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--status-success)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
            In their words
          </span>
        </div>
        <div style={{ backgroundColor: 'var(--surface-spark)', border: '1px solid var(--border-accent)', borderRadius: 12, padding: '11px 13px' }}>
          <p style={{ fontFamily: serif, fontSize: '0.92rem', lineHeight: 1.56, color: 'var(--brand-navy)', margin: 0 }}>
            When his friend moves away, he sits alone at lunch and starts noticing things he never noticed
            before &mdash; the empty seat, and how loud everyone else is now.
          </p>
        </div>
        <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '8px 2px 0' }}>
          Filler and false starts removed. Punctuation fixed. Every idea is theirs.
        </p>
      </div>

      {/* Controls — only when animating (hidden for reduced-motion / no-JS static view) */}
      {animate && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <button
            type="button"
            onClick={replay}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-text)', fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px' }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
            Replay
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            {Array.from({ length: LAST + 1 }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Step ${i + 1} of ${LAST + 1}`}
                aria-current={step === i}
                onClick={() => jump(i)}
                style={{ width: 8, height: 8, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer', backgroundColor: step === i ? 'var(--accent)' : 'var(--border-accent)' }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button type="button" aria-label="Previous step" onClick={() => jump(step - 1)} style={ctrlBtn}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button type="button" aria-label="Next step" onClick={() => jump(step + 1)} style={ctrlBtn}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const ctrlBtn = {
  background: 'none', border: '1px solid var(--border-default)', borderRadius: 8, cursor: 'pointer',
  color: 'var(--brand-navy)', width: 28, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}
