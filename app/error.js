'use client'

// Branded error boundary for the app. Catches render/runtime errors in route
// segments and shows a recoverable screen instead of Next's raw error page.
export default function Error({ error, reset }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center"
      style={{ backgroundColor: 'var(--bg-page)', minHeight: '100vh' }}>
      <img src="/brainscribe-logo.png" alt="BrainScribe"
        style={{ width: 220, maxWidth: '70%', height: 'auto', marginBottom: '2rem' }} />

      <div className="w-full p-8 space-y-4" style={{
        maxWidth: '26rem',
        backgroundColor: 'var(--surface-card)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)',
      }}>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
          Something went sideways
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          That wasn&apos;t supposed to happen. Your work is saved — try again, and if it keeps happening, head back to your dashboard.
        </p>
        <div className="flex flex-col gap-2 pt-1">
          <button onClick={() => reset()}
            className="w-full rounded-2xl py-3 font-semibold text-white transition"
            style={{ backgroundColor: 'var(--accent)' }}>
            Try again
          </button>
          <a href="/folder"
            className="w-full rounded-2xl py-3 font-semibold transition"
            style={{ border: '1.5px solid var(--border-strong)', color: 'var(--text-body)' }}>
            Back to dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
