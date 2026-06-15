// Entry point for a parent/teacher (or any account) to write their own piece with
// a coach, plus a list of what they've already written. Shown on the parent and
// teacher dashboards.
export default function YourWritingCard({ ownSessions = [] }) {
  return (
    <section className="rounded-2xl p-5"
      style={{ backgroundColor: 'var(--surface-spark)', border: '1px solid var(--border-accent)' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>Your writing</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Want to write something yourself? Same coaches, same flow.
          </p>
        </div>
        <a href="/write"
          className="text-sm font-semibold rounded-full px-4 py-2 text-white shrink-0 transition"
          style={{ backgroundColor: 'var(--accent)' }}>
          Write your own →
        </a>
      </div>

      {ownSessions.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {ownSessions.map(s => (
            <a key={s.id}
              href={s.status === 'complete' ? `/transcript/${s.id}` : `/assignment/${s.id}`}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition"
              style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)' }}>
              <span className="flex-1 truncate" style={{ color: 'var(--text-strong)' }}>
                {s.title || s.assignment_text?.slice(0, 60) || 'Untitled'}
              </span>
              <span className="text-xs shrink-0"
                style={{ color: s.status === 'complete' ? 'var(--status-success)' : 'var(--text-muted)' }}>
                {s.status === 'complete' ? 'Done' : 'In progress'}
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  )
}
