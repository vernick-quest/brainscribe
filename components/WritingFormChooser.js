'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Icon from '@/components/Icon'
import { SAMPLE_LIBRARY } from '@/lib/sampleLibrary'

// "What do you want to write?" — an FTUE-style two-step modal that replaces the
// single hardcoded sample essay in NewSessionForm. Step 1 picks a writing FORM
// (poetry, paragraph, letter, essay, story, speech); step 2 picks a curated
// sample prompt for that form, or "write my own". Selecting a sample calls
// onSelect(promptText, form) — the caller fills the assignment box; the form
// hint rides along inside the prompt text (see lib/sampleLibrary.js), so custom
// forms scaffold as custom with no migration.
//
// A11y: role="dialog" + aria-modal, focus-trap, Esc + backdrop dismiss, restores
// focus to the trigger on close, 44px targets, :focus-visible rings (globals),
// prefers-reduced-motion respected (animations gated in the scoped <style>).

const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export default function WritingFormChooser({ open, onClose, onSelect }) {
  const [formId, setFormId] = useState(null)      // null = step 1 (form grid)
  const dialogRef = useRef(null)
  const triggerRef = useRef(null)                 // element focused before opening

  const form = formId ? SAMPLE_LIBRARY.find(f => f.id === formId) : null

  // Remember what had focus so we can restore it on close, and reset to step 1
  // each time the modal opens.
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement
      setFormId(null)
    }
  }, [open])

  // Focus the dialog once it's rendered, so keyboard users land inside it.
  useEffect(() => {
    if (!open) return
    const el = dialogRef.current
    if (!el) return
    const first = el.querySelector(FOCUSABLE)
    ;(first ?? el).focus()
  }, [open, formId])

  const close = useCallback(() => {
    onClose?.()
    // Return focus to whatever opened the modal.
    const t = triggerRef.current
    if (t && typeof t.focus === 'function') t.focus()
  }, [onClose])

  // Esc to dismiss + focus trap on Tab.
  useEffect(() => {
    if (!open) return
    function onKeyDown(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return }
      if (e.key !== 'Tab') return
      const el = dialogRef.current
      if (!el) return
      const items = Array.from(el.querySelectorAll(FOCUSABLE)).filter(n => n.offsetParent !== null)
      if (items.length === 0) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  // Lock body scroll while the modal is up.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  function pickSample(prompt) {
    onSelect?.(prompt, form)
    onClose?.()
    const t = triggerRef.current
    if (t && typeof t.focus === 'function') t.focus()
  }

  const titleId = 'wfc-title'

  return (
    <div
      className="wfc-backdrop"
      onClick={e => { if (e.target === e.currentTarget) close() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'color-mix(in srgb, var(--navy-900, #0f2942) 55%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="wfc-panel"
        style={{
          background: 'var(--surface-card)', border: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-lg)', borderRadius: 'var(--radius-xl)',
          width: 'min(560px, 100%)', maxHeight: 'min(88vh, 720px)',
          display: 'flex', flexDirection: 'column', outline: 'none',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 'var(--space-5) var(--space-5) var(--space-3)' }}>
          {form && (
            <button
              type="button"
              onClick={() => setFormId(null)}
              aria-label="Back to writing forms"
              className="wfc-iconbtn"
              style={iconBtnStyle}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ font: 'var(--type-meta)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
              {form ? form.name : 'Need an idea?'}
            </span>
            <h2 id={titleId} style={{ font: 'var(--type-h3, var(--type-lead))', fontWeight: 'var(--fw-bold)', color: 'var(--text-strong)', margin: 0 }}>
              {form ? 'Pick a prompt — or write your own' : 'What do you want to write?'}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="wfc-iconbtn"
            style={iconBtnStyle}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body (scrolls if tall) */}
        <div style={{ overflowY: 'auto', padding: '0 var(--space-5) var(--space-5)' }}>
          {!form ? (
            <div className="wfc-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)' }}>
              {SAMPLE_LIBRARY.map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormId(f.id)}
                  className="wfc-card"
                  style={cardStyle}
                >
                  <span style={glyphStyle}>
                    <Icon name={f.icon} size={22} style={{ color: 'var(--accent)' }} />
                  </span>
                  <span style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--text-strong)', display: 'block', marginTop: 10 }}>{f.name}</span>
                  <span style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', display: 'block', marginTop: 3, lineHeight: 1.35 }}>{f.blurb}</span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {form.samples.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pickSample(s.prompt)}
                  className="wfc-row"
                  style={rowStyle}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-strong)', display: 'block' }}>{s.label}</span>
                    <span style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', display: 'block', marginTop: 2, lineHeight: 1.4 }}>{s.prompt}</span>
                  </span>
                  <svg className="wfc-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-subtle)', flexShrink: 0, marginTop: 2 }} aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              ))}

              {/* Write my own — fills the box with a light form-naming scaffold line. */}
              <button
                type="button"
                onClick={() => pickSample(form.ownStarter)}
                className="wfc-row wfc-row-own"
                style={{ ...rowStyle, background: 'var(--surface-spark)', borderColor: 'var(--border-accent)' }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--accent-text)', display: 'block' }}>
                    Write my own {form.name.replace(/^An? /, '').toLowerCase()} →
                  </span>
                  <span style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', display: 'block', marginTop: 2 }}>
                    We&rsquo;ll start the box for you — you fill in the topic.
                  </span>
                </span>
                <Icon name="pencil" size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .wfc-backdrop { animation: wfc-fade 160ms ease-out; }
        .wfc-panel { animation: wfc-rise 200ms ease-out; }
        @keyframes wfc-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes wfc-rise { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
        .wfc-card, .wfc-row { transition: border-color 140ms ease-out, background 140ms ease-out, transform 140ms ease-out; }
        .wfc-card:hover { border-color: var(--border-accent); transform: translateY(-2px); }
        .wfc-row:hover { border-color: var(--border-accent); background: var(--surface-spark); }
        .wfc-row:hover .wfc-chev { color: var(--accent); }
        .wfc-iconbtn:hover { background: var(--surface-muted); color: var(--text-strong); }
        @media (max-width: 480px) {
          .wfc-backdrop { align-items: flex-end !important; padding: 0 !important; }
          .wfc-panel { width: 100% !important; max-height: 92vh !important; border-radius: var(--radius-xl) var(--radius-xl) 0 0 !important; }
          .wfc-grid { grid-template-columns: 1fr 1fr; }
          .wfc-panel { animation: wfc-sheet 220ms ease-out; }
          @keyframes wfc-sheet { from { transform: translateY(100%) } to { transform: none } }
        }
        @media (prefers-reduced-motion: reduce) {
          .wfc-backdrop, .wfc-panel { animation: none !important; }
          .wfc-card:hover { transform: none; }
        }
      `}</style>
    </div>
  )
}

const iconBtnStyle = {
  flexShrink: 0, width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 'var(--radius-pill)', border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
}

const cardStyle = {
  textAlign: 'left', cursor: 'pointer', minHeight: 44,
  padding: '16px 16px 18px', borderRadius: 'var(--radius-lg)',
  background: 'var(--surface-card)', border: '1.5px solid var(--border-default)',
}

const glyphStyle = {
  width: 38, height: 38, borderRadius: 'var(--radius-pill)', background: 'var(--accent-soft)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}

const rowStyle = {
  display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', minHeight: 44,
  padding: '14px 16px', borderRadius: 'var(--radius-md)',
  background: 'var(--surface-muted)', border: '1.5px solid var(--border-default)', textAlign: 'left',
}
