'use client'

// Entry point for a parent/teacher (or any account) to write their own piece with
// a coach, plus their own writing list. Shown on the parent and teacher dashboards.
// The list uses the SAME SessionsList component as the student/child assignments —
// In progress / Done tabs and identical cards — so a watcher's own writing reads as
// the same surface as the work they review, not a lesser sibling. The only chrome
// unique to this section is the title + "Write your own" primary action.

import SessionsList from '@/components/SessionsList'

export default function YourWritingCard({ ownSessions = [], impersonating = false }) {
  return (
    // No boxed wrapper — a plain titled list on the page bg, matching the student
    // "Your assignments" page (title + primary action + cards).
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="min-w-0">
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-strong)', margin: 0 }}>Your writing</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Want to write something yourself? Same coaches, same flow.
          </p>
        </div>
        <a href="/write"
          className="shrink-0 inline-flex items-center gap-1.5 transition hover:opacity-90"
          style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--text-on-accent)', backgroundColor: 'var(--accent)', borderRadius: 'var(--radius-pill)', padding: '10px 18px' }}>
          Write your own →
        </a>
      </div>

      {ownSessions.length > 0 && (
        // Own writing → the writer manages their own pieces (rename/delete, open the
        // live session for in-progress work). canInvite off: no teacher chip on your
        // own writing. canManage off while an admin is remoted in (view-only).
        <SessionsList
          sessions={ownSessions}
          canManage={!impersonating}
          canInvite={false}
        />
      )}
    </section>
  )
}
