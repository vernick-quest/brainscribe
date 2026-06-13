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
.bs-avatar {
  font-family: var(--font-display);
  font-weight: var(--fw-bold);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-pill);
  color: #fff;
  flex-shrink: 0;
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}
.bs-avatar img { width: 100%; height: 100%; object-fit: cover; }
.bs-avatar--sm { width: 32px; height: 32px; font-size: var(--text-xs); }
.bs-avatar--md { width: 44px; height: 44px; font-size: var(--text-base); }
.bs-avatar--lg { width: 64px; height: 64px; font-size: var(--text-xl); }
`

const TUTOR_COLORS = {
  sage: 'var(--tutor-sage)',
  zip: 'var(--tutor-spark)',
  coach: 'var(--tutor-coach)',
  muse: 'var(--tutor-muse)',
  quill: 'var(--tutor-quill)',
  nova: 'var(--tutor-nova)',
}

/** Round avatar — tutor persona, student initial, or photo. */
export function Avatar({ name = '', src = null, tutor = null, color = null, size = 'md', className = '', ...rest }) {
  useStyle('bs-avatar', CSS)
  const bg = color || (tutor && TUTOR_COLORS[tutor]) || 'var(--navy-600)'
  const initial = name ? name.trim()[0].toUpperCase() : '?'
  return (
    <span className={`bs-avatar bs-avatar--${size} ${className}`} style={{ background: src ? 'transparent' : bg }} {...rest}>
      {src ? <img src={src} alt={name} /> : initial}
    </span>
  )
}
