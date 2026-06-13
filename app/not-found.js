// Branded 404 for unmatched routes.
export default function NotFound() {
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
        <h1 className="text-2xl font-black" style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>
          404
        </h1>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-strong)' }}>
          We couldn&apos;t find that page
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          The link may be broken or the page may have moved.
        </p>
        <a href="/dashboard"
          className="inline-block w-full rounded-2xl py-3 font-semibold text-white transition"
          style={{ backgroundColor: 'var(--accent)' }}>
          Back to dashboard
        </a>
      </div>
    </div>
  )
}
