'use client'

// Shared FTUE presentation primitives.
//
// Extracted from OnboardingFlow so WatcherOnboarding can use them without the two files
// importing each other — a cycle that resolves at runtime but is exactly the kind of thing
// that breaks unpredictably under bundler changes. Presentation only, no state, no logic.

export function Card({ children }) {
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

// Owen's spoken line + a replay control (mirrors the in-chat "replay" affordance).
// Autoplay is blocked until the first gesture, so the button is the reliable way to
// hear the line.
export function Narration({ children, onReplay, replayLabel = 'Replay' }) {
  return (
    <div>
      <SpeechText>{children}</SpeechText>
      <ReplayButton onClick={onReplay} label={replayLabel} />
    </div>
  )
}

// `label` is overridable because on the watcher demo screen CoachDemo renders its OWN
// "Replay" (which replays the animation). Two identical buttons meaning different things
// on one screen is a coin flip for the user.
function ReplayButton({ onClick, label = 'Replay' }) {
  return (
    <div className="flex justify-end mt-1.5">
      <button onClick={onClick}
        className="inline-flex items-center gap-1 text-xs font-medium transition hover:underline"
        style={{ color: 'var(--text-subtle)' }}
        aria-label="Replay Owen's audio">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <polygon points="6 4 20 12 6 20 6 4" />
        </svg>
        {label}
      </button>
    </div>
  )
}

export function StepIndicator({ n, total }) {
  return (
    <p className="text-center" style={{ font: 'var(--type-meta)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-subtle)' }}>
      Step {n} of {total}
    </p>
  )
}

export function PrimaryButton({ onClick, children }) {
  return (
    <button onClick={onClick}
      className="w-full transition"
      style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--text-on-accent)', backgroundColor: 'var(--accent)', borderRadius: 'var(--radius-pill)', padding: '12px 0' }}>
      {children}
    </button>
  )
}

