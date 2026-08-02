'use client'

import { useState, useEffect } from 'react'
import { PersonaAvatar, getPersona } from '@/lib/personas'
import { useCoachVoice } from '@/lib/useCoachVoice'
import CoachDemo from '@/components/CoachDemo'
import { Card, Narration, PrimaryButton, StepIndicator } from '@/components/onboardingUI'

const OWEN = getPersona('owen')

// Parent / teacher onboarding.
//
// ── Why this is not the student flow ──────────────────────────────────────────────────
// The old watcher path asked a parent "want to try writing one opening line yourself?" A
// parent doesn't want writing homework. They are deciding three things, and writing a hook
// answers none of them directly:
//
//   1. What will my kid actually do here?
//   2. Does it just write it for them?      <- the real objection, and the core claim
//   3. What will I be able to see?
//
// Screens 1 and 2 answer all three by SHOWING the product rather than describing it, using
// CoachDemo (already on the landing page) and a transcript preview. Screen 3 asks for the
// one thing that makes their dashboard worth returning to.
//
// ── What the data said (2026-08-01) ───────────────────────────────────────────────────
// Four of five real parents had NO child linked. They took the skip link ~2 minutes after
// signing up and landed on an empty dashboard — no child, no sessions, nothing to come
// back for. A practice paragraph does not change that; an invite step does.
//
// ── Robert's constraint, which shapes the whole order ─────────────────────────────────
// "The worst case is they understand how it works, less important than they do it."
// So: comprehension first and free, the single action last and skippable. Nothing blocks.

// The paragraph CoachDemo builds, shown back as a finished transcript. Rendered STATICALLY
// from this script rather than read from a seeded session: no dependency on seed-demo
// having been run, and — because this repo is public — no real student writing in a
// preview page, fixtures included.
const DEMO_EXCHANGE = [
  { role: 'coach',   text: 'Nice start. What’s one moment your character starts to see things differently?' },
  { role: 'student', text: 'When his friend moves away? And he’s sitting alone at lunch, and he starts noticing stuff he never noticed before.' },
  { role: 'coach',   text: 'Say more about that — what’s the first thing he notices?' },
  { role: 'student', text: 'The empty seat. And how loud everyone else is now.' },
]
const DEMO_PARAGRAPH =
  'When his friend moves away, he sits alone at lunch and starts noticing things he never ' +
  'noticed before — the empty seat, and how loud everyone else is now.'

export default function WatcherOnboarding({ role = 'parent', onSkip, onTryPractice }) {
  const { speak, stop } = useCoachVoice('owen')
  const [stage, setStage] = useState('intro')   // intro | demo | seeing | invite

  const isParent = role === 'parent'
  const childWord = isParent ? 'your child' : 'your students'

  const lines = {
    intro: `Welcome to BrainScribe — I'm Owen, one of the writing coaches. You're set up as a ${role}, so ${childWord} will be the one writing. Let me show you what that actually looks like — it takes about a minute, and you don't have to write anything yourself.`,
    demo: `Here's a real coaching exchange. Watch what happens at the end: the filler comes out, and what's left is still entirely the student's own words. I never write the sentence for them — that's the whole point.`,
    seeing: `And here's what you'll see afterwards. Every session leaves a transcript: the finished paragraph, and the whole conversation that produced it. Nothing is hidden from you.`,
    invite: isParent
      ? `That's it. The last thing is getting your child set up — pop in their email and they'll get a link. You can always do this later from your dashboard.`
      : `That's it. The last thing is inviting your students — pop in an email and they'll get a link. You can always do this later from your dashboard.`,
  }
  const line = lines[stage] ?? ''
  useEffect(() => { speak(line) }, [line, speak])

  const go = (next) => { stop(); setStage(next) }

  const STEPS = ['intro', 'demo', 'seeing', 'invite']
  const stepNumber = STEPS.indexOf(stage) + 1

  return (
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor: 'var(--bg-page-alt)' }}>
      <div className="flex justify-end items-center px-5 py-4">
        <button onClick={() => { stop(); onSkip() }}
          className="text-xs font-medium transition hover:underline"
          style={{ color: 'var(--text-subtle)' }}>
          Skip onboarding
        </button>
      </div>

      <div className="flex-1 flex items-start sm:items-center justify-center px-5 pb-16">
        <div className="w-full max-w-2xl">

          <div className="flex items-center gap-3 mb-6">
            <PersonaAvatar personaId="owen" size={44} />
            <div>
              <p className="font-bold leading-tight" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}>
                {OWEN.name}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Your writing coach</p>
            </div>
          </div>

          {stage === 'intro' && (
            <Card>
              <Narration onReplay={() => speak(lines.intro)}>{lines.intro}</Narration>
              <PrimaryButton onClick={() => go('demo')}>Show me →</PrimaryButton>
              <StepIndicator n={stepNumber} total={STEPS.length} />
            </Card>
          )}

          {/* ── 1. What your child actually does ── */}
          {stage === 'demo' && (
            <Card>
              <Narration onReplay={() => speak(lines.demo)} replayLabel="Replay Owen">{lines.demo}</Narration>
              {/* Reused verbatim from the landing page. Its own header states the
                  invariant this screen exists to prove: never let it read like the AI
                  composed it. Handles prefers-reduced-motion itself. */}
              <div className="my-4">
                <CoachDemo />
              </div>
              <PrimaryButton onClick={() => go('seeing')}>Then what do I see? →</PrimaryButton>
              <StepIndicator n={stepNumber} total={STEPS.length} />
            </Card>
          )}

          {/* ── 2. What YOU see — the transparency that a chatbot can't offer ── */}
          {stage === 'seeing' && (
            <Card>
              <Narration onReplay={() => speak(lines.seeing)}>{lines.seeing}</Narration>

              <div className="rounded-2xl overflow-hidden my-4"
                style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-card)' }}>
                <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-default)', backgroundColor: 'var(--surface-muted)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                    Final draft
                  </p>
                </div>
                <p className="px-4 py-3 text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>
                  {DEMO_PARAGRAPH}
                </p>
                <div className="px-4 py-2.5" style={{ borderTop: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)', backgroundColor: 'var(--surface-muted)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                    How they got there
                  </p>
                </div>
                <div className="px-4 py-3 space-y-2.5">
                  {DEMO_EXCHANGE.map((turn, i) => (
                    <div key={i} className="flex gap-2.5 items-start">
                      <span className="text-[10px] font-bold uppercase tracking-widest shrink-0 pt-1"
                        style={{ color: turn.role === 'coach' ? 'var(--accent-text)' : 'var(--text-subtle)', width: 52 }}>
                        {turn.role === 'coach' ? 'Owen' : 'Student'}
                      </span>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>{turn.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                You can read any session, any time — start to finish.
              </p>

              <PrimaryButton onClick={() => go('invite')}>
                {isParent ? 'Get my child started →' : 'Invite my students →'}
              </PrimaryButton>
              <StepIndicator n={stepNumber} total={STEPS.length} />
            </Card>
          )}

          {/* ── 3. The single action. Skippable, per "understanding outranks doing". ── */}
          {stage === 'invite' && (
            <Card>
              <Narration onReplay={() => speak(lines.invite)}>{lines.invite}</Narration>
              <InviteStep isParent={isParent} onDone={() => { stop(); onSkip() }} />
              <button
                onClick={() => { stop(); onTryPractice?.() }}
                className="w-full text-xs font-medium mt-3 transition hover:underline"
                style={{ color: 'var(--text-subtle)' }}>
                Or try writing one line yourself first
              </button>
              <StepIndicator n={stepNumber} total={STEPS.length} />
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// Same contract as AddChildForm: POST /api/invites { email, role:'student' } -> { token }.
// Inline here rather than reusing that component because this is a single focused step
// with no collapsed state, and it must not block — "I'll do this later" always exits.
function InviteStep({ isParent, onDone }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(null)      // { emailed, link }
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role: 'student' }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Something went wrong.'); return }
      setSent({ emailed: json.emailed === true, link: `${window.location.origin}/invite?token=${json.token}` })
    } catch {
      setError('Network error — please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div>
        <p className="text-sm mb-3" style={{ color: 'var(--text-body)' }}>
          {sent.emailed
            ? <>Invite sent. When they sign in with that link, you&rsquo;ll see their writing on your dashboard.</>
            : <>Invite ready — send them this link yourself. When they sign in with it, you&rsquo;ll see their writing on your dashboard.</>}
        </p>
        {!sent.emailed && (
          <button
            onClick={() => { navigator.clipboard.writeText(sent.link); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
            className="w-full rounded-full py-3 text-sm font-semibold mb-3 transition"
            style={{ border: '1px solid var(--border-strong)', color: 'var(--text-strong)', backgroundColor: 'var(--surface-card)' }}>
            {copied ? 'Copied ✓' : 'Copy invite link'}
          </button>
        )}
        <PrimaryButton onClick={onDone}>Go to my dashboard →</PrimaryButton>
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="invite-email" className="block text-sm mb-2" style={{ color: 'var(--text-body)' }}>
        {isParent ? "Your child's email" : "A student's email"}
      </label>
      <input
        id="invite-email"
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="name@example.com"
        className="w-full rounded-xl px-4 py-3 text-sm mb-3"
        style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-card)', color: 'var(--text-strong)' }}
      />
      {error ? <p className="text-sm mb-3" style={{ color: 'var(--status-danger, #DC2626)' }}>{error}</p> : null}
      <button
        type="submit"
        disabled={loading || !email.trim()}
        className="w-full rounded-full py-3.5 text-sm font-bold transition disabled:opacity-50"
        style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
        {loading ? 'Sending…' : 'Send the invite →'}
      </button>
      {/* Never a dead end: understanding outranks doing. */}
      <button
        type="button"
        onClick={onDone}
        className="w-full rounded-full py-3 text-sm font-semibold mt-2 transition"
        style={{ border: '1px solid var(--border-strong)', color: 'var(--text-muted)', backgroundColor: 'var(--surface-card)' }}>
        I&rsquo;ll do this later →
      </button>
    </form>
  )
}
