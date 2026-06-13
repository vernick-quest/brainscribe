const { Card, Button, Input, Badge } = window.BrainScribeDesignSystem_eceaf4

const BS_PAST = [
  { title: 'Persuasive essay: should phones be allowed in class?', when: 'Yesterday', status: 'complete' },
  { title: 'Analysis of the green light symbol in The Great Gatsby', when: '3 days ago', status: 'complete' },
  { title: 'Personal narrative: a time I surprised myself', when: 'Last week', status: 'draft' },
]

function DashboardScreen({ tutor, onStart, onHome }) {
  const [assignment, setAssignment] = React.useState('')
  const [file, setFile] = React.useState(null)   // {name, kind}
  const [dragging, setDragging] = React.useState(false)
  const inputRef = React.useRef(null)

  function pickFile(f) {
    if (!f) return
    const isPdf = /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)
    setFile({ name: f.name, kind: isPdf ? 'PDF' : 'Image' })
    setAssignment(a => a || `Assignment uploaded: ${f.name}`)
  }
  const canStart = !!assignment.trim() || !!file

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-page)' }}>
      {window.AppHeader({ tutor, onHome })}

      <div style={{ maxWidth: 'var(--width-prose)', margin: '0 auto', padding: 'var(--space-8) var(--space-6)' }}>
        <h1 style={{ font: 'var(--type-title)', color: 'var(--text-strong)', margin: '0 0 4px' }}>
          Hey, Maya 👋
        </h1>
        <p style={{ font: 'var(--type-lead)', color: 'var(--text-muted)', margin: '0 0 var(--space-7)' }}>
          What are we writing today? Type your assignment, or upload a photo or PDF — {tutor ? tutor.name : 'your tutor'} will take it from there.
        </p>

        <Card variant="raised" style={{ padding: 'var(--space-6)' }}>
          <h2 style={{ font: 'var(--type-subhead)', color: 'var(--text-strong)', margin: '0 0 var(--space-4)' }}>
            Start a new session
          </h2>
          <Input multiline rows={4} value={assignment} onChange={e => setAssignment(e.target.value)}
            placeholder="Paste or type your writing assignment here…" />

          {/* Upload affordance — photo of a worksheet or a PDF handout */}
          <input ref={inputRef} type="file" accept="image/*,application/pdf,.pdf" style={{ display: 'none' }}
            onChange={e => pickFile(e.target.files && e.target.files[0])} />

          {file ? (
            <div style={{
              marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--surface-spark)', border: '1.5px solid var(--border-accent)',
            }}>
              <span style={{ width: 34, height: 34, borderRadius: 'var(--radius-sm)', background: 'var(--accent-soft)', color: 'var(--orange-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2v6h6"/><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--text-strong)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
                <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: '2px 0 0' }}>{file.kind} attached · we'll read it for you</p>
              </div>
              <button onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = '' }} aria-label="Remove file" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
          ) : (
            <button
              onClick={() => inputRef.current && inputRef.current.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files && e.dataTransfer.files[0]) }}
              style={{
                marginTop: 'var(--space-3)', width: '100%', cursor: 'pointer', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                borderRadius: 'var(--radius-md)', background: dragging ? 'var(--surface-spark)' : 'var(--surface-muted)',
                border: `1.5px dashed ${dragging ? 'var(--orange-400)' : 'var(--border-strong)'}`,
                transition: 'background var(--dur-base) var(--ease-soft), border-color var(--dur-base) var(--ease-soft)',
              }}>
              <span style={{ width: 34, height: 34, borderRadius: 'var(--radius-pill)', background: 'var(--accent-soft)', color: 'var(--orange-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
              </span>
              <span>
                <span style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--text-strong)', display: 'block' }}>Upload a photo or PDF</span>
                <span style={{ font: 'var(--type-meta)', color: 'var(--text-muted)' }}>Snap your worksheet or drop a handout — JPG, PNG, or PDF</span>
              </span>
            </button>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 'var(--space-4)', alignItems: 'center' }}>
            <Button variant="primary" size="lg" disabled={!canStart} onClick={() => onStart(assignment || `Assignment from ${file.name}`)}>
              Start writing
            </Button>
            <button onClick={() => setAssignment(window.BS_ASSIGNMENT)} style={{
              font: 'var(--type-ui)', color: 'var(--text-link)', background: 'none', border: 'none', cursor: 'pointer',
            }}>Use a sample assignment</button>
          </div>
        </Card>

        <section style={{ marginTop: 'var(--space-8)' }}>
          <h2 style={{ font: 'var(--type-meta)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--text-muted)', margin: '0 0 var(--space-4)' }}>
            Past sessions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {BS_PAST.map((s, i) => (
              <Card key={i} interactive variant="default" style={{ padding: 'var(--space-4) var(--space-5)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ font: 'var(--type-body)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-strong)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</p>
                  <p style={{ font: 'var(--type-meta)', color: 'var(--text-subtle)', margin: '3px 0 0' }}>{s.when}</p>
                </div>
                <Badge tone={s.status === 'complete' ? 'success' : 'neutral'} dot={s.status === 'complete'}>
                  {s.status === 'complete' ? 'Complete' : 'Draft'}
                </Badge>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
window.DashboardScreen = DashboardScreen
