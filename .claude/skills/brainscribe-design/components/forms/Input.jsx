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
.bs-field { font-family: var(--font-sans); display: flex; flex-direction: column; gap: 7px; }
.bs-field__label { font-size: var(--text-sm); font-weight: var(--fw-semibold); color: var(--text-strong); }
.bs-field__hint { font-size: var(--text-xs); color: var(--text-muted); }
.bs-input, .bs-textarea {
  font-family: var(--font-sans);
  font-size: var(--text-base);
  color: var(--text-body);
  background: var(--surface-card);
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  width: 100%;
  box-sizing: border-box;
  transition: border-color var(--dur-base) var(--ease-soft), box-shadow var(--dur-base) var(--ease-soft);
}
.bs-textarea { resize: vertical; line-height: var(--leading-relaxed); min-height: 96px; }
.bs-input::placeholder, .bs-textarea::placeholder { color: var(--text-subtle); }
.bs-input:hover, .bs-textarea:hover { border-color: var(--border-strong); }
.bs-input:focus, .bs-textarea:focus { outline: none; border-color: var(--orange-400); box-shadow: var(--focus-ring); }
.bs-field--error .bs-input, .bs-field--error .bs-textarea { border-color: var(--status-error); }
.bs-field__error { font-size: var(--text-xs); color: var(--status-error); }
`

/** Labeled text input / textarea with hint and error states. */
export function Input({
  label, hint, error, id, multiline = false, className = '', ...rest
}) {
  useStyle('bs-input', CSS)
  const fieldId = id || (label ? `f-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined)
  const Control = multiline ? 'textarea' : 'input'
  return (
    <div className={`bs-field ${error ? 'bs-field--error' : ''} ${className}`}>
      {label && <label className="bs-field__label" htmlFor={fieldId}>{label}</label>}
      <Control
        id={fieldId}
        className={multiline ? 'bs-textarea' : 'bs-input'}
        {...rest}
      />
      {error
        ? <span className="bs-field__error">{error}</span>
        : hint && <span className="bs-field__hint">{hint}</span>}
    </div>
  )
}
