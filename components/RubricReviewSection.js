'use client'

import { useState, useRef } from 'react'
import Icon from '@/components/Icon'

// ─────────────────────────────────────────────────────────────
// RubricReviewSection — the "Head Grader" surface on a finished transcript.
//
// Rendered ONLY for the student owner of a COMPLETE session (the parent decides
// that; this component assumes it). It OBSERVES: it shows, per rubric criterion,
// what the rubric asks vs what the essay shows — with verbatim quotes — and
// routes every gap to the guardrailed coach. There is deliberately NO overall
// grade, score, or suggestion anywhere in this UI.
//
// States: quiet "Have a rubric?" affordance → attach (paste / photo·PDF) →
// "Check my work" → leveled ladder / checklist cards → error / unreadable.
// ─────────────────────────────────────────────────────────────

const ACCEPTED = '.jpg,.jpeg,.png,.webp,.gif,.pdf'
const MAX_MB = 5

// Neutral, observational status language — never grade-like. "Addressed" is
// about the criterion being present in the draft, not a mark earned.
const STATUS_LABEL = {
  met:       { text: 'Addressed',            bg: 'var(--status-success-bg)', fg: 'var(--status-success)' },
  partial:   { text: 'Partly addressed',     bg: 'var(--status-thin-bg)',    fg: 'var(--status-thin)' },
  not_found: { text: 'Not found in draft',   bg: 'var(--surface-muted)',     fg: 'var(--text-muted)' },
  unclear:   { text: 'Couldn’t verify',      bg: 'var(--surface-muted)',     fg: 'var(--text-muted)' },
}

// Re-encode phone photos through a canvas so EXIF rotation is baked into pixels
// and large images fit under the cap (same approach as NewSessionForm).
async function normalizeImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file
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
  } catch { return file }
}

export default function RubricReviewSection({
  sessionId,
  initialRubricAttached = false,
  initialReview = null,
}) {
  const [rubricAttached, setRubricAttached] = useState(initialRubricAttached)
  const [review, setReview]                 = useState(initialReview)
  const [open, setOpen]                     = useState(false)       // attach panel expanded?
  const [mode, setMode]                     = useState('paste')     // 'paste' | 'upload'
  const [rubricText, setRubricText]         = useState('')
  const [attaching, setAttaching]           = useState(false)
  const [attachError, setAttachError]       = useState('')
  const [uploadName, setUploadName]         = useState('')
  const [reviewing, setReviewing]           = useState(false)
  const [reviewError, setReviewError]       = useState('')
  const fileInputRef = useRef(null)

  async function attachPaste() {
    if (!rubricText.trim() || attaching) return
    setAttaching(true); setAttachError('')
    try {
      const res = await fetch(`/api/sessions/${sessionId}/rubric`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rubricText }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) { setAttachError(json.error ?? 'Could not save the rubric.'); return }
      setRubricAttached(true); setReview(null); setOpen(false); setRubricText('')
    } catch { setAttachError('Network error — please try again.') }
    finally { setAttaching(false) }
  }

  async function attachFile(file) {
    if (!file || attaching) return
    setAttaching(true); setAttachError(''); setUploadName(file.name)
    try {
      const upload = await normalizeImage(file)
      if (upload.size > MAX_MB * 1024 * 1024) { setAttachError(`File too large — max ${MAX_MB} MB.`); setUploadName(''); return }
      const form = new FormData()
      form.append('file', upload, file.name)
      const res = await fetch(`/api/sessions/${sessionId}/rubric`, { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok || !json.ok) { setAttachError(json.error ?? 'Could not read that file.'); setUploadName(''); return }
      setRubricAttached(true); setReview(null); setOpen(false); setUploadName('')
    } catch { setAttachError('Upload failed — please try again.'); setUploadName('') }
    finally { setAttaching(false) }
  }

  async function runReview() {
    if (reviewing) return
    setReviewing(true); setReviewError('')
    try {
      const res = await fetch(`/api/sessions/${sessionId}/review`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.review) { setReviewError(json.error ?? 'Could not check your work right now.'); return }
      setReview(json.review)
    } catch { setReviewError('Network error — please try again.') }
    finally { setReviewing(false) }
  }

  const cardStyle = {
    backgroundColor: 'var(--surface-card)', boxShadow: 'var(--shadow-sm)',
    border: '1px solid var(--border-default)', borderRadius: '16px',
  }

  return (
    <section className="no-print space-y-4 p-6" style={cardStyle}>
      {/* Header — quiet, observational framing */}
      <div className="flex items-center gap-2.5">
        <Icon name="clipboard" size={18} style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          Check against a rubric
        </h2>
      </div>

      {/* ── No rubric yet: the quiet affordance ── */}
      {!rubricAttached && !open && (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>
            Have the rubric for this assignment? Add it and we’ll show you, point by point, how your
            finished draft lines up with what your teacher is looking for.
          </p>
          <button
            type="button"
            onClick={() => { setOpen(true); setAttachError('') }}
            className="self-start inline-flex items-center gap-2 text-sm font-semibold rounded-full px-4 py-2 transition"
            style={{ color: 'var(--text-body)', border: '1px solid var(--border-strong)' }}
          >
            <Icon name="clipboard" size={15} />
            Add a rubric
          </button>
        </div>
      )}

      {/* ── Attach panel: paste or upload ── */}
      {!rubricAttached && open && (
        <div className="space-y-3">
          <div className="flex gap-2" role="tablist" aria-label="How to add your rubric">
            {['paste', 'upload'].map(m => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => { setMode(m); setAttachError('') }}
                className="text-xs font-semibold rounded-full px-3 py-1.5 transition"
                style={mode === m
                  ? { backgroundColor: 'var(--primary-soft)', color: 'var(--text-strong)' }
                  : { color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}
              >
                {m === 'paste' ? 'Paste text' : 'Photo or PDF'}
              </button>
            ))}
          </div>

          {mode === 'paste' ? (
            <textarea
              value={rubricText}
              onChange={e => setRubricText(e.target.value)}
              placeholder="Paste the rubric your teacher gave you…"
              rows={5}
              className="w-full resize-none focus:outline-none focus:ring-2 transition text-sm"
              style={{ border: '1px solid var(--border-default)', borderRadius: '10px', padding: '12px 14px', '--tw-ring-color': 'var(--ring)', color: 'var(--text-strong)' }}
            />
          ) : (
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload a photo or PDF of your rubric"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) attachFile(f) }}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
              className="flex items-center gap-3 cursor-pointer transition"
              style={{ padding: '14px 16px', borderRadius: '10px', background: 'var(--surface-muted)', border: '1.5px dashed var(--border-strong)' }}
            >
              <input ref={fileInputRef} type="file" accept={ACCEPTED} className="sr-only" onChange={e => attachFile(e.target.files?.[0])} />
              {attaching && uploadName ? (
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Reading {uploadName}…</span>
              ) : (
                <>
                  <Icon name="doc" size={18} style={{ color: 'var(--text-muted)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Tap to upload a photo or PDF of the rubric</span>
                </>
              )}
            </div>
          )}

          {attachError && (
            <p className="text-xs" style={{ color: 'var(--status-error)' }}>{attachError}</p>
          )}

          <div className="flex items-center gap-3">
            {mode === 'paste' && (
              <button
                type="button"
                onClick={attachPaste}
                disabled={!rubricText.trim() || attaching}
                className="inline-flex items-center gap-2 text-sm font-bold rounded-full px-4 py-2 text-white transition disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {attaching ? 'Saving…' : 'Save rubric'}
              </button>
            )}
            <button
              type="button"
              onClick={() => { setOpen(false); setAttachError('') }}
              className="text-sm font-semibold px-2 py-2"
              style={{ color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Rubric attached, no review yet: the CTA ── */}
      {rubricAttached && !review && (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>
            Your rubric is attached. Run a check to see how your draft lines up — point by point, in your
            teacher’s own words.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={runReview}
              disabled={reviewing}
              className="inline-flex items-center gap-2 text-sm font-bold rounded-full px-5 py-2.5 text-white transition disabled:opacity-60"
              style={{ backgroundColor: 'var(--accent)', boxShadow: 'var(--shadow-spark)' }}
            >
              <Icon name="check" size={16} />
              {reviewing ? 'Checking your work…' : 'Check my work'}
            </button>
            <button
              type="button"
              onClick={() => { setRubricAttached(false); setOpen(true) }}
              className="text-sm font-semibold px-2 py-2"
              style={{ color: 'var(--text-muted)' }}
            >
              Replace rubric
            </button>
          </div>
          {reviewError && <p className="text-xs" style={{ color: 'var(--status-error)' }}>{reviewError}</p>}
        </div>
      )}

      {/* ── Review results ── */}
      {review && (
        <ReviewResults
          review={review}
          sessionId={sessionId}
          reviewing={reviewing}
          onRerun={runReview}
          onReplace={() => { setReview(null); setRubricAttached(false); setOpen(true) }}
          reviewError={reviewError}
        />
      )}
    </section>
  )
}

function ReviewResults({ review, sessionId, reviewing, onRerun, onReplace, reviewError }) {
  // The rubric couldn't be read as a rubric — honest, non-blaming state.
  if (!review.rubric_readable) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2.5 rounded-xl p-3" style={{ backgroundColor: 'var(--surface-muted)' }}>
          <Icon name="alert" size={16} style={{ color: 'var(--text-muted)', marginTop: 2 }} />
          <p className="text-sm leading-snug" style={{ color: 'var(--text-body)' }}>
            That didn’t look like a grading rubric, so there’s nothing to check against yet. Try adding the
            actual rubric — the sheet with the criteria your teacher grades on.
          </p>
        </div>
        <button type="button" onClick={onReplace} className="text-sm font-semibold" style={{ color: 'var(--text-link)' }}>
          Add a different rubric
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {review.overall_note && (
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{review.overall_note}</p>
      )}

      <div className="space-y-3">
        {review.criteria.map((c, i) => (
          <CriterionCard key={i} c={c} index={i} sessionId={sessionId} />
        ))}
      </div>

      {/* One shared, low-key route to the coach — improvement happens there. */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <a
          href={`/assignment/new?revise=${sessionId}`}
          className="inline-flex items-center gap-2 text-sm font-bold rounded-full px-4 py-2 transition"
          style={{ color: 'var(--accent-text)', border: '1.5px solid var(--border-accent)' }}
        >
          <Icon name="pencil" size={15} />
          Work on this with your coach
        </a>
        <button
          type="button"
          onClick={onRerun}
          disabled={reviewing}
          className="text-sm font-semibold px-2 py-2 disabled:opacity-60"
          style={{ color: 'var(--text-muted)' }}
        >
          {reviewing ? 'Re-checking…' : 'Re-check'}
        </button>
        <button type="button" onClick={onReplace} className="text-sm font-semibold px-2 py-2" style={{ color: 'var(--text-muted)' }}>
          Replace rubric
        </button>
      </div>
      {reviewError && <p className="text-xs" style={{ color: 'var(--status-error)' }}>{reviewError}</p>}

      <p className="text-xs leading-snug pt-1" style={{ color: 'var(--text-subtle)' }}>
        This is a read-through against your teacher’s rubric — not a grade. Only you can see it.
      </p>
    </div>
  )
}

function CriterionCard({ c, index, sessionId }) {
  const status = STATUS_LABEL[c.status] ?? STATUS_LABEL.unclear
  // A gap to route to the coach exists when there's a named next level, or when
  // a checklist item isn't fully addressed.
  const hasGap = c.leveled
    ? !!(c.next_level_up?.name || c.next_level_up?.descriptor_quote)
    : c.status === 'partial' || c.status === 'not_found'

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-default)' }}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold leading-snug" style={{ color: 'var(--text-strong)' }}>{c.criterion}</p>
        <span className="text-[11px] font-semibold rounded-full px-2.5 py-0.5 shrink-0" style={{ backgroundColor: status.bg, color: status.fg }}>
          {status.text}
        </span>
      </div>

      {/* Leveled: the "where you are / next level up" ladder, both quoted from the rubric */}
      {c.leveled && (c.matched_level?.descriptor_quote || c.next_level_up?.descriptor_quote) && (
        <div className="space-y-2">
          {c.matched_level?.descriptor_quote && (
            <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)' }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                Where your draft is{c.matched_level.name ? ` · ${c.matched_level.name}` : ''}
              </p>
              <p className="text-sm leading-snug" style={{ color: 'var(--text-body)' }}>“{c.matched_level.descriptor_quote}”</p>
            </div>
          )}
          {c.next_level_up?.descriptor_quote && (
            <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--surface-spark)', border: '1px solid var(--border-accent)' }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--accent-text)' }}>
                Next level up{c.next_level_up.name ? ` · ${c.next_level_up.name}` : ''}
              </p>
              <p className="text-sm leading-snug" style={{ color: 'var(--text-body)' }}>“{c.next_level_up.descriptor_quote}”</p>
            </div>
          )}
        </div>
      )}

      {/* Evidence — verbatim from the student's own draft */}
      {c.evidence_quote && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
            In your draft{c.location ? ` · ${c.location}` : ''}
          </p>
          <p className="text-sm leading-snug pl-3" style={{ color: 'var(--text-body)', borderLeft: '2px solid var(--border-strong)' }}>
            “{c.evidence_quote}”
          </p>
        </div>
      )}

      {/* Gap note — the delta in the rubric's terms (never how-to). Blanked by the
          validator if it ever reads as advice. */}
      {c.gap_note && (
        <p className="text-sm leading-snug" style={{ color: 'var(--text-muted)' }}>{c.gap_note}</p>
      )}

      {hasGap && (
        <a
          href={`/assignment/new?revise=${sessionId}&gap=${index}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold transition"
          style={{ color: 'var(--accent-text)' }}
        >
          Work on this with your coach
          <span aria-hidden="true">→</span>
        </a>
      )}
    </div>
  )
}
