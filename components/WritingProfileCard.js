'use client'

import Icon from '@/components/Icon'

// ─────────────────────────────────────────────────────────────
// WritingProfileCard
// Renders the writing_profile JSONB from a completed session.
// Shows: summary, strengths, growth areas, voice, vocabulary, patterns.
// ─────────────────────────────────────────────────────────────

function PillList({ items, color, bg }) {
  if (!items?.length) return null
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm leading-snug">
          <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
            style={{ backgroundColor: bg, color }}>
            ✓
          </span>
          <span style={{ color: 'var(--text-body)' }}>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function GrowthList({ items }) {
  if (!items?.length) return null
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm leading-snug">
          <span className="mt-0.5 shrink-0 text-base leading-none">→</span>
          <span style={{ color: 'var(--text-body)' }}>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export default function WritingProfileCard({ profile, sessionComplete, studentName }) {
  // Session not complete yet
  if (!sessionComplete) {
    return (
      <div className="rounded-xl p-8 flex flex-col items-center text-center space-y-3"
        style={{ border: '1.5px dashed var(--border-strong)' }}>
        <Icon name="doc" size={32} style={{ color: 'var(--text-subtle)' }} />
        <p className="font-semibold" style={{ color: 'var(--text-strong)' }}>
          {studentName ? `${studentName}'s Writing Profile` : 'Writing Profile'}
        </p>
        <p className="text-sm max-w-xs" style={{ color: 'var(--text-muted)' }}>
          Complete the assignment to unlock a personalized writing analysis.
        </p>
      </div>
    )
  }

  // Session complete but analysis still running (takes a few seconds after completion)
  if (!profile) {
    return (
      <div className="rounded-xl p-8 flex flex-col items-center text-center space-y-3"
        style={{ border: '1.5px dashed var(--border-accent)' }}>
        <Icon name="search" size={32} className="animate-pulse" style={{ color: 'var(--accent)' }} />
        <p className="font-semibold" style={{ color: 'var(--text-strong)' }}>
          Generating writing profile…
        </p>
        <p className="text-sm max-w-xs" style={{ color: 'var(--text-muted)' }}>
          BrainScribe is analysing the essay. Refresh in a moment.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* Summary */}
      {profile.summary && (
        <div className="rounded-xl px-5 py-4 space-y-1"
          style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-default)' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-subtle)' }}>
            Overview
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>{profile.summary}</p>
        </div>
      )}

      {/* Meta row: voice + vocabulary. vocabulary is either a legacy string
          (older sessions) or the structured { descriptor, highlights[], reach }
          object — render both shapes gracefully. */}
      {(() => {
        const vocab = profile.vocabulary
        const vocabLabel = typeof vocab === 'string' ? vocab : vocab?.descriptor
        const highlights = (vocab && typeof vocab === 'object' && Array.isArray(vocab.highlights)) ? vocab.highlights : []
        const reach = (vocab && typeof vocab === 'object') ? vocab.reach : null
        if (!profile.voice && !vocabLabel && highlights.length === 0 && !reach) return null
        return (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {profile.voice && (
                <span className="text-xs font-semibold rounded-full px-3 py-1.5 inline-flex items-center gap-1.5"
                  style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  <Icon name="pencil" size={12} /> {profile.voice}
                </span>
              )}
              {vocabLabel && (
                <span className="text-xs font-semibold rounded-full px-3 py-1.5 inline-flex items-center gap-1.5"
                  style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}>
                  <Icon name="book" size={12} /> Vocab: {vocabLabel}
                </span>
              )}
              {highlights.map((w, i) => (
                <span key={i} className="text-xs font-semibold rounded-full px-2.5 py-1.5 inline-flex items-center"
                  style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-body)', border: '1px solid var(--border-default)' }}>
                  “{w}”
                </span>
              ))}
            </div>
            {reach && (
              <p className="text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
                <span className="font-semibold">Reach:</span> {reach}
              </p>
            )}
          </div>
        )
      })()}

      {/* Two-col: strengths + growth areas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Strengths */}
        {profile.strengths?.length > 0 && (
          <div className="rounded-xl p-4 space-y-3"
            style={{ backgroundColor: 'var(--status-success-bg)', border: '1px solid var(--status-success)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--status-success)' }}>
              Strengths
            </p>
            <PillList
              items={profile.strengths}
              color="var(--status-success)"
              bg="rgba(34,197,94,0.15)"
            />
          </div>
        )}

        {/* Growth areas */}
        {profile.growth_areas?.length > 0 && (
          <div className="rounded-xl p-4 space-y-3"
            style={{ backgroundColor: 'var(--accent-soft)', border: '1px solid var(--border-accent)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
              To work on next time
            </p>
            <GrowthList items={profile.growth_areas} />
          </div>
        )}
      </div>

      {/* Patterns */}
      {profile.patterns?.length > 0 && (
        <div className="rounded-xl px-5 py-4 space-y-2"
          style={{ border: '1px solid var(--border-default)' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-subtle)' }}>
            Patterns noticed
          </p>
          <ul className="space-y-1">
            {profile.patterns.map((p, i) => (
              <li key={i} className="text-sm flex items-start gap-2" style={{ color: 'var(--text-body)' }}>
                <span style={{ color: 'var(--text-subtle)' }}>·</span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  )
}
