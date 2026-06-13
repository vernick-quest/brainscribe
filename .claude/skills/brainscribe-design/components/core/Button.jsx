import React from 'react'

/* Inject component CSS once. Hover/press/focus need real CSS, so each
   component ships a tiny stylesheet keyed by id. */
function useStyle(id, css) {
  if (typeof document !== 'undefined' && !document.getElementById(id)) {
    const el = document.createElement('style')
    el.id = id
    el.textContent = css
    document.head.appendChild(el)
  }
}

const CSS = `
.bs-btn {
  font-family: var(--font-sans);
  font-weight: var(--fw-semibold);
  border-radius: var(--radius-pill);
  border: 1.5px solid transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
  transition: background var(--dur-base) var(--ease-soft),
              color var(--dur-base) var(--ease-soft),
              border-color var(--dur-base) var(--ease-soft),
              transform var(--dur-fast) var(--ease-soft),
              box-shadow var(--dur-base) var(--ease-soft);
}
.bs-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.bs-btn:active { transform: translateY(1px) scale(0.985); }
.bs-btn[disabled] { opacity: 0.45; cursor: not-allowed; transform: none; }

.bs-btn--sm { font-size: var(--text-sm); padding: 8px 16px; min-height: 36px; }
.bs-btn--md { font-size: var(--text-base); padding: 11px 22px; min-height: var(--tap-min); }
.bs-btn--lg { font-size: var(--text-md); padding: 15px 30px; min-height: 54px; }
.bs-btn--block { width: 100%; }

.bs-btn--primary { background: var(--accent); color: var(--text-on-accent); box-shadow: var(--shadow-spark); }
.bs-btn--primary:hover:not([disabled]) { background: var(--accent-hover); }
.bs-btn--primary:active:not([disabled]) { background: var(--accent-press); }

.bs-btn--navy { background: var(--primary); color: var(--text-on-dark); box-shadow: var(--shadow-sm); }
.bs-btn--navy:hover:not([disabled]) { background: var(--primary-hover); }

.bs-btn--secondary { background: var(--surface-card); color: var(--text-strong); border-color: var(--border-strong); }
.bs-btn--secondary:hover:not([disabled]) { border-color: var(--navy-800); background: var(--navy-50); }

.bs-btn--soft { background: var(--accent-soft); color: var(--orange-700); }
.bs-btn--soft:hover:not([disabled]) { background: var(--orange-200); }

.bs-btn--ghost { background: transparent; color: var(--text-link); }
.bs-btn--ghost:hover:not([disabled]) { background: var(--navy-50); }
`

/**
 * Primary action button. `variant` sets intent, `size` sets scale.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  leftIcon = null,
  rightIcon = null,
  as = 'button',
  className = '',
  ...rest
}) {
  useStyle('bs-button', CSS)
  const Tag = as
  const cls = [
    'bs-btn',
    `bs-btn--${variant}`,
    `bs-btn--${size}`,
    block ? 'bs-btn--block' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <Tag className={cls} {...rest}>
      {leftIcon}
      {children}
      {rightIcon}
    </Tag>
  )
}
