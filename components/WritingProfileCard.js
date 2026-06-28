'use client'

import Icon from '@/components/Icon'

// ─────────────────────────────────────────────────────────────
// WritingProfileCard
// Renders the cross-assignment aggregate from profiles.writing_profile_aggregate.
// Shape: { summary, strengths[], growth_areas[], voice,
//          vocabulary{descriptor, highlights[], reach}, patterns[],
//          trajectory, milestones[], based_on_count, updated_at }
// `vocabulary` may also be a legacy string (per-session profiles) — handled.
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

// Word choice — descriptor + the student's actual standout words + a stretch nudge.
// Replaces the old grade-level vocabulary pill (grade level was never the intent).
function WordChoice({ vocabulary }) {
  if (!vocabulary) return null

  // Legacy per-session shape: a plain string. Render it as the descriptor only.
  const vocab = typeof vocabulary === 'string'
    ? { descriptor: vocabulary }
    : vocabulary

  const { descriptor, highlights, reach } = vocab
  if (!descriptor && !highlights?.length && !reach) return null

  return (
    <div className="rounded-xl px-5 py-4 space-y-3"
      style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-default)' }}>
      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-subtle)' }}>
        Word choice
      </p>

      {descriptor && (
        <p className="text-sm font-semibold inline-flex items-center gap-1.5" style={{ color: 'var(--text-strong)' }}>
          <Icon name="book" size={13} style={{ color: 'var(--text-muted)' }} /> {descriptor}
        </p>
      )}

      {highlights?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {highlights.map((word, i) => (
            <span key={i} className="text-xs font-medium rounded-full px-2.5 py-1"
              style={{ backgroundColor: 'var(--navy-100)', color: 'var(--navy-700)' }}>
              {word}
            </span>
          ))}
        </div>
      )}

      {reach && (
        <p className="text-sm leading-snug flex items-start gap-2" style={{ color: 'var(--text-body)' }}>
          <span className="mt-0.5 shrink-0 text-base leading-none" style={{ color: 'var(--text-subtle)' }}>→</span>
          <span>{reach}</span>
        </p>
      )}
    </div>
  )
}

export default function WritingProfileCard({ profile, sessionComplete, studentName }) {
  // No completed assignments yet
  if (!sessionComplete) {
    return (
      <div className="rounded-xl p-8 flex flex-col items-center text-center space-y-3"
        style={{ border: '1.5px dashed var(--border-strong)' }}>
        <Icon name="doc" size={32} style={{ color: 'var(--text-subtle)' }} />
        <p className="font-semibold" style={{ color: 'var(--text-strong)' }}>
          {studentName ? `${studentName}'s Writing Profile` : 'Writing Profile'}
        </p>
        <p className="text-sm max-w-xs" style={{ color: 'var(--text-muted)' }}>
          Finish an assignment to unlock a writing profile that grows with every piece.
        </p>
      </div>
    )
  }

  // Assignment(s) complete but the aggregate hasn't been synthesized yet
  // (it's generated a few seconds after a session completes).
  if (!profile) {
    return (
      <div className="rounded-xl p-8 flex flex-col items-center text-center space-y-3"
        style={{ border: '1.5px dashed var(--border-accent)' }}>
        <Icon name="search" size={32} className="animate-pulse" style={{ color: 'var(--accent)' }} />
        <p className="font-semibold" style={{ color: 'var(--text-strong)' }}>
          Building writing profile…
        </p>
        <p className="text-sm max-w-xs" style={{ color: 'var(--text-muted)' }}>
          BrainScribe is pulling together what it&apos;s noticed across your writing. Refresh in a moment.
        </p>
      </div>
    )
  }

  const count = profile.based_on_count ?? 0

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

      {/* Trajectory — how the writing is changing across assignments (aggregate-only) */}
      {profile.trajectory && (
        <div className="rounded-xl px-5 py-4 flex items-start gap-3"
          style={{ backgroundColor: 'var(--navy-50, var(--surface-muted))', border: '1px solid var(--border-default)' }}>
          <Icon name="trending" size={18} style={{ color: 'var(--navy-700)', marginTop: 2 }} />
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-subtle)' }}>
              Where your writing is heading
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>{profile.trajectory}</p>
          </div>
        </div>
      )}

      {/* Voice */}
      {profile.voice && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold rounded-full px-3 py-1.5 inline-flex items-center gap-1.5"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
            <Icon name="pencil" size={12} /> {profile.voice}
          </span>
        </div>
      )}

      {/* Word choice (descriptor + the student's actual words + a stretch nudge) */}
      <WordChoice vocabulary={profile.vocabulary} />

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
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent-text)' }}>
              To work on next time
            </p>
            <GrowthList items={profile.growth_areas} />
          </div>
        )}
      </div>

      {/* Milestones — progress wins across assignments (aggregate-only) */}
      {profile.milestones?.length > 0 && (
        <div className="rounded-xl px-5 py-4 space-y-3"
          style={{ backgroundColor: 'var(--navy-50, var(--surface-muted))', border: '1px solid var(--navy-100)' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--navy-700)' }}>
            How you&apos;ve grown
          </p>
          <ul className="flex flex-col gap-1.5">
            {profile.milestones.map((m, i) => (
              <li key={i} className="flex items-start gap-2 text-sm leading-snug">
                <span className="mt-0.5 shrink-0 text-base leading-none" style={{ color: 'var(--navy-700)' }}>↗</span>
                <span style={{ color: 'var(--text-body)' }}>{m}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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

      {/* Provenance — make the cross-assignment nature explicit */}
      {count > 0 && (
        <p className="text-xs text-center pt-1" style={{ color: 'var(--text-subtle)' }}>
          Synthesized from {count} {count === 1 ? 'assignment' : 'assignments'}
        </p>
      )}

    </div>
  )
}
