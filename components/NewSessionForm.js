'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PERSONAS as PERSONA_DATA, PersonaAvatar } from '@/lib/personas'

const PERSONAS = Object.entries(PERSONA_DATA).map(([id, p]) => ({ id, ...p }))

const ACCEPTED = '.jpg,.jpeg,.png,.webp,.gif,.pdf'
const MAX_MB = 5
const SAMPLE = 'Write a 5-paragraph essay arguing whether the main character in "The Outsiders" changes by the end of the novel. Use specific evidence from the text.'

// Shown one at a time while the session is being created.
const PROGRESS_MESSAGES = [
  'Reading your assignment…',
  'Spotting the key requirements…',
  'Building your outline…',
  'Setting up your coach…',
]

// New assignment — Option A (Focused): one card, assignment + coach. Teacher
// assignment lives on the Assignments list (per-assignment teacher chip), not here.
export default function NewSessionForm() {
  const [assignment, setAssignment]             = useState('')
  const [persona, setPersona]                   = useState('owen')
  const [loading, setLoading]                   = useState(false)
  const [submitError, setSubmitError]           = useState('')
  const [uploading, setUploading]               = useState(false)
  const [uploadError, setUploadError]           = useState('')
  const [uploadedFileName, setUploadedFileName] = useState('')
  const [progressStep, setProgressStep]         = useState(0)
  const fileInputRef = useRef(null)
  const router = useRouter()

  useEffect(() => {
    if (!loading) { setProgressStep(0); return }
    const t = setInterval(() => setProgressStep(s => Math.min(s + 1, PROGRESS_MESSAGES.length - 1)), 1700)
    return () => clearInterval(t)
  }, [loading])

  async function handleFile(file) {
    if (!file) return
    setUploadError('')
    if (file.size > MAX_MB * 1024 * 1024) { setUploadError(`File too large — max ${MAX_MB} MB.`); return }
    setUploading(true)
    setUploadedFileName(file.name)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/parse-assignment', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok || json.error) { setUploadError(json.error ?? 'Could not read the file.'); setUploadedFileName('') }
      else setAssignment(json.assignmentText)
    } catch { setUploadError('Upload failed — please try again.'); setUploadedFileName('') }
    finally { setUploading(false) }
  }

  function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  async function handleSubmit() {
    if (!assignment.trim() || loading || uploading) return
    setLoading(true)
    setSubmitError('')
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentText: assignment, persona, subject: 'unspecified' }),
      })
      const session = await res.json()
      if (!res.ok || !session.id) {
        setSubmitError(session.error ?? 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }
      router.push(`/assignment/${session.id}`)
    } catch {
      setSubmitError('Network error — please check your connection and try again.')
      setLoading(false)
    }
  }

  const selected = PERSONA_DATA[persona]
  const canStart = !!assignment.trim()

  return (
    <div style={{
      backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)',
      boxShadow: 'var(--shadow-md)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)',
    }}>

      {/* Your assignment */}
      <span style={{ font: 'var(--type-meta)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--text-muted)', display: 'block', marginBottom: 'var(--space-3)' }}>
        Your assignment
      </span>
      <textarea
        value={assignment}
        onChange={e => setAssignment(e.target.value)}
        placeholder="Paste or type your writing assignment here…"
        rows={4}
        className="w-full resize-none focus:outline-none focus:ring-2 transition"
        style={{ font: 'var(--type-body)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '12px 14px', '--tw-ring-color': 'var(--ring)', color: 'var(--text-strong)' }}
      />

      {/* Upload box (real OCR) */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a photo or PDF of your assignment"
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
        className="transition cursor-pointer"
        style={{
          marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
          borderRadius: 'var(--radius-md)', background: 'var(--surface-muted)', border: '1.5px dashed var(--border-strong)',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
      >
        <input ref={fileInputRef} type="file" accept={ACCEPTED} className="sr-only" onChange={e => handleFile(e.target.files?.[0])} />

        {uploading ? (
          <>
            <svg className="w-5 h-5 animate-spin shrink-0" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span style={{ font: 'var(--type-ui)', color: 'var(--text-muted)' }}>Reading your file…</span>
          </>
        ) : uploadedFileName && !uploadError ? (
          <>
            <svg className="w-5 h-5 shrink-0" style={{ color: 'var(--status-success)' }} fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2">
              <path d="M5 10l4 4 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="flex-1 truncate" style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--status-success)' }}>{uploadedFileName}</span>
            <button type="button" onClick={e => { e.stopPropagation(); setUploadedFileName(''); setAssignment('') }}
              className="text-base shrink-0 leading-none" style={{ color: 'var(--text-subtle)' }} title="Remove">×</button>
          </>
        ) : (
          <>
            <span className="shrink-0" style={{ width: 34, height: 34, borderRadius: 'var(--radius-pill)', background: 'var(--accent-soft)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12M8 8l4-4 4 4" />
              </svg>
            </span>
            <span>
              <span style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--text-strong)', display: 'block' }}>Upload a photo or PDF</span>
              <span style={{ font: 'var(--type-meta)', color: uploadError ? 'var(--status-error)' : 'var(--text-muted)' }}>
                {uploadError || 'Snap your worksheet or drop a handout — JPG, PNG, or PDF'}
              </span>
            </span>
          </>
        )}
      </div>

      {/* Coach for this assignment */}
      <div style={{ marginTop: 'var(--space-5)' }}>
        <span style={{ font: 'var(--type-meta)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--text-muted)', display: 'block', marginBottom: 'var(--space-1)' }}>
          Coach for this assignment
        </span>
        <p style={{ font: 'var(--type-meta)', color: 'var(--text-subtle)', margin: '0 0 var(--space-3)' }}>
          Pick whoever fits this one — you can choose a different coach for every assignment.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3" style={{ gap: 'var(--space-2)' }}>
          {PERSONAS.map(p => {
            const on = persona === p.id
            return (
              <button key={p.id} type="button" onClick={() => setPersona(p.id)} aria-pressed={on}
                className="text-left transition"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer',
                  borderRadius: 'var(--radius-md)',
                  background: on ? 'var(--surface-card)' : 'var(--surface-muted)',
                  border: `1.5px solid ${on ? p.color : 'var(--border-default)'}`,
                  boxShadow: on ? `0 0 0 3px color-mix(in srgb, ${p.color} 20%, transparent)` : 'none',
                }}>
                <PersonaAvatar personaId={p.id} size={28} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--text-strong)', display: 'block' }}>{p.name}</span>
                  <span style={{ font: 'var(--type-meta)', fontWeight: 'var(--fw-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', color: p.color, display: 'block', marginTop: 1 }}>{p.style}</span>
                </span>
              </button>
            )
          })}
        </div>

        {selected?.desc && (
          <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: 'var(--space-3) 0 0' }}>{selected.desc}</p>
        )}
      </div>

      {submitError && <p className="text-sm text-center" style={{ color: 'var(--status-error)', marginTop: 'var(--space-4)' }}>{submitError}</p>}

      {/* Action row */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 'var(--space-6)', flexWrap: 'wrap' }}>
        <button
          onClick={handleSubmit}
          disabled={!canStart || loading || uploading}
          className="inline-flex items-center gap-2 transition disabled:opacity-50"
          style={{
            font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--text-on-accent)',
            backgroundColor: 'var(--accent)', borderRadius: 'var(--radius-pill)', padding: '12px 22px', cursor: canStart ? 'pointer' : 'not-allowed',
          }}
        >
          {loading ? PROGRESS_MESSAGES[progressStep] : `Start writing with ${selected?.name ?? 'BrainScribe'}`}
          {!loading && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          )}
        </button>
        <button onClick={() => setAssignment(SAMPLE)} type="button"
          style={{ font: 'var(--type-ui)', color: 'var(--text-link)', background: 'none', border: 'none', cursor: 'pointer' }}>
          Use a sample assignment
        </button>
      </div>
    </div>
  )
}
