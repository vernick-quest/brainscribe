const { MicButton, ChatBubble, ScribePreview, Button, Badge, Avatar } = window.BrainScribeDesignSystem_eceaf4

function speak(text, onChar, onEnd) {
  if (typeof window === 'undefined' || !window.speechSynthesis) { onEnd && onEnd(); return }
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 0.95
  u.onboundary = (e) => { if (onChar && e.charIndex != null) onChar(e.charIndex) }
  u.onend = () => onEnd && onEnd()
  window.speechSynthesis.speak(u)
}

function deriveTitle(assignment) {
  const q = assignment.match(/["“']([^"”']+)["”']/)
  if (q) return `“${q[1]}” essay`
  const words = assignment.trim().split(/\s+/).slice(0, 6).join(' ')
  return words ? words + '…' : 'New assignment'
}

function SessionScreen({ tutor, assignment, onFinish, onHome }) {
  const script = window.BS_SCRIPT
  const [messages, setMessages] = React.useState([])
  const [paragraphs, setParagraphs] = React.useState([])
  const [turn, setTurn] = React.useState(0)
  const [phase, setPhase] = React.useState('intro')   // intro|listening|recording|scribing|preview|done
  const [pending, setPending] = React.useState(null)
  const [speakingIdx, setSpeakingIdx] = React.useState(null)
  const [spokenChar, setSpokenChar] = React.useState(null)
  const chatRef = React.useRef(null)
  const essayRef = React.useRef(null)
  const t = tutor || { persona: 'sage', name: 'Sage', style: 'Methodical · calm' }

  React.useEffect(() => {
    setMessages([{ role: 'tutor', content: script[0].tutor }])
    setPhase('listening')
  }, [])

  React.useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [messages, phase, pending])
  React.useEffect(() => { if (essayRef.current) essayRef.current.scrollTop = essayRef.current.scrollHeight }, [paragraphs])

  function handleMic() {
    if (phase !== 'listening') return
    setPhase('recording')
    const step = script[turn]
    setTimeout(() => {
      setMessages(m => [...m, { role: 'student', content: step.raw, raw: true }])
      setPhase('scribing')
      setTimeout(() => { setPending(step); setPhase('preview') }, 1100)
    }, 1600)
  }

  function commit(text) {
    setParagraphs(p => [...p, { text, isThin: pending.isThin }])
    setPending(null)
    const next = turn + 1
    if (next < script.length) {
      setMessages(m => [...m, { role: 'tutor', content: script[next].tutor }])
      setTurn(next); setPhase('listening')
    } else { setPhase('done') }
  }

  const essay = paragraphs.map(p => p.text).join('\n\n')

  const railItem = (label, value) => (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <div style={{ font: 'var(--type-meta)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--text-subtle)', marginBottom: 4 }}>{label}</div>
      {value}
    </div>
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-page)' }}>
      {window.AppHeader({ tutor: t, onHome })}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* LEFT RAIL — assignment context */}
        <aside style={{ width: 264, flexShrink: 0, background: 'var(--cream-200)', borderRight: '1px solid var(--border-default)', padding: 'var(--space-5)', overflowY: 'auto' }}>
          <Badge tone="navy">Session</Badge>
          {railItem('Assignment', (
            <p style={{ font: 'var(--type-subhead)', color: 'var(--text-strong)', margin: '6px 0 0', lineHeight: 'var(--leading-snug)' }}>{deriveTitle(assignment)}</p>
          ))}
          {railItem('Prompt', (
            <p style={{ font: 'var(--type-meta)', fontWeight: 'var(--fw-regular)', color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 'var(--leading-relaxed)' }}>{assignment}</p>
          ))}
          {railItem('Tutor', (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <Avatar tutor={t.persona} name={t.name} size="sm" />
              <div>
                <div style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--text-strong)' }}>{t.name}</div>
                <div style={{ font: 'var(--type-meta)', color: 'var(--text-subtle)' }}>{t.style}</div>
              </div>
            </div>
          ))}
          {railItem('Last updated', (
            <p style={{ font: 'var(--type-ui)', color: 'var(--text-muted)', margin: '4px 0 0' }}>Today · just now</p>
          ))}
          {railItem('Progress', (
            <p style={{ font: 'var(--type-ui)', color: 'var(--text-muted)', margin: '4px 0 0' }}>{paragraphs.length} paragraph{paragraphs.length === 1 ? '' : 's'} confirmed</p>
          ))}
        </aside>

        {/* RIGHT — dialog (upper, WIP) over deliverable (lower) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* UPPER — conversation */}
          <section style={{ flex: 1.7, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--surface-card)' }}>
            <div style={{ padding: '12px var(--space-6)', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ font: 'var(--type-meta)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--text-muted)' }}>Working it out</span>
              <span style={{ font: 'var(--type-meta)', color: 'var(--text-subtle)' }}>· talk it through with {t.name}</span>
            </div>

            <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ maxWidth: 680, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {messages.map((m, i) => (
                  <ChatBubble key={i} role={m.role} raw={m.raw} speaking={speakingIdx === i} spokenChar={speakingIdx === i ? spokenChar : null}
                    onSpeak={m.role === 'tutor' ? () => {
                      if (speakingIdx === i) { window.speechSynthesis && window.speechSynthesis.cancel(); setSpeakingIdx(null); setSpokenChar(null); return }
                      setSpeakingIdx(i); setSpokenChar(0)
                      speak(m.content, (c) => setSpokenChar(c), () => { setSpeakingIdx(null); setSpokenChar(null) })
                    } : undefined}>
                    {m.content}
                  </ChatBubble>
                ))}
                {phase === 'scribing' && <p style={{ font: 'var(--type-meta)', color: 'var(--text-subtle)', fontStyle: 'italic', textAlign: 'center' }}>Scribing your answer…</p>}
                {phase === 'preview' && pending && (
                  <ScribePreview paragraph={pending.scribed} isThin={pending.isThin} thinNote={pending.thinNote}
                    onApprove={() => commit(pending.scribed)} onEdit={(x) => commit(x)} onDiscard={() => { setPending(null); setPhase('listening') }} />
                )}
              </div>
            </div>

            {/* Composer / mic dock */}
            <div style={{ padding: 'var(--space-4) var(--space-6)', borderTop: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)', minHeight: 96 }}>
              {(phase === 'listening' || phase === 'recording') && (
                <>
                  <MicButton listening={phase === 'recording'} size="sm" onClick={handleMic} />
                  <span style={{ font: 'var(--type-ui)', color: 'var(--text-muted)' }}>
                    {phase === 'recording' ? 'Listening… tap to stop' : `Tap to speak your answer`}
                  </span>
                </>
              )}
              {phase === 'scribing' && <span style={{ font: 'var(--type-ui)', color: 'var(--text-muted)' }}>One sec…</span>}
              {phase === 'preview' && <span style={{ font: 'var(--type-ui)', color: 'var(--text-muted)' }}>Review your paragraph above ↑</span>}
              {phase === 'done' && <Badge tone="success" dot>All done — great work!</Badge>}
            </div>
          </section>

          {/* LOWER — deliverable */}
          <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--cream-50)', borderTop: '2px solid var(--border-accent)' }}>
            <div style={{ padding: '12px var(--space-6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--text-strong)' }}>Your essay</span>
                <Badge tone="neutral">{paragraphs.length} paragraph{paragraphs.length === 1 ? '' : 's'}</Badge>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {paragraphs.length > 0 && <Button variant="ghost" size="sm" onClick={() => navigator.clipboard && navigator.clipboard.writeText(essay)}>Copy</Button>}
                {phase === 'done' && <Button variant="primary" size="sm" onClick={onFinish}>Finish &amp; save</Button>}
              </div>
            </div>
            <div ref={essayRef} style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-5) var(--space-6)' }}>
              <div style={{ maxWidth: 680, margin: '0 auto' }}>
                {paragraphs.length === 0 ? (
                  <p style={{ font: 'var(--type-body)', color: 'var(--text-subtle)', fontStyle: 'italic' }}>
                    Paragraphs you confirm move down here and become your finished essay.
                  </p>
                ) : paragraphs.map((p, i) => (
                  <p key={i} style={{ font: 'var(--type-lead)', color: 'var(--text-body)', marginBottom: 'var(--space-4)' }}>
                    {p.text}
                    {p.isThin && <span style={{ font: 'var(--type-meta)', color: 'var(--amber-500)', fontStyle: 'italic', marginLeft: 8 }}>(building on this)</span>}
                  </p>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
window.SessionScreen = SessionScreen
