const { Card, Badge, Avatar, Button } = window.BrainScribeDesignSystem_eceaf4

function TranscriptScreen({ tutor, onHome }) {
  const script = window.BS_SCRIPT
  const [showRaw, setShowRaw] = React.useState(true)
  const paragraphs = script.map(s => ({ text: s.scribed, raw: s.raw, isThin: s.isThin }))

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-page)' }}>
      {window.AppHeader({
        tutor: null, onHome, user: 'Mr. Lee',
        right: (
          <span style={{ font: 'var(--type-meta)', fontWeight: 'var(--fw-bold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--navy-600)', background: 'var(--navy-100)', padding: '4px 10px', borderRadius: 'var(--radius-pill)' }}>
            Teacher
          </span>
        ),
      })}

      <div style={{ maxWidth: 'var(--width-prose)', margin: '0 auto', padding: 'var(--space-8) var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'var(--space-3)' }}>
          <Badge tone="navy">Teacher transcript</Badge>
          <Badge tone="success" dot>Complete</Badge>
        </div>
        <h1 style={{ font: 'var(--type-title)', color: 'var(--text-strong)', margin: '0 0 6px' }}>Maya R. · "The Outsiders" essay</h1>
        <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)', margin: '0 0 var(--space-7)' }}>
          Worked with {tutor ? tutor.name : 'Sage'} · June 6, 2026 · 3 paragraphs
        </p>

        <Card style={{ marginBottom: 'var(--space-5)' }}>
          <h2 style={{ font: 'var(--type-subhead)', color: 'var(--text-strong)', margin: '0 0 var(--space-3)' }}>Assignment</h2>
          <p style={{ font: 'var(--type-body)', color: 'var(--text-body)', margin: 0 }}>{window.BS_ASSIGNMENT}</p>
        </Card>

        <Card style={{ marginBottom: 'var(--space-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
            <h2 style={{ font: 'var(--type-subhead)', color: 'var(--text-strong)', margin: 0 }}>Final essay & process</h2>
            <label style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={showRaw} onChange={e => setShowRaw(e.target.checked)} />
              Show what the student said
            </label>
          </div>
          {paragraphs.map((p, i) => (
            <div key={i} style={{ marginBottom: 'var(--space-5)' }}>
              <p style={{ font: 'var(--type-lead)', color: 'var(--text-body)', margin: '0 0 6px' }}>
                {p.text}
                {p.isThin && <span style={{ font: 'var(--type-meta)', color: 'var(--amber-500)', fontStyle: 'italic', marginLeft: 8 }}>(student was building on this)</span>}
              </p>
              {showRaw && (
                <p style={{ font: 'var(--type-meta)', fontFamily: 'var(--font-mono)', color: 'var(--ink-600)', background: 'var(--cream-200)', borderLeft: '3px solid var(--border-accent)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', margin: 0, lineHeight: 'var(--leading-relaxed)' }}>
                  “{p.raw}”
                </p>
              )}
            </div>
          ))}
        </Card>

        <Card variant="muted">
          <h2 style={{ font: 'var(--type-subhead)', color: 'var(--text-strong)', margin: '0 0 var(--space-4)' }}>Coaching dialogue</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {script.map((s, i) => (
              <div key={i}>
                <p style={{ font: 'var(--type-body)', color: 'var(--navy-700)', margin: '0 0 2px' }}>
                  <strong style={{ fontWeight: 'var(--fw-bold)' }}>{tutor ? tutor.name : 'Sage'}:</strong> {s.tutor}
                </p>
                <p style={{ font: 'var(--type-body)', color: 'var(--ink-700)', margin: '0 0 var(--space-3)' }}>
                  <strong style={{ fontWeight: 'var(--fw-bold)' }}>Maya:</strong> {s.raw}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
window.TranscriptScreen = TranscriptScreen
