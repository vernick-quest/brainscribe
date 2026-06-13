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
.bs-badge {
  font-family: var(--font-sans);
  font-weight: var(--fw-semibold);
  font-size: var(--text-xs);
  line-height: 1;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: var(--radius-pill);
  letter-spacing: 0.01em;
  white-space: nowrap;
}
.bs-badge .bs-badge__dot { width: 6px; height: 6px; border-radius: 999px; background: currentColor; }
.bs-badge--neutral { background: var(--surface-muted); color: var(--ink-700); }
.bs-badge--navy    { background: var(--navy-100); color: var(--navy-800); }
.bs-badge--accent  { background: var(--accent-soft); color: var(--orange-700); }
.bs-badge--success { background: var(--status-success-bg); color: var(--green-500); }
.bs-badge--thin    { background: var(--status-thin-bg); color: var(--amber-500); }
.bs-badge--error   { background: var(--status-error-bg); color: var(--red-500); }
.bs-badge--solid   { background: var(--accent); color: #fff; }
`

/** Small status / category pill. */
export function Badge({ children, tone = 'neutral', dot = false, className = '', ...rest }) {
  useStyle('bs-badge', CSS)
  return (
    <span className={`bs-badge bs-badge--${tone} ${className}`} {...rest}>
      {dot && <span className="bs-badge__dot" />}
      {children}
    </span>
  )
}
