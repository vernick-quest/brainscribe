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
.bs-card {
  font-family: var(--font-sans);
  background: var(--surface-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-default);
  box-shadow: var(--shadow-sm);
  padding: var(--space-5);
  color: var(--text-body);
}
.bs-card--flat { box-shadow: none; }
.bs-card--raised { box-shadow: var(--shadow-md); border-color: transparent; }
.bs-card--muted { background: var(--surface-muted); border-color: transparent; box-shadow: none; }
.bs-card--ink { background: var(--surface-ink); color: var(--text-on-dark); border-color: transparent; }
.bs-card--interactive { cursor: pointer; transition: box-shadow var(--dur-base) var(--ease-soft), transform var(--dur-base) var(--ease-soft); }
.bs-card--interactive:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
`

/** Surface container — the basic paper block of the UI. */
export function Card({ children, variant = 'default', interactive = false, as = 'div', className = '', ...rest }) {
  useStyle('bs-card', CSS)
  const Tag = as
  const cls = [
    'bs-card',
    variant !== 'default' ? `bs-card--${variant}` : '',
    interactive ? 'bs-card--interactive' : '',
    className,
  ].filter(Boolean).join(' ')
  return <Tag className={cls} {...rest}>{children}</Tag>
}
