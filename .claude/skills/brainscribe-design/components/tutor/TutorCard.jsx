import React from 'react'
import { Avatar } from '../core/Avatar.jsx'

function useStyle(id, css) {
  if (typeof document !== 'undefined' && !document.getElementById(id)) {
    const el = document.createElement('style')
    el.id = id
    el.textContent = css
    document.head.appendChild(el)
  }
}

const CSS = `
.bs-tutor {
  font-family: var(--font-sans);
  background: var(--surface-card);
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  display: flex; flex-direction: column; gap: var(--space-3);
  cursor: pointer;
  text-align: left;
  transition: border-color var(--dur-base) var(--ease-soft), box-shadow var(--dur-base) var(--ease-soft), transform var(--dur-base) var(--ease-soft);
}
.bs-tutor:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
.bs-tutor:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.bs-tutor.is-selected { border-color: var(--tutor-color, var(--accent)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--tutor-color, var(--accent)) 22%, transparent); }
.bs-tutor__head { display: flex; align-items: center; gap: 12px; }
.bs-tutor__name { font-family: var(--font-display); font-weight: var(--fw-bold); font-size: var(--text-lg); color: var(--text-strong); margin: 0; }
.bs-tutor__style { font-size: var(--text-xs); font-weight: var(--fw-semibold); text-transform: uppercase; letter-spacing: var(--tracking-wide); color: var(--tutor-color, var(--accent)); }
.bs-tutor__desc { font-size: var(--text-sm); line-height: var(--leading-relaxed); color: var(--text-muted); margin: 0; }
.bs-tutor__check { margin-left: auto; width: 24px; height: 24px; border-radius: var(--radius-pill); background: var(--tutor-color, var(--accent)); color: #fff; display: flex; align-items: center; justify-content: center; }
.bs-tutor__check svg { width: 14px; height: 14px; }
`

const TUTOR_COLORS = {
  sage: 'var(--tutor-sage)', zip: 'var(--tutor-spark)',
  coach: 'var(--tutor-coach)', muse: 'var(--tutor-muse)',
  quill: 'var(--tutor-quill)', nova: 'var(--tutor-nova)',
}

/** Selectable coaching-persona card for the tutor picker. */
export function TutorCard({
  persona = 'sage', name, style, description, selected = false, onSelect, className = '', ...rest
}) {
  useStyle('bs-tutor', CSS)
  return (
    <button
      className={`bs-tutor ${selected ? 'is-selected' : ''} ${className}`}
      style={{ '--tutor-color': TUTOR_COLORS[persona] }}
      onClick={onSelect}
      aria-pressed={selected}
      {...rest}
    >
      <div className="bs-tutor__head">
        <Avatar tutor={persona} name={name} size="md" />
        <div>
          <p className="bs-tutor__name">{name}</p>
          <span className="bs-tutor__style">{style}</span>
        </div>
        {selected && (
          <span className="bs-tutor__check">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
        )}
      </div>
      <p className="bs-tutor__desc">{description}</p>
    </button>
  )
}
