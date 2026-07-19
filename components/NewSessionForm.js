'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PERSONAS as PERSONA_DATA, PersonaAvatar } from '@/lib/personas'
import { getCoachColor } from '@/lib/coachColors'
import WritingFormChooser from '@/components/WritingFormChooser'
import { getForm } from '@/lib/sampleLibrary'

const PERSONAS = Object.entries(PERSONA_DATA).map(([id, p]) => ({ id, ...p }))

const ACCEPTED = '.jpg,.jpeg,.png,.webp,.gif,.pdf'
const MAX_MB = 5

// Shown one at a time while the session is being created.
const PROGRESS_MESSAGES = [
  'Reading your assignment…',
  'Spotting the key requirements…',
  'Building your outline…',
  'Setting up your coach…',
]

// New assignment — Option A (Focused): one card, assignment + coach. Teacher
// assignment lives on the Assignments list (per-assignment teacher chip), not here.
// initialAssignmentText / initialFocus prefill the "revise a draft" path from the
// Head Grader (transcript → "work on this with your coach"). Both optional; a plain
// /assignment/new visit passes neither and behaves exactly as before.
export default function NewSessionForm({ initialAssignmentText = '', initialFocus = '' }) {
  const [assignment, setAssignment]             = useState(initialAssignmentText)
  const [persona, setPersona]                   = useState('owen')
  const [loading, setLoading]                   = useState(false)
  const [submitError, setSubmitError]           = useState('')
  const [uploading, setUploading]               = useState(false)
  const [uploadError, setUploadError]           = useState('')
  const [uploadedFileName, setUploadedFileName] = useState('')
  const [progressStep, setProgressStep]         = useState(0)
  const [chooserOpen, setChooserOpen]           = useState(false)
  // The writing form the student picked in the chooser (e.g. 'poetry'). The
  // load-bearing form hint travels in the assignment text itself (each prompt
  // names its form, so the coach scaffolds custom-vs-prose from the wording —
  // see lib/sampleLibrary.js); this is kept for potential future use/telemetry.
  const [chosenForm, setChosenForm]             = useState(null)
  const fileInputRef = useRef(null)
  const textareaRef = useRef(null)
  const router = useRouter()

  // Fill the assignment box from a chooser selection and capture the form. For
  // "write my own" the prompt is a scaffold line ending in a blank, so drop the
  // cursor at the end and focus the box so the student keeps typing their topic.
  function handleFormSample(promptText, form) {
    setAssignment(promptText)
    setChosenForm(form?.id ?? null)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      const end = promptText.length
      try { el.setSelectionRange(end, end) } catch {}
    })
  }

  useEffect(() => {
    if (!loading) { setProgressStep(0); return }
    const t = setInterval(() => setProgressStep(s => Math.min(s + 1, PROGRESS_MESSAGES.length - 1)), 1700)
    return () => clearInterval(t)
  }, [loading])

  // Phone photos routinely exceed the 5 MB cap and carry EXIF rotation that the
  // vision model can't compensate for (rotated text garbles extraction). Re-encode
  // images through a canvas: the browser applies EXIF orientation on decode, so
  // drawing bakes the correct rotation into the pixels, and downscaling to what
  // the model actually reads keeps big photos well under the upload cap.
  async function normalizeImage(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file // PDFs/GIFs pass through
    try {
      const bitmap = await createImageBitmap(file)
      const MAX_EDGE = 2000
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
      return blob && blob.size < file.size ? blob : file
    } catch { return file } // older browser or undecodable image — send as-is
  }

  async function handleFile(file) {
    if (!file) return
    setUploadError('')
    setUploading(true)
    setUploadedFileName(file.name)
    try {
      const upload = await normalizeImage(file)
      if (upload.size > MAX_MB * 1024 * 1024) {
        setUploadError(`File too large — max ${MAX_MB} MB.`)
        setUploadedFileName('')
        return
      }
      const form = new FormData()
      form.append('file', upload, file.name)
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
      // When revising toward a rubric criterion, pass the criterion (the rubric's
      // own words) as a plain orienting note appended to the assignment. It's
      // context for the coach — never a suggestion or a grade.
      const assignmentText = initialFocus
        ? `${assignment}\n\n(Revisiting a previous draft — focus this time on this part of the rubric: ${initialFocus})`
        : assignment
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentText, persona, subject: 'unspecified' }),
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

      {/* Revision focus (from the Head Grader) — the rubric's own words, shown as
          orientation. Not editable here; it rides along as context for the coach. */}
      {initialFocus && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', marginBottom: 'var(--space-4)', borderRadius: 'var(--radius-md)', background: 'var(--surface-spark)', border: '1px solid var(--border-accent)' }}>
          <PersonaAvatar personaId={persona} size={20} />
          <div>
            <span style={{ font: 'var(--type-meta)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--accent-text)', display: 'block', marginBottom: 2 }}>
              Working on this again
            </span>
            <span style={{ font: 'var(--type-ui)', color: 'var(--text-body)' }}>
              Focus this round: <strong>{initialFocus}</strong>
            </span>
          </div>
        </div>
      )}

      {/* ── Step 1 — Your assignment (the primary section: what are you writing?) ── */}
      <span style={{ font: 'var(--type-meta)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--accent-text)', display: 'block', marginBottom: 'var(--space-1)' }}>
        Step 1 · Your assignment
      </span>
      <h2 style={{ font: 'var(--type-heading)', color: 'var(--text-strong)', margin: '0 0 var(--space-1)' }}>
        What are you writing?
      </h2>
      <p style={{ font: 'var(--type-meta)', color: 'var(--text-subtle)', margin: '0 0 var(--space-3)' }}>
        Paste or type it, snap a photo, or browse writing ideas to get started.
      </p>
      <textarea
        ref={textareaRef}
        value={assignment}
        onChange={e => { setAssignment(e.target.value); if (chosenForm) setChosenForm(null) }}
        placeholder="Paste or type your writing assignment here…"
        rows={4}
        className="w-full resize-none focus:outline-none focus:ring-2 transition"
        style={{ font: 'var(--type-body)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '12px 14px', '--tw-ring-color': 'var(--ring)', color: 'var(--text-strong)' }}
      />

      {/* Reflects the form picked in the chooser. The coach still infers the form
          from the assignment wording — this is just confirmation for the student. */}
      {chosenForm && getForm(chosenForm) && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 'var(--space-2)', padding: '4px 12px', borderRadius: 'var(--radius-pill)', background: 'var(--surface-spark)', border: '1px solid var(--border-accent)' }}>
          <span style={{ font: 'var(--type-meta)', fontWeight: 'var(--fw-semibold)', color: 'var(--accent-text)' }}>
            Writing {getForm(chosenForm).name.toLowerCase()}
          </span>
        </div>
      )}

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
            <button type="button" onClick={e => { e.stopPropagation(); setUploadedFileName(''); setAssignment(''); setChosenForm(null) }}
              className="text-base shrink-0 leading-none" style={{ color: 'var(--text-subtle)' }} title="Remove" aria-label="Remove uploaded file">×</button>
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

      {/* Browse Ideas — belongs WITH the assignment: it helps the student fill Step 1 in. */}
      <button onClick={() => setChooserOpen(true)} type="button"
        className="inline-flex items-center gap-1.5"
        style={{ font: 'var(--type-ui)', color: 'var(--text-link)', background: 'none', border: 'none', cursor: 'pointer', minHeight: 44, marginTop: 'var(--space-2)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />
        </svg>
        Need an idea? Browse writing forms →
      </button>

      {/* ── Step 2 — Pick your coach (secondary: default is pre-picked so this never blocks) ── */}
      <div style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-5)', borderTop: '1px solid var(--border-default)' }}>
        <span style={{ font: 'var(--type-meta)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--text-muted)', display: 'block', marginBottom: 'var(--space-1)' }}>
          Step 2 · Pick your coach <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 'var(--fw-medium)', color: 'var(--text-subtle)' }}>— optional</span>
        </span>
        <p style={{ font: 'var(--type-meta)', color: 'var(--text-subtle)', margin: '0 0 var(--space-3)' }}>
          {selected?.name ?? 'Owen'} is ready to go — or tap another coach to see how they work. You can switch for any assignment.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3" style={{ gap: 'var(--space-2)' }}>
          {PERSONAS.map(p => {
            const on = persona === p.id
            const c = getCoachColor(p.asset)
            // Selected → border `base`, bg `tint`, name/style text `shade` (never
            // `base`-on-`tint`). Unselected → neutral, coach color only on hover.
            return (
              <button key={p.id} type="button" onClick={() => setPersona(p.id)} aria-pressed={on}
                className="text-left transition"
                onMouseEnter={e => { if (!on) e.currentTarget.style.borderColor = c.base }}
                onMouseLeave={e => { if (!on) e.currentTarget.style.borderColor = 'var(--border-default)' }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', cursor: 'pointer',
                  borderRadius: 'var(--radius-md)',
                  background: on ? c.tint : 'var(--surface-muted)',
                  border: `1.5px solid ${on ? c.base : 'var(--border-default)'}`,
                  boxShadow: on ? `0 0 0 3px color-mix(in srgb, ${c.base} 20%, transparent)` : 'none',
                }}>
                <PersonaAvatar personaId={p.id} size={56} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: on ? c.shade : 'var(--text-strong)', display: 'block' }}>{p.name}</span>
                  {/* Traits stacked one-per-line for a consistent Name / Trait 1 / Trait 2 layout. */}
                  {p.style.split('·').map((trait, i) => (
                    <span key={i} style={{ font: 'var(--type-meta)', fontWeight: 'var(--fw-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', color: on ? c.shade : 'var(--text-subtle)', display: 'block', marginTop: 1, lineHeight: 1.35 }}>{trait.trim()}</span>
                  ))}
                </span>
              </button>
            )
          })}
        </div>

        {/* Click-to-reveal intro for the selected coach — updates as the student taps
            different cards. Copy is display-only metadata (personas.js pickerIntro). */}
        {(selected?.pickerIntro || selected?.desc) && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 'var(--space-3)', padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--surface-muted)', border: `1px solid ${getCoachColor(selected?.asset).base}` }}>
            <PersonaAvatar personaId={persona} size={24} />
            <span style={{ minWidth: 0 }}>
              <span style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: getCoachColor(selected?.asset).shade, display: 'block' }}>Meet {selected?.name}</span>
              <span style={{ font: 'var(--type-meta)', color: 'var(--text-body)', display: 'block', marginTop: 2 }}>{selected?.pickerIntro ?? selected?.desc}</span>
            </span>
          </div>
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
      </div>

      <WritingFormChooser
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
        onSelect={handleFormSample}
      />
    </div>
  )
}
