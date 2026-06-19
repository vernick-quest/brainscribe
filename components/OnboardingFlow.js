'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { PERSONAS, PersonaAvatar, getPersona } from '@/lib/personas'
import { useCoachVoice } from '@/lib/useCoachVoice'
import Icon from '@/components/Icon'

const OWEN = getPersona('owen')

// The whole FTUE is 7 steps: 1 intro · 2-4 orientation · 5 pick a prompt ·
// 6 write your paragraph (in the coach) · 7 see it + reflect (transcript).
// Steps 1-5 live here; 6 is the practice banner; 7 is the transcript finale.
const FTUE_TOTAL_STEPS = 7
const FTUE_STEP_KEY = 'bs_ftue_step'

// The three orientation moments. Each is one short spoken line + a simple visual.
const MOMENTS = [
  {
    key: 'coach',
    line: "I'm your coach for today. BrainScribe has six coaches with different styles — after this you can pick whoever feels right. For now, you've got me.",
    cta: 'Got it →',
  },
  {
    key: 'how',
    line: "Here's how it works: I ask questions, you talk or type your answers, and your words become your writing. I never write it for you — everything on the page comes from you.",
    cta: 'Got it →',
  },
  {
    key: 'draft',
    line: "Over here is where your writing builds up as we go — you'll watch it come together piece by piece. Ready to try it?",
    cta: "I'm ready →",
  },
]

export default function OnboardingFlow({ studentName = 'there', prompts = [], role = 'student' }) {
  const router = useRouter()
  const { speak, stop } = useCoachVoice('owen')

  // Parents/teachers are mainly here to watch — they see the explanation, then can
  // opt out of the practice paragraph. Students are driven through it.
  const isWatcher = role === 'parent' || role === 'teacher'
  const home = role === 'parent' ? '/parent' : role === 'teacher' ? '/teacher' : '/dashboard'

  const [stage, setStage]       = useState('intro')   // 'intro' | 'orient' | 'prompts'
  const [moment, setMoment]     = useState(0)
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)
  const [error, setError]       = useState('')
  const restored = useRef(false)

  // Step number for the "Step X of 7" badge (students only).
  const stepNumber = stage === 'intro' ? 1 : stage === 'orient' ? 2 + moment : stage === 'prompts' ? 5 : 1

  // Restore tour progress once on mount, so leaving mid-tour resumes where you
  // were rather than from the very first screen.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FTUE_STEP_KEY) || 'null')
      if (saved?.stage) { setStage(saved.stage); if (typeof saved.moment === 'number') setMoment(saved.moment) }
    } catch {}
  }, [])

  // Persist tour progress on each step — but skip the initial mount run so we
  // don't clobber the value the restore effect is about to apply.
  useEffect(() => {
    if (!restored.current) { restored.current = true; return }
    try { localStorage.setItem(FTUE_STEP_KEY, JSON.stringify({ stage, moment })) } catch {}
  }, [stage, moment])

  const introLine = isWatcher
    ? `Welcome to BrainScribe — I'm Owen, one of the writing coaches. You're set up as a ${role}, so mostly you'll be following along. But you can write with a coach yourself too, and either way it helps to see how this works. Let me give you the quick tour.`
    : `Hey ${studentName} — welcome to BrainScribe. I'm Owen, and I'm going to be your writing coach. Before we get to your real assignments, let's try this together. It won't take long, and you'll end up with something you actually wrote. Sound good?`
  const promptsLine = isWatcher
    ? "That's the tour. If you'd like, you can try writing one short paragraph yourself to feel how it works — or head straight to your dashboard."
    : "We're going to write one short paragraph together — just to get the feel of it. Pick whatever sounds interesting. There's no wrong answer here."

  // Speak the line for whatever screen is currently showing.
  const currentLine =
    stage === 'intro'   ? introLine :
    stage === 'orient'  ? MOMENTS[moment].line :
    stage === 'prompts' ? promptsLine : ''

  useEffect(() => { speak(currentLine) }, [currentLine, speak])

  async function handleSkip() {
    stop()
    try { localStorage.removeItem(FTUE_STEP_KEY) } catch {}
    try { await fetch('/api/onboarding/complete', { method: 'POST' }) } catch {}
    router.push(home)
  }

  async function startPractice() {
    if (!selected) return
    setCreating(true)
    setError('')
    stop()
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentText: selected.text,
          persona: 'owen',
          isOnboarding: true,
          onboardingPromptKey: selected.key,
        }),
      })
      const session = await res.json()
      if (!res.ok || !session.id) {
        setError(session.error ?? 'Something went wrong. Please try again.')
        setCreating(false)
        return
      }
      // Past the tour now — the practice session itself is the resume point.
      try { localStorage.removeItem(FTUE_STEP_KEY) } catch {}
      router.push(`/assignment/${session.id}`)
    } catch {
      setError('Network error — please check your connection and try again.')
      setCreating(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor: 'var(--bg-page)' }}>
      {/* Step badge (students only — watchers can opt out, so a 7-step counter
          they won't finish would mislead) + subtle skip link */}
      <div className="flex justify-between items-center px-5 py-4">
        {!isWatcher ? (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
            Step {stepNumber} of {FTUE_TOTAL_STEPS}
          </span>
        ) : <span />}
        <button onClick={handleSkip}
          className="text-xs font-medium transition hover:underline"
          style={{ color: 'var(--text-subtle)' }}>
          Skip onboarding
        </button>
      </div>

      <div className="flex-1 flex items-start sm:items-center justify-center px-5 pb-16">
        <div className="w-full max-w-xl">

          {/* Coach header — Owen is always present */}
          <div className="flex items-center gap-3 mb-6">
            <PersonaAvatar personaId="owen" size={44} />
            <div>
              <p className="font-bold leading-tight" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}>
                {OWEN.name}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Your writing coach</p>
            </div>
          </div>

          {/* ── Stage: intro ── */}
          {stage === 'intro' && (
            <Card>
              <SpeechText>{introLine}</SpeechText>
              <PrimaryButton onClick={() => { stop(); setStage('orient'); setMoment(0) }}>
                Let's go →
              </PrimaryButton>
            </Card>
          )}

          {/* ── Stage: orientation moments ── */}
          {stage === 'orient' && (
            <Card>
              <MomentVisual which={MOMENTS[moment].key} />
              <SpeechText>{MOMENTS[moment].line}</SpeechText>
              <PrimaryButton onClick={() => {
                stop()
                if (moment < MOMENTS.length - 1) setMoment(m => m + 1)
                else setStage('prompts')
              }}>
                {MOMENTS[moment].cta}
              </PrimaryButton>
              <Dots count={MOMENTS.length} active={moment} />
            </Card>
          )}

          {/* ── Stage: practice prompt selection ── */}
          {stage === 'prompts' && (
            <Card>
              <SpeechText>{promptsLine}</SpeechText>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                {prompts.map(p => {
                  const isSel = selected?.key === p.key
                  return (
                    <button key={p.key} type="button"
                      onClick={() => setSelected(p)}
                      className="text-left rounded-2xl p-4 transition"
                      style={{
                        border: `2px solid ${isSel ? 'var(--accent)' : 'var(--border-default)'}`,
                        backgroundColor: isSel ? 'var(--surface-spark)' : 'var(--surface-card)',
                        boxShadow: isSel ? '0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent)' : 'none',
                      }}
                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.borderColor = 'var(--border-strong)' }}
                      onMouseLeave={e => { if (!isSel) e.currentTarget.style.borderColor = 'var(--border-default)' }}>
                      <Icon name={p.icon} size={24} className="mb-2" style={{ color: 'var(--accent)' }} />
                      <p className="text-sm leading-snug" style={{ color: 'var(--text-body)' }}>{p.text}</p>
                    </button>
                  )
                })}
              </div>

              {error && <p className="text-sm text-center mt-4" style={{ color: 'var(--status-error)' }}>{error}</p>}

              {selected && (
                <button onClick={startPractice} disabled={creating}
                  className="w-full text-white font-bold rounded-full py-3 mt-5 transition disabled:opacity-60"
                  style={{ backgroundColor: 'var(--accent)' }}>
                  {creating ? 'Setting up your practice…' : 'Start with this one →'}
                </button>
              )}

              {/* Parents/teachers get an explicit opt-out of the practice. */}
              {isWatcher && (
                <button onClick={handleSkip} disabled={creating}
                  className="w-full rounded-full py-3 mt-3 text-sm font-semibold transition disabled:opacity-60"
                  style={{ border: '1px solid var(--border-strong)', color: 'var(--text-muted)', backgroundColor: 'var(--surface-card)' }}>
                  Skip the practice — go to my dashboard →
                </button>
              )}
            </Card>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Small presentational helpers ──────────────────────────────────────────────

function Card({ children }) {
  return (
    <div className="rounded-3xl p-6 sm:p-8 space-y-5"
      style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
      {children}
    </div>
  )
}

function SpeechText({ children }) {
  return (
    <p className="leading-relaxed" style={{ color: 'var(--text-strong)', fontSize: 'var(--text-lg)' }}>
      {children}
    </p>
  )
}

function PrimaryButton({ onClick, children }) {
  return (
    <button onClick={onClick}
      className="w-full text-white font-bold rounded-full py-3 transition"
      style={{ backgroundColor: 'var(--accent)' }}>
      {children}
    </button>
  )
}

function Dots({ count, active }) {
  return (
    <div className="flex items-center justify-center gap-1.5 pt-1">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="rounded-full transition-all"
          style={{
            width: i === active ? 18 : 6, height: 6,
            backgroundColor: i === active ? 'var(--accent)' : 'var(--border-strong)',
          }} />
      ))}
    </div>
  )
}

// Lightweight visuals for the three orientation moments (no heavy animation —
// that's a later polish pass).
function MomentVisual({ which }) {
  if (which === 'coach') {
    return (
      <div className="flex items-center justify-center gap-2 py-2">
        {Object.keys(PERSONAS).map(id => <PersonaAvatar key={id} personaId={id} size={36} />)}
      </div>
    )
  }
  if (which === 'how') {
    return (
      <div className="flex items-center justify-center gap-2 py-2">
        <Pill label="You talk" icon="mic" />
        <Arrow />
        <Pill label="It's written" icon="text" />
        <Arrow />
        <Pill label="Your paragraph" icon="doc" />
      </div>
    )
  }
  // draft panel sketch
  return (
    <div className="rounded-2xl p-4 mx-auto max-w-xs" style={{ backgroundColor: 'var(--bg-page)', border: '1px solid var(--border-default)' }}>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-subtle)' }}>Your Draft</p>
      <div className="space-y-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-3 rounded-full" style={{ backgroundColor: 'var(--surface-muted)', width: `${[90, 75, 60][i]}%` }} />
        ))}
      </div>
    </div>
  )
}

function Pill({ label, icon }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="w-10 h-10 rounded-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}>
        {icon === 'mic' && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
          </svg>
        )}
        {icon === 'text' && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h10" />
          </svg>
        )}
        {icon === 'doc' && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" />
          </svg>
        )}
      </div>
      <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
    </div>
  )
}

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-subtle)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mb-5">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}
