import React from 'react'

function useStyle(id, css) {
  if (typeof document !== 'undefined' && !document.getElementById(id)) {
    const el = document.createElement('style')
    el.id = id
    el.textContent = css
    document.head.appendChild(el)
  }
}

const CSS = `
.bs-mic {
  position: relative;
  width: 76px; height: 76px;
  border-radius: var(--radius-pill);
  border: none;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent);
  color: #fff;
  box-shadow: var(--shadow-spark);
  transition: background var(--dur-base) var(--ease-soft), transform var(--dur-fast) var(--ease-soft);
}
.bs-mic:hover { background: var(--accent-hover); }
.bs-mic:active { transform: scale(0.95); }
.bs-mic:focus-visible { outline: none; box-shadow: var(--focus-ring), var(--shadow-spark); }
.bs-mic[disabled] { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
.bs-mic svg { width: 32px; height: 32px; position: relative; z-index: 1; }

.bs-mic--listening { background: var(--red-500); }
.bs-mic--listening:hover { background: var(--red-500); }
.bs-mic--listening::before,
.bs-mic--listening::after {
  content: ''; position: absolute; inset: 0;
  border-radius: var(--radius-pill);
  border: 2px solid var(--red-500);
  animation: bs-mic-ring 1.8s var(--ease-out) infinite;
}
.bs-mic--listening::after { animation-delay: 0.9s; }
@keyframes bs-mic-ring {
  0%   { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1.7); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .bs-mic--listening::before, .bs-mic--listening::after { animation: none; opacity: 0; }
}
.bs-mic__sizes-sm { width: 56px; height: 56px; }
.bs-mic__sizes-sm svg { width: 24px; height: 24px; }
`

/** The voice-capture button — BrainScribe's signature affordance. */
export function MicButton({ listening = false, disabled = false, size = 'md', onClick, className = '', ...rest }) {
  useStyle('bs-mic', CSS)
  const cls = [
    'bs-mic',
    listening ? 'bs-mic--listening' : '',
    size === 'sm' ? 'bs-mic__sizes-sm' : '',
    className,
  ].filter(Boolean).join(' ')
  return (
    <button
      className={cls}
      disabled={disabled}
      onClick={onClick}
      aria-pressed={listening}
      aria-label={listening ? 'Stop recording' : 'Tap to speak'}
      {...rest}
    >
      {listening ? (
        <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="3" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm6.5 9a.5.5 0 0 1 .5.5 7 7 0 0 1-6.5 6.97V20h2.5a.5.5 0 0 1 0 1h-6a.5.5 0 0 1 0-1H11v-2.53A7 7 0 0 1 4.5 10.5a.5.5 0 0 1 1 0 6 6 0 0 0 12 0 .5.5 0 0 1 .5-.5z" />
        </svg>
      )}
    </button>
  )
}
