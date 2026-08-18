'use client'

import { useState, useEffect } from 'react'
import { growthSummary } from '@/lib/startingDraft'

// The starting draft, beside the working draft. See SPEC-starting-draft.md.
//
// ── Why this is watcher-facing, and why it says what it says ─────────────────────────
// Declaring a starting draft does not verify authorship — a student could paste someone
// else's essay and every later lock would score clean against it. The spec's answer is
// TRANSPARENCY, NOT DETECTION: a parent who can see "arrived with 800 words, added 40",
// with the timestamp and the label, needs no detector. So this component's obligations are
// blunt ones — never present the starting draft as coached work, never fold it into the
// Final Draft, and never state the growth number as total output.
//
// It is also collapsed by default. A student mid-session should see their working draft,
// not a wall of what they already had; and for a watcher the SUMMARY is the artifact —
// the full text is there to expand, not to dominate the page.
export default function StartingDraftCard({
  startingDraft,          // { content, word_count, source, created_at } | null
  draftWords = 0,         // from computeActualFromDraft — never recomputed here
  readState = 'absent',   // 'present' | 'absent' | 'no-table' | 'unknown'
  audience = 'student',   // 'student' | 'watcher'
}) {
  const [expanded, setExpanded] = useState(false)
  // Rendered on the client only. `toLocaleDateString`/`toLocaleString` resolve against the
  // RUNTIME locale and timezone: Vercel renders UTC, the browser renders local, so an
  // Aug-17 draft server-rendered as "Aug 18" both hydration-mismatches and shows a Pacific
  // reader the wrong day. Deferring to an effect means the server emits nothing to
  // mismatch, and the date the student sees is their own.
  const [dateLabel, setDateLabel] = useState(null)

  const { arrivedWith, addedWords, headline, hasStartingDraft } = growthSummary({
    startingWordCount: startingDraft?.word_count,
    draftWords,
  })

  useEffect(() => {
    const t = startingDraft?.created_at ? new Date(startingDraft.created_at) : null
    // `new Date('garbage').toLocaleDateString()` returns the STRING "Invalid Date", which
    // is truthy — so a truthiness guard renders "Pasted in Invalid Date." to a parent.
    setDateLabel(t && !Number.isNaN(t.getTime())
      ? t.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : null)
  }, [startingDraft?.created_at])

  // A read we could not complete is NOT the same as no starting draft, and silently
  // rendering nothing is the reassuring-direction failure: it drops the "arrived with"
  // half, so a watcher reads the whole working draft as new writing. Say what happened.
  if (readState === 'unknown') {
    return (
      <div className="rounded-xl px-4 py-3" style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-muted)' }}>
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          Starting draft
        </span>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          We couldn&rsquo;t load what {audience === 'watcher' ? 'they' : 'you'} started with just now, so the
          comparison below is incomplete. Nothing has been lost — try reloading.
        </p>
      </div>
    )
  }

  // Gate on the SUMMARY, not on content alone. If word_count is null, 0, or unreadable the
  // artifact is the only thing this card is for, and rendering "Arrived with 0 words" above
  // 800 words of visible text is worse than rendering nothing.
  if (!startingDraft?.content || !hasStartingDraft) return null

  // ⚠️ There WAS an overlap notice here — "N% of the new writing also appears in the
  // starting draft" — and it is deleted rather than tuned. draftOverlapFraction is a
  // stemmed, stopword-stripped bag-of-words fraction: it measures shared VOCABULARY, not
  // re-pasting. Measured on genuinely new prose continuing the same story: 46%. So the
  // notice fired hardest in the feature's intended use case — a student continuing their
  // own piece with the coach — and told their parent the words were "brought forward
  // rather than newly written". That is an uncalibrated accusation, watcher-facing,
  // asserting a cause the measurement cannot support. This card's principle is
  // TRANSPARENCY, NOT DETECTION; I had built a detector and put it in front of a parent.

  const sourceLabel = { typed: 'typed in', pasted: 'pasted in', upload: 'uploaded' }[startingDraft.source] ?? 'brought in'

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-muted)' }}>
      <div className="px-4 pt-3 pb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          Starting draft
        </span>
        {/* Marked plainly, in the spec's own words. This label is the defence. */}
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          {audience === 'watcher'
            ? 'What they had before working with the coach.'
            : 'What you had before you started working with your coach. It stays exactly as you brought it.'}
          {dateLabel && ` ${sourceLabel[0].toUpperCase()}${sourceLabel.slice(1)} ${dateLabel}.`}
        </p>
      </div>

      {/* The growth artifact. Stated as growth, never as total output. */}
      <div className="px-4 pb-3">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-body)' }}>
          {headline}
          <span className="font-normal" style={{ color: 'var(--text-muted)' }}>
            {' '}word{addedWords === 1 ? '' : 's'} with the coach
          </span>
        </p>
      </div>

      <div className="px-4 pb-3">
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-xs font-semibold hover:underline"
          style={{ color: 'var(--accent-text)', minHeight: 44 }}
          aria-expanded={expanded}
        >
          {expanded ? 'Hide what they started with' : `Read the starting draft (${arrivedWith.toLocaleString('en-US')} words)`}
        </button>
        {/* Scrolls inside itself. In the live session this card sits in a `shrink-0`
            wrapper above the student's own working draft, so an unbounded 1,200-word
            block — the NORMAL case for someone who arrived with a draft — pushed their
            working draft to near-zero height. */}
        {expanded && (
          <p className="text-sm leading-relaxed whitespace-pre-line mt-2 rounded-lg px-3 py-2 overflow-y-auto"
            style={{ color: 'var(--text-body)', backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', maxHeight: '40vh' }}>
            {startingDraft.content}
          </p>
        )}
      </div>
    </div>
  )
}
