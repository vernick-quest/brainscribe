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

// New assignment — a two-screen flow held in ONE component so the assignment draft
// carries across the screen swap (no route change). Screen 1 = "Your assignment"
// (textarea + upload + Browse Ideas). Screen 2 = "Choose your coach" (a blank
// "Meet the coach" panel on top, the 6-card grid below, an audio intro that plays
// + typewriter-reveals on tap, and an explicit "Start with [Coach]" commit).
//
// initialAssignmentText / initialFocus prefill the "revise a draft" path from the
// Head Grader (transcript → "work on this with your coach"). Both optional and land
// on Screen 1; a plain /assignment/new visit passes neither.
export default function NewSessionForm({ initialAssignmentText = '', initialFocus = '' }) {
  const [step, setStep]                         = useState('assignment') // 'assignment' | 'coach'
  const [assignment, setAssignment]             = useState(initialAssignmentText)
  const [persona, setPersona]                   = useState(null)         // no coach pre-selected
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

  // Coach-intro playback state. `revealCount` = how many characters of the current
  // coach's pickerIntro are shown (the typewriter head, driven off audio.currentTime).
  const [revealCount, setRevealCount]           = useState(0)
  const [reduceMotion, setReduceMotion]         = useState(false)

  const fileInputRef = useRef(null)
  const textareaRef  = useRef(null)
  const audioRef     = useRef(null)   // the single plain <audio> for coach intros
  const rafRef       = useRef(null)   // typewriter animation-frame id
  const introRef     = useRef('')     // current coach's intro text (for onEnded)
  const playGenRef   = useRef(0)      // bumped per tap; stale async callbacks bail out
  const router = useRouter()

  // Honour prefers-reduced-motion for the typewriter (full text shown immediately).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduceMotion(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

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

  // ── Coach-intro audio + typewriter ─────────────────────────────────────────
  // Stop playback + the typewriter timer without discarding the <audio> element.
  function stopAudio() {
    playGenRef.current++ // invalidate any in-flight play()/typewriter callbacks
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    const audio = audioRef.current
    if (audio) { try { audio.pause() } catch {} }
  }

  // Full teardown — pause, drop the source, cancel the timer. Used on unmount and
  // when leaving Screen 2 so no clip keeps buffering/playing off-screen.
  function teardownAudio() {
    stopAudio()
    const audio = audioRef.current
    if (audio) { try { audio.removeAttribute('src'); audio.load() } catch {} }
  }

  useEffect(() => () => teardownAudio(), []) // clean up on unmount

  function handleAudioEnded() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    setRevealCount(introRef.current.length) // land on the full intro
  }

  // Drive the typewriter head off the real clip position so text tracks the voice,
  // finishing ~0.3s before the audio ends (so words aren't still crawling in silence).
  function startTypewriter(text, gen) {
    const tick = () => {
      if (gen !== playGenRef.current) return // superseded by a newer tap
      const audio = audioRef.current
      if (!audio) return
      const dur = audio.duration
      if (dur && isFinite(dur) && dur > 0) {
        const finishAt = Math.max(0.1, dur - 0.3)
        const frac = Math.min(1, audio.currentTime / finishAt)
        const count = Math.round(frac * text.length)
        setRevealCount(prev => (prev === count ? prev : count))
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  // Tap a coach (or Replay). Stops any current clip, selects the coach, then plays
  // its pre-generated static clip. The tap IS the user gesture, so .play() is allowed
  // — this deliberately avoids the live-voice unlock path (no useCoachVoice/api/speak).
  function playCoach(id) {
    const p = PERSONA_DATA[id]
    if (!p) return
    const text = p.pickerIntro || ''
    stopAudio()
    const gen = ++playGenRef.current
    setPersona(id)
    introRef.current = text
    setRevealCount(reduceMotion ? text.length : 0)

    const audio = audioRef.current
    if (!audio) return
    audio.src = `/coaches/audio/${p.asset}.mp3`
    try { audio.currentTime = 0 } catch {}
    audio.load()
    // If audio can't play (blocked/missing), still reveal the full text.
    audio.play().then(() => {
      if (gen !== playGenRef.current) return // a newer tap took over
      if (!reduceMotion) startTypewriter(text, gen)
    }).catch(() => {
      if (gen !== playGenRef.current) return
      setRevealCount(text.length)
    })
  }

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

  // Screen 1 → Screen 2. Same non-empty check the submit uses; block with the inline
  // error if empty. Scroll to top on advance.
  function handleNext() {
    if (uploading) return
    if (!assignment.trim()) {
      setSubmitError('Add your assignment first — paste it, upload a photo, or browse writing ideas.')
      return
    }
    setSubmitError('')
    setStep('coach')
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }))
  }

  // Screen 2 → Screen 1. Assignment state is preserved; stop any playing clip.
  function goBack() {
    teardownAudio()
    setStep('assignment')
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }))
  }

  async function handleSubmit() {
    if (!persona || !assignment.trim() || loading || uploading) return
    teardownAudio() // stop any playing intro before we navigate away
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

  const selected = persona ? PERSONA_DATA[persona] : null
  const selColor = selected ? getCoachColor(selected.asset) : null
  const revealedIntro = selected ? (selected.pickerIntro || '').slice(0, revealCount) : ''

  return (
    <div style={{
      backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)',
      boxShadow: 'var(--shadow-md)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)',
    }}>
      {/* One plain, gesture-unlocked audio element for coach intros (static files). */}
      <audio ref={audioRef} preload="none" onEnded={handleAudioEnded} aria-hidden="true" />

      {/* ══════════════════════ SCREEN 1 — Your assignment ══════════════════════ */}
      {step === 'assignment' && (
        <>
          {/* Revision focus (from the Head Grader) — the rubric's own words, shown as
              orientation. Not editable here; it rides along as context for the coach. */}
          {initialFocus && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', marginBottom: 'var(--space-4)', borderRadius: 'var(--radius-md)', background: 'var(--surface-spark)', border: '1px solid var(--border-accent)' }}>
              <PersonaAvatar personaId={persona ?? 'owen'} size={20} />
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
            onChange={e => { setAssignment(e.target.value); if (submitError) setSubmitError(''); if (chosenForm) setChosenForm(null) }}
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

          {submitError && <p className="text-sm" style={{ color: 'var(--status-error)', marginTop: 'var(--space-4)' }}>{submitError}</p>}

          {/* Advance to the coach screen. */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 'var(--space-6)', flexWrap: 'wrap' }}>
            <button
              onClick={handleNext}
              disabled={uploading}
              className="inline-flex items-center gap-2 transition disabled:opacity-50"
              style={{
                font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--text-on-accent)',
                backgroundColor: 'var(--accent)', borderRadius: 'var(--radius-pill)', padding: '12px 22px',
                minHeight: 44, cursor: uploading ? 'not-allowed' : 'pointer',
              }}
            >
              Next: choose your coach
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </>
      )}

      {/* ══════════════════════ SCREEN 2 — Choose your coach ══════════════════════ */}
      {step === 'coach' && (
        <>
          <button onClick={goBack} type="button"
            className="inline-flex items-center gap-1.5"
            style={{ font: 'var(--type-ui)', color: 'var(--text-link)', background: 'none', border: 'none', cursor: 'pointer', minHeight: 44, marginBottom: 'var(--space-2)' }}
            aria-label="Back to your assignment">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
            Back to your assignment
          </button>

          <span style={{ font: 'var(--type-meta)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--accent-text)', display: 'block', marginBottom: 'var(--space-1)' }}>
            Step 2 · Choose your coach
          </span>
          <h2 style={{ font: 'var(--type-heading)', color: 'var(--text-strong)', margin: '0 0 var(--space-1)' }}>
            Who do you want in your corner?
          </h2>
          <p style={{ font: 'var(--type-meta)', color: 'var(--text-subtle)', margin: '0 0 var(--space-3)' }}>
            Tap a coach to hear how they work, then start when one feels right.
          </p>

          {/* Meet-the-coach panel — DEFAULT BLANK. Fills in on tap: 56px avatar, name in
              the coach's shade, and the intro that typewriter-reveals in sync with the clip. */}
          <div
            aria-live="polite"
            style={{
              minHeight: 96, display: 'flex', gap: 14, alignItems: 'flex-start',
              padding: '16px 18px', marginBottom: 'var(--space-4)', borderRadius: 'var(--radius-md)',
              background: selected ? selColor.tint : 'var(--surface-muted)',
              border: `1px solid ${selected ? selColor.base : 'var(--border-default)'}`,
            }}
          >
            {selected ? (
              <>
                <PersonaAvatar personaId={persona} size={56} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: selColor.shade }}>Meet {selected.name}</span>
                    <button type="button" onClick={() => playCoach(persona)}
                      className="inline-flex items-center gap-1 transition"
                      aria-label={`Replay ${selected.name}'s introduction`}
                      style={{ font: 'var(--type-meta)', fontWeight: 'var(--fw-semibold)', color: selColor.shade, background: 'transparent', border: `1px solid ${selColor.base}`, borderRadius: 'var(--radius-pill)', padding: '4px 12px', minHeight: 32, cursor: 'pointer' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                      Replay
                    </button>
                  </span>
                  <span style={{ font: 'var(--type-meta)', color: 'var(--text-body)', display: 'block', lineHeight: 1.55, minHeight: '1.55em' }}>
                    {revealedIntro}
                  </span>
                </span>
              </>
            ) : (
              <span style={{ font: 'var(--type-ui)', color: 'var(--text-muted)', alignSelf: 'center' }}>
                Tap a coach below to meet them.
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3" style={{ gap: 'var(--space-2)' }}>
            {PERSONAS.map(p => {
              const on = persona === p.id
              const c = getCoachColor(p.asset)
              // Selected → border `base`, bg `tint`, name/style text `shade` (never
              // `base`-on-`tint`). Unselected → neutral, coach color only on hover.
              return (
                <button key={p.id} type="button" onClick={() => playCoach(p.id)} aria-pressed={on}
                  aria-label={`Meet ${p.name}`}
                  className="text-left transition"
                  onMouseEnter={e => { if (!on) e.currentTarget.style.borderColor = c.base }}
                  onMouseLeave={e => { if (!on) e.currentTarget.style.borderColor = 'var(--border-default)' }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', cursor: 'pointer',
                    borderRadius: 'var(--radius-md)', minHeight: 44,
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

          {submitError && <p className="text-sm text-center" style={{ color: 'var(--status-error)', marginTop: 'var(--space-4)' }}>{submitError}</p>}

          {/* Commit — only enabled once a coach is tapped. Runs the existing submit. */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 'var(--space-6)', flexWrap: 'wrap' }}>
            <button
              onClick={handleSubmit}
              disabled={!persona || loading || uploading}
              className="inline-flex items-center gap-2 transition disabled:opacity-50"
              style={{
                font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--text-on-accent)',
                backgroundColor: 'var(--accent)', borderRadius: 'var(--radius-pill)', padding: '12px 22px',
                minHeight: 44, cursor: persona && !loading && !uploading ? 'pointer' : 'not-allowed',
              }}
            >
              {loading ? PROGRESS_MESSAGES[progressStep] : selected ? `Start with ${selected.name}` : 'Pick a coach to start'}
              {!loading && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              )}
            </button>
          </div>
        </>
      )}

      <WritingFormChooser
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
        onSelect={handleFormSample}
      />
    </div>
  )
}
