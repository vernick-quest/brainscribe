'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PERSONAS as PERSONA_DATA, PersonaAvatar } from '@/lib/personas'
import SubjectPicker from '@/components/SubjectPicker'

const PERSONAS = Object.entries(PERSONA_DATA).map(([id, p]) => ({ id, ...p }))

const ACCEPTED = '.jpg,.jpeg,.png,.webp,.gif,.pdf'
const MAX_MB = 5

// Shown one at a time while the session is being created, so the few-second
// wait reads as deliberate work rather than a stall.
const PROGRESS_MESSAGES = [
  'Reading your assignment…',
  'Spotting the key requirements…',
  'Building your outline…',
  'Setting up your coach…',
]

export default function NewSessionForm() {
  const [assignment, setAssignment]             = useState('')
  const [persona, setPersona]                   = useState('owen')
  const [subject, setSubject]                   = useState('unspecified')
  const [subjectCustomLabel, setSubjectCustomLabel] = useState('')
  const [teacherEmail, setTeacherEmail]         = useState('')
  const [loading, setLoading]                   = useState(false)
  const [submitError, setSubmitError]           = useState('')
  const [uploading, setUploading]               = useState(false)
  const [uploadError, setUploadError]           = useState('')
  const [uploadedFileName, setUploadedFileName] = useState('')
  const [progressStep, setProgressStep]         = useState(0)
  const fileInputRef = useRef(null)
  const router = useRouter()

  // Advance the progress message while loading; reset when idle.
  useEffect(() => {
    if (!loading) { setProgressStep(0); return }
    const t = setInterval(() => {
      setProgressStep(s => Math.min(s + 1, PROGRESS_MESSAGES.length - 1))
    }, 1700)
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

  async function handleSubmit(e) {
    e.preventDefault()
    if (!assignment.trim()) return
    setLoading(true)
    setSubmitError('')

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentText: assignment,
          persona,
          subject,
          subjectCustomLabel: subject === 'other' ? subjectCustomLabel : undefined,
        }),
      })
      const session = await res.json()
      if (!res.ok || !session.id) {
        setSubmitError(session.error ?? 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }

      // If teacher email provided, send invite (fire-and-forget)
      if (teacherEmail.trim()) {
        fetch('/api/invites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: teacherEmail.trim(), role: 'teacher', assignmentId: session.id }),
        }).catch(() => {})
      }

      router.push(`/assignment/${session.id}`)
    } catch {
      setSubmitError('Network error — please check your connection and try again.')
      setLoading(false)
    }
  }

  const selectedPersona = PERSONA_DATA[persona]

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl p-6 space-y-6"
      style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
      <h2 style={{ color: 'var(--text-strong)', font: 'var(--type-subhead)' }}>
        Start a new assignment
      </h2>

      {/* 1. Assignment input */}
      <div className="space-y-2">
        <textarea
          value={assignment}
          onChange={e => setAssignment(e.target.value)}
          placeholder="Paste or type your writing assignment here…"
          rows={4}
          className="w-full text-sm rounded-xl p-3 resize-none focus:outline-none focus:ring-2 transition"
          style={{ border: '1px solid var(--border-default)', '--tw-ring-color': 'var(--ring)', color: 'var(--text-strong)' }}
          required
        />

        {/* Upload strip */}
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          className="flex items-center gap-3 rounded-xl px-4 py-3 transition cursor-pointer"
          style={{ backgroundColor: 'var(--surface-spark)', border: '1.5px dashed var(--border-accent)' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-accent)'}
          onClick={() => fileInputRef.current?.click()}
        >
          <input ref={fileInputRef} type="file" accept={ACCEPTED} className="sr-only"
            onChange={e => handleFile(e.target.files?.[0])} />

          {uploading ? (
            <>
              <svg className="w-5 h-5 animate-spin shrink-0" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Reading your file…</span>
            </>
          ) : uploadedFileName && !uploadError ? (
            <>
              <svg className="w-5 h-5 shrink-0" style={{ color: 'var(--status-success)' }} fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2">
                <path d="M5 10l4 4 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-sm font-medium flex-1 truncate" style={{ color: 'var(--status-success)' }}>{uploadedFileName}</span>
              <button type="button"
                onClick={e => { e.stopPropagation(); setUploadedFileName(''); setAssignment('') }}
                className="text-base shrink-0 leading-none transition"
                style={{ color: 'var(--text-subtle)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-muted)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-subtle)'}
                title="Remove">×</button>
            </>
          ) : (
            <>
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--accent-soft)' }}>
                <svg className="w-4 h-4" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Upload a photo or PDF</p>
                {uploadError
                  ? <p className="text-xs mt-0.5" style={{ color: 'var(--status-error)' }}>{uploadError}</p>
                  : <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Snap your worksheet or drop a handout — JPG, PNG, or PDF</p>
                }
              </div>
            </>
          )}
        </div>
      </div>

      {/* 2. Subject picker */}
      <div>
        <p className="text-xs font-bold uppercase mb-2" style={{ color: 'var(--text-subtle)', letterSpacing: 'var(--tracking-caps)' }}>
          Class / Subject
        </p>
        <SubjectPicker
          value={subject}
          onChange={setSubject}
          customLabel={subjectCustomLabel}
          onCustomLabelChange={setSubjectCustomLabel}
        />
      </div>

      {/* 3. Teacher invite */}
      <div>
        <p className="text-xs font-bold uppercase mb-2" style={{ color: 'var(--text-subtle)', letterSpacing: 'var(--tracking-caps)' }}>
          Teacher <span className="normal-case font-normal" style={{ letterSpacing: 0 }}>(optional)</span>
        </p>
        <input
          type="email"
          value={teacherEmail}
          onChange={e => setTeacherEmail(e.target.value)}
          placeholder="teacher@school.edu"
          className="w-full text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 transition"
          style={{ border: '1px solid var(--border-default)', '--tw-ring-color': 'var(--ring)', color: 'var(--text-strong)', backgroundColor: 'var(--bg-page-alt)' }}
        />
        <p className="text-xs mt-1.5" style={{ color: 'var(--text-subtle)' }}>
          They'll get an invite link to view this assignment.
        </p>
      </div>

      {/* 4. Coach picker */}
      <div>
        <p className="text-xs font-bold uppercase mb-3" style={{ color: 'var(--text-subtle)', letterSpacing: 'var(--tracking-caps)' }}>
          Coach for this assignment
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {PERSONAS.map(p => {
            const selected = persona === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPersona(p.id)}
                className="relative flex items-center gap-3 rounded-2xl p-3 text-left transition"
                style={{
                  border: `2px solid ${selected ? p.color : 'transparent'}`,
                  backgroundColor: selected ? 'var(--surface-card)' : 'var(--bg-page-alt)',
                  boxShadow: selected
                    ? `0 0 0 3px color-mix(in srgb, ${p.color} 18%, transparent)`
                    : 'none',
                }}
                onMouseEnter={e => { if (!selected) e.currentTarget.style.backgroundColor = 'var(--surface-muted)' }}
                onMouseLeave={e => { if (!selected) e.currentTarget.style.backgroundColor = 'var(--bg-page-alt)' }}
              >
                {p.isDefault && (
                  <span className="absolute top-1.5 right-1.5 text-[8px] font-black uppercase rounded-full px-1.5 py-0.5"
                    style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)', letterSpacing: 'var(--tracking-wide)' }}>
                    Default
                  </span>
                )}
                <PersonaAvatar personaId={p.id} size={36} />
                <div className="min-w-0">
                  <p className="font-bold leading-tight truncate"
                    style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)' }}>
                    {p.name}{p.nickname ? ` (${p.nickname})` : ''}
                  </p>
                  <span className="text-[10px] font-black uppercase flex flex-col leading-tight"
                    style={{ color: p.color, letterSpacing: 'var(--tracking-wide)' }}>
                    {p.style.split(' · ').map((word, i) => <span key={i}>{word}</span>)}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Selected coach tagline */}
        {selectedPersona?.desc && (
          <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {selectedPersona.desc}
          </p>
        )}
      </div>

      {submitError && (
        <p className="text-sm text-red-500 text-center">{submitError}</p>
      )}

      <button
        type="submit"
        disabled={loading || uploading || !assignment.trim()}
        className="w-full text-white font-bold rounded-full py-3 transition disabled:opacity-50"
        style={{ backgroundColor: 'var(--accent)' }}
      >
        {loading ? PROGRESS_MESSAGES[progressStep] : `Start writing with ${selectedPersona?.name ?? 'BrainScribe'}`}
      </button>
    </form>
  )
}
