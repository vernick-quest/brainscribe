'use client'

// components/SourcesPanel.js — Research & Citations v1 UI (form-gated to essays).
//
// Three pieces, all rendered inside TutorSession's Draft panel:
//   • SourcesShelf     — slim "Sources N · Works Cited" bar + expandable list + "+ add".
//   • SourceCaptureCard — the confirm card the coach's [SOURCE:] token opens (auto-fills
//                         from the URL via the SSRF-guarded /api/source-metadata, then
//                         the student checks/edits before saving). Also the manual "+".
//   • WorksCitedCard   — the auto-generated bibliography, rendered as the last draft card.
//
// Stores ONLY citation metadata — never source content. The bibliography string is
// produced deterministically by lib/citations.js (no model).

import { useState, useEffect } from 'react'
import { formatCitation, formatBibliography, CITATION_STYLES } from '@/lib/citations'

// DB rows use snake_case; the pure formatter wants camelCase.
export function toCitationSource(row) {
  return {
    title: row.title || '',
    author: row.author || '',
    publisher: row.publisher || '',
    publishedDate: row.published_date || '',
    url: row.url || '',
    accessedDate: row.accessed_date || '',
  }
}

function Segments({ segments }) {
  return segments.map((s, i) => (s.italic ? <em key={i}>{s.text}</em> : <span key={i}>{s.text}</span>))
}

const inputCls = 'w-full rounded-lg px-2.5 py-1.5 text-sm'
const inputStyle = {
  backgroundColor: 'var(--surface-input, var(--surface-muted))',
  border: '1px solid var(--border-default)',
  color: 'var(--text-body)',
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <input className={inputCls} style={inputStyle} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} />
    </label>
  )
}

export function SourceCaptureCard({ capture, onSave, onDismiss }) {
  const [fields, setFields] = useState({
    title: '', author: '', publisher: '', published_date: '', url: capture.url || '',
  })
  const [status, setStatus] = useState(capture.url ? 'fetching' : 'idle') // idle|fetching|fetched|manual
  const set = (k) => (v) => setFields(f => ({ ...f, [k]: v }))

  // Auto-fill once from the link the coach captured (SSRF-guarded server fetch).
  useEffect(() => {
    if (!capture.url) return
    let live = true
    ;(async () => {
      try {
        const res = await fetch('/api/source-metadata', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: capture.url }),
        })
        const data = await res.json().catch(() => null)
        if (!live) return
        if (data?.ok && data.metadata) {
          const m = data.metadata
          setFields(f => ({
            title: m.title || f.title,
            author: m.author || f.author,
            publisher: m.publisher || f.publisher,
            published_date: m.publishedDate || f.published_date,
            url: m.url || f.url,
          }))
          setStatus('fetched')
        } else {
          setStatus('manual') // blocked or failed → guided manual card, never a dead end
        }
      } catch { if (live) setStatus('manual') }
    })()
    return () => { live = false }
  }, [capture.url])

  const origin = capture.url ? 'fetched' : (capture.manual ? 'typed' : 'voice')

  return (
    <div className="rounded-xl p-3 space-y-2"
      style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--accent)' }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--accent-text)' }}>
          Add this source?
        </span>
        {status === 'fetching' && (
          <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>Looking it up…</span>
        )}
      </div>
      {capture.description && !capture.manual && (
        <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>“{capture.description}”</p>
      )}
      {status === 'manual' && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Couldn’t read that link automatically — fill in what you know. (No author shown? That’s okay — leave it blank.)
        </p>
      )}
      <div className="space-y-1.5">
        <Field label="Title" value={fields.title} onChange={set('title')} placeholder="Article or page title" />
        <Field label="Author" value={fields.author} onChange={set('author')} placeholder="Leave blank if none shown" />
        <Field label="Website / publisher" value={fields.publisher} onChange={set('publisher')} placeholder="e.g. National Geographic" />
        <Field label="Date published" value={fields.published_date} onChange={set('published_date')} placeholder="e.g. 2021 or 2021-03-12" />
        <Field label="Link" value={fields.url} onChange={set('url')} placeholder="https://…" />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onSave({ ...fields, origin }, capture.key)}
          disabled={status === 'fetching'}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--text-on-accent)' }}>
          Save source
        </button>
        <button onClick={() => onDismiss(capture.key)}
          className="rounded-lg px-3 py-1.5 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
          Not now
        </button>
      </div>
    </div>
  )
}

export function SourcesShelf({ sources, captures, style, onSave, onDismiss, onAdd, onDelete }) {
  const [open, setOpen] = useState(false)
  const count = sources.length
  const hasCaptures = captures.length > 0

  return (
    <div className="rounded-xl" style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-muted)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm"
        aria-expanded={open}
        style={{ color: 'var(--text-body)' }}>
        <span className="flex items-center gap-2">
          <span aria-hidden>📚</span>
          <span className="font-semibold">Sources</span>
          <span style={{ color: 'var(--text-muted)' }}>{count}</span>
          {hasCaptures && (
            <span className="rounded-full px-1.5 text-xs font-semibold"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--text-on-accent)' }}>
              {captures.length} to confirm
            </span>
          )}
        </span>
        <span aria-hidden style={{ color: 'var(--text-subtle)' }}>{open ? '▾' : '▸'}</span>
      </button>

      {(open || hasCaptures) && (
        <div className="px-3 pb-3 space-y-2">
          {captures.map(c => (
            <SourceCaptureCard key={c.key} capture={c} onSave={onSave} onDismiss={onDismiss} />
          ))}
          {open && (
            <>
              {sources.length === 0 && !hasCaptures && (
                <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                  No sources yet. Tell your coach what you read (“I used the NatGeo article…”) or add one below.
                </p>
              )}
              {sources.map(row => (
                <div key={row.id} className="flex items-start justify-between gap-2 text-sm">
                  <span style={{ color: 'var(--text-body)' }}><Segments segments={formatCitation(toCitationSource(row), style).segments} /></span>
                  <button onClick={() => onDelete(row.id)} aria-label="Remove source"
                    className="shrink-0 text-xs" style={{ color: 'var(--text-subtle)' }}>✕</button>
                </div>
              ))}
              <button onClick={onAdd}
                className="text-xs font-semibold" style={{ color: 'var(--accent-text)' }}>
                + Add a source
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function WorksCitedCard({ sources, style, onStyleChange }) {
  if (!sources.length) return null
  const bib = formatBibliography(sources.map(toCitationSource), style)
  return (
    <div className="rounded-xl p-4 space-y-3"
      style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)' }}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          {bib.heading}
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
            {CITATION_STYLES.map(s => (
              <button key={s} onClick={() => onStyleChange(s)}
                className="px-2 py-0.5 text-xs font-semibold uppercase"
                style={s === style
                  ? { backgroundColor: 'var(--accent)', color: 'var(--text-on-accent)' }
                  : { color: 'var(--text-muted)' }}>
                {s}
              </button>
            ))}
          </div>
          <button onClick={() => navigator.clipboard?.writeText(`${bib.heading}\n${bib.plain}`)}
            className="text-xs font-medium hover:underline" style={{ color: 'var(--accent-text)' }}>
            Copy
          </button>
        </div>
      </div>
      <ol className="space-y-2">
        {bib.entries.map((e, i) => (
          // Hanging-indent-ish rendering; each entry is a formatted citation.
          <li key={i} className="text-sm leading-relaxed" style={{ color: 'var(--text-body)', paddingLeft: '1.25rem', textIndent: '-1.25rem' }}>
            <Segments segments={e.segments} />
          </li>
        ))}
      </ol>
    </div>
  )
}
