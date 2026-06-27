'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { PersonaAvatar, getPersona } from '@/lib/personas'
import { useCoachVoice } from '@/lib/useCoachVoice'
import Icon from '@/components/Icon'

const OWEN = getPersona('owen')

// The whole FTUE is 3 steps: 1 welcome · 2 pick a prompt · 3 write your opening
// line (in the coach). Steps 1-2 live here; 3 is the practice banner; the reveal
// at /onboarding/complete is the unnumbered payoff. There is deliberately no
// orientation tour — the coach explains everything by using it (see the spec's
// "no feature tour" principle), which keeps the warm-up to about a minute.
const FTUE_TOTAL_STEPS = 3
const FTUE_STEP_KEY = 'bs_ftue_step'

export default function OnboardingFlow({ studentName = 'there', prompts = [], role = 'student' }) {
  const router = useRouter()
  const { speak, stop } = useCoachVoice('owen')

  // Parents/teachers are mainly here to watch — they see the explanation, then can
  // opt out of the practice paragraph. Students are driven through it.
  const isWatcher = role === 'parent' || role === 'teacher'
  const home = role === 'parent' ? '/parent' : role === 'teacher' ? '/teacher' : '/dashboard'

  const [stage, setStage]       = useState('intro')   // 'intro' | 'prompts'
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)
  const [error, setError]       = useState('')
  const restored = useRef(false)

  // Restore progress once on mount, so leaving mid-flow resumes where you
  // were rather than from the very first screen.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FTUE_STEP_KEY) || 'null')
      // Only restore a stage this version still renders — a stale value from the
      // old orientation-tour flow (e.g. 'orient') would leave a blank screen.
      if (saved?.stage === 'intro' || saved?.stage === 'prompts') setStage(saved.stage)
    } catch {}
  }, [])

  // Persist progress on each step — but skip the initial mount run so we don't
  // clobber the value the restore effect is about to apply.
  useEffect(() => {
    if (!restored.current) { restored.current = true; return }
    try { localStorage.setItem(FTUE_STEP_KEY, JSON.stringify({ stage })) } catch {}
  }, [stage])

  const introLine = isWatcher
    ? `Welcome to BrainScribe — I'm Owen, one of the writing coaches. You're set up as a ${role}, so mostly you'll be following along — but it helps to see how this works. Want to try writing one opening line yourself? Takes about a minute — or head straight to your dashboard.`
    : `Hey ${studentName} — welcome to BrainScribe. I'm Owen, your writing coach. Here's how this works: we build your writing one piece at a time, and you'll watch it come together in your Draft. I never write it for you — the words are all yours. Let's warm up with the very first piece: your opening line. Takes about a minute. Ready?`
  const promptsLine = isWatcher
    ? "Pick a prompt and we'll write one opening line together — or head straight to your dashboard."
    : "Let's find your opening line — the sentence that makes someone want to keep reading. Pick whatever sounds interesting; there's no wrong answer here."

  // Speak the line for whatever screen is currently showing.
  const currentLine =
    stage === 'intro'   ? introLine :
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
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor: 'var(--bg-page-alt)' }}>
      {/* Just the subtle skip link up here — the step indicator now lives inside the
          card, tucked under the primary button. */}
      <div className="flex justify-end items-center px-5 py-4">
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
              {/* Teach the shape of a paragraph and where it shows up, so the warm-up
                  has context: today is just the first piece, the rest come on real work. */}
              {!isWatcher && <ParagraphAnatomy />}
              <PrimaryButton onClick={() => { stop(); setStage('prompts') }}>
                Let's go →
              </PrimaryButton>
              {/* Parents/teachers can bail before the warm-up entirely. */}
              {isWatcher && (
                <button onClick={handleSkip}
                  className="w-full rounded-full py-3 text-sm font-semibold transition"
                  style={{ border: '1px solid var(--border-strong)', color: 'var(--text-muted)', backgroundColor: 'var(--surface-card)' }}>
                  Skip — go to my dashboard →
                </button>
              )}
              {!isWatcher && <StepIndicator n={1} total={FTUE_TOTAL_STEPS} />}
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
                      aria-pressed={isSel}
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
                  {creating ? 'Setting up your warm-up…' : 'Start with this one →'}
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
              {!isWatcher && <StepIndicator n={2} total={FTUE_TOTAL_STEPS} />}
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
    <div className="space-y-5"
      style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-md)', borderRadius: 'var(--radius-xl)', padding: 'clamp(28px, 5vw, 40px) clamp(24px, 4vw, 36px)' }}>
      {children}
    </div>
  )
}

function SpeechText({ children }) {
  return (
    <p style={{ font: 'var(--type-lead)', color: 'var(--text-strong)' }}>
      {children}
    </p>
  )
}

function StepIndicator({ n, total }) {
  return (
    <p className="text-center" style={{ font: 'var(--type-meta)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-subtle)' }}>
      Step {n} of {total}
    </p>
  )
}

// The four pieces of a paragraph, with the hook marked as today's warm-up. Mirrors
// the "what comes next" list on the completion reveal so the student sees the same
// shape on both ends, and learns the pieces show up in the Draft.
const PARAGRAPH_PARTS = [
  { label: 'Hook', note: "today's warm-up", active: true },
  { label: 'Context', active: false },
  { label: 'Body', active: false },
  { label: 'Closing', active: false },
]

function ParagraphAnatomy() {
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-page)', border: '1px solid var(--border-default)' }}>
      <p className="text-[11px] font-bold uppercase tracking-widest mb-2.5" style={{ color: 'var(--text-subtle)' }}>
        A paragraph, one piece at a time
      </p>
      <div className="space-y-1.5">
        {PARAGRAPH_PARTS.map(part => (
          <div key={part.label} className="flex items-center gap-2.5">
            <span className="rounded-full shrink-0" style={{ width: 8, height: 8, backgroundColor: part.active ? 'var(--accent)' : 'var(--border-strong)' }} />
            <span className="text-sm" style={{ color: part.active ? 'var(--text-strong)' : 'var(--text-muted)', fontWeight: part.active ? 'var(--fw-semibold)' : 'normal' }}>
              {part.label}
            </span>
            {part.note && <span className="text-[11px]" style={{ color: 'var(--accent-text)' }}>{part.note}</span>}
          </div>
        ))}
      </div>
      <p className="text-xs mt-3 leading-snug" style={{ color: 'var(--text-subtle)' }}>
        Each piece shows up in your Draft as you go. Today we&rsquo;ll just nail the opening line.
      </p>
    </div>
  )
}

function PrimaryButton({ onClick, children }) {
  return (
    <button onClick={onClick}
      className="w-full transition"
      style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--text-on-accent)', backgroundColor: 'var(--accent)', borderRadius: 'var(--radius-pill)', padding: '12px 0' }}>
      {children}
    </button>
  )
}

